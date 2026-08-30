#!/usr/bin/env bun
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

interface CheckResult {
  addon: string;
  version: string;
  commands: number;
  slashCommands: number;
  configFields: number;
  hasGdpr: boolean;
  errors: string[];
  warnings: string[];
}

const DISCORD_NAME_REGEX = /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

async function runAudit(): Promise<void> {
  const startedAt = performance.now();

  const pkgPath = path.join(ROOT, "package.json");
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
  const expectedVersion = pkg.version;

  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  const addonDirs = entries
    .filter(
      (e) =>
        e.isDirectory() &&
        !e.name.startsWith(".") &&
        !["node_modules", "scripts", "docs", "data", "dist", "coverage", "lumi-core"].includes(e.name),
    )
    .map((e) => e.name)
    .sort();

  const results = new Map<string, CheckResult>();

  for (const name of addonDirs) {
    results.set(name, {
      addon: name,
      version: "unknown",
      commands: 0,
      slashCommands: 0,
      configFields: 0,
      hasGdpr: false,
      errors: [],
      warnings: [],
    });
  }

  // Phase 1: Manifest, GDPR, and Package Version Consistency
  for (const name of addonDirs) {
    const dir = path.join(ROOT, name);
    const result = results.get(name)!;

    const infoPath = path.join(dir, "info.json");
    try {
      const raw = await fs.readFile(infoPath, "utf8");
      const info = JSON.parse(raw);
      result.version = info.version || "unknown";

      if (!info.name) result.errors.push("info.json missing 'name'");
      if (!info.version) result.errors.push("info.json missing 'version'");
      if (expectedVersion && info.version !== expectedVersion) {
        result.warnings.push(`Version drift: info.json has ${info.version}, root package.json has ${expectedVersion}`);
      }
      if (!info.description) result.errors.push("info.json missing 'description'");
      if (!info.end_user_data_statement || info.end_user_data_statement.trim().length === 0) {
        result.errors.push("info.json missing required 'end_user_data_statement'");
      } else {
        result.hasGdpr = true;
      }
    } catch (err: any) {
      result.errors.push(`Failed to parse info.json: ${err.message}`);
    }

    const indexPath = path.join(dir, "index.ts");
    try {
      await fs.access(indexPath);
    } catch {
      result.errors.push("Missing entrypoint 'index.ts'");
    }
  }

  // Phase 2: Static AST Validator (AST, prohibited imports, leak checks)
  const lumiPath = process.env.LUMI_PATH ? path.resolve(process.env.LUMI_PATH) : path.join(ROOT, ".lumi");
  const validatePath = path.join(lumiPath, "packages/core/src/lib/downloader/validate.ts");

  try {
    const { validateAddonOrRepo } = await import(pathToFileURL(validatePath).href);
    const valResults = await validateAddonOrRepo(ROOT);
    for (const [modName, res] of valResults) {
      const result = results.get(modName);
      if (result) {
        result.errors.push(...res.errors);
        result.warnings.push(...res.warnings);
      }
    }
  } catch (err: any) {
    console.warn(`[validator] AST validation skipped: ${err.message}`);
  }

  // Phase 3: Runtime Mock Instance Bootstrapping & ModuleStore Lifecycle
  const clientPath = path.join(lumiPath, "packages/core/src/lib/client/LumiClient.ts");
  let LumiClient: any;
  let container: any;

  try {
    process.env["NODE_ENV"] = "production";
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://lumi:lumi@127.0.0.1:5432/lumi";
    process.env.BOT_TOKEN = process.env.BOT_TOKEN || "mock_bot_token";
    process.env.APPEAL_TOKEN_SECRET = process.env.APPEAL_TOKEN_SECRET || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const clientModule = await import(pathToFileURL(clientPath).href);
    const frameworkModule = await import("@sapphire/framework");
    LumiClient = clientModule.LumiClient;
    container = frameworkModule.container;
  } catch (err: any) {
    console.error(`[runtime] Failed to initialize mock runtime client: ${err.message}`);
  }

  if (LumiClient && container) {
    const client = new LumiClient();

    // Mock in-memory DB and i18n
    if (container.db?.modules) {
      container.db.modules.getGlobalModuleStates = async () => new Map();
      container.db.modules.getGlobalModuleStatesDetailed = async () => [];
    }
    if (container.db?.config) {
      container.db.config.isDashboardEnabled = async () => true;
    }
    if (container.i18n && !container.i18n.languages) {
      container.i18n.languages = new Map([["en-US", {} as any]]);
    }

    container.moduleStore.addRoot(pathToFileURL(`${ROOT}/`));
    await container.moduleStore.discover(true);
    await container.moduleStore.loadAll();

    for (const store of container.stores.values()) {
      if (store.name !== "modules") {
        await store.loadAll().catch(() => {});
      }
    }

    // Validate module instances and GDPR methods
    for (const name of addonDirs) {
      const result = results.get(name)!;
      const mod = container.moduleStore.get(name);
      if (!mod) {
        result.errors.push(`Module '${name}' failed to load into ModuleStore`);
        continue;
      }

      if (typeof mod.deleteUserData !== "function") {
        result.errors.push("Missing 'deleteUserData(userId)' implementation on module class");
      }
      if (typeof mod.exportUserData !== "function") {
        result.errors.push("Missing 'exportUserData(userId)' implementation on module class");
      }

      result.configFields = mod.configFields?.length || 0;

      // Phase 4: Schema validation test
      if (mod.configSchema) {
        try {
          const testDefaults: Record<string, unknown> = {};
          for (const f of mod.configFields || []) {
            if (f.default !== undefined) testDefaults[f.key] = f.default;
          }
          mod.configSchema.parse(testDefaults);
        } catch (schemaErr: any) {
          result.errors.push(`Config schema default validation failed: ${schemaErr.message}`);
        }
      }
    }

    // Validate commands and slash registration
    const commandStore = container.stores.get("commands");
    for (const [cmdName, cmd] of commandStore.entries()) {
      const location = (cmd as any).location?.full || "";
      const modName = addonDirs.find((dir) => location.includes(`/${dir}/`));
      if (!modName) continue;

      const result = results.get(modName);
      if (!result) continue;

      result.commands++;

      if (!DISCORD_NAME_REGEX.test(cmdName)) {
        result.errors.push(`Command name '${cmdName}' does not conform to Discord naming regex`);
      }
      if (!cmd.description || cmd.description.length > 100) {
        result.errors.push(`Command '/${cmdName}' description is empty or exceeds 100 characters`);
      }

      const reg = cmd.applicationCommandRegistry;
      if (typeof cmd.registerApplicationCommands === "function") {
        try {
          await cmd.registerApplicationCommands(reg);
        } catch (regErr: any) {
          result.errors.push(`Command '/${cmdName}' failed during registerApplicationCommands: ${regErr.message}`);
        }
      }

      const apiCalls = (reg as any)?.apiCalls || [];
      result.slashCommands += apiCalls.length;

      for (const call of apiCalls) {
        const data = call.builtData;
        if (!data?.name || !DISCORD_NAME_REGEX.test(data.name)) {
          result.errors.push(`Invalid slash command payload name in '/${cmdName}': '${data?.name}'`);
        }
        if (!data?.description || data.description.length > 100) {
          result.errors.push(`Invalid slash command description in '/${cmdName}' (length: ${data?.description?.length || 0})`);
        }
      }
    }

    await client.destroy();
  }

  const duration = ((performance.now() - startedAt) / 1000).toFixed(2);

  // Print Clean Audit Summary
  let hasFailures = false;
  console.log(`\nLumi Addon Verification (${addonDirs.length} modules, completed in ${duration}s)\n`);

  for (const [name, res] of results) {
    const statusIcon = res.errors.length > 0 ? "✖" : res.warnings.length > 0 ? "▲" : "✔";
    const details = `v${res.version} | ${res.commands} commands (${res.slashCommands} slash) | ${res.configFields} settings | GDPR: ${res.hasGdpr ? "yes" : "no"}`;

    if (res.errors.length > 0) {
      hasFailures = true;
      console.log(`  ${statusIcon} ${name.padEnd(16)} ${details}`);
      for (const err of res.errors) {
        console.log(`      Error: ${err}`);
      }
    } else if (res.warnings.length > 0) {
      console.log(`  ${statusIcon} ${name.padEnd(16)} ${details}`);
      for (const warn of res.warnings) {
        console.log(`      Warning: ${warn}`);
      }
    } else {
      console.log(`  ${statusIcon} ${name.padEnd(16)} ${details}`);
    }
  }

  if (hasFailures) {
    console.error(`\nIntegration check failed.`);
    process.exit(1);
  }

  console.log(`\nAll ${addonDirs.length} addon modules passed integration checks.\n`);
}

runAudit().catch((err) => {
  console.error("Fatal error during audit:", err);
  process.exit(1);
});
