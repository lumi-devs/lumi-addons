#!/usr/bin/env bun
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

const SKIP = new Set(["node_modules", "scripts", "docs", "data", ".lumi"]);

const MANIFEST_REQUIRED = ["name", "displayName", "version", "endUserDataStatement"] as const;

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function validateAddon(dir: string): Promise<string[]> {
  const errors: string[] = [];

  const manifestPath = path.join(dir, "manifest.json");
  if (!(await exists(manifestPath))) {
    errors.push("missing manifest.json");
  } else {
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      for (const field of MANIFEST_REQUIRED) {
        if (!manifest[field]) errors.push(`manifest.json missing '${field}'`);
      }
    } catch {
      errors.push("manifest.json failed to parse");
    }
  }

  const indexPath = path.join(dir, "Index.ts");
  if (!(await exists(indexPath))) {
    errors.push("missing Index.ts");
  } else {
    try {
      const mod = await import(indexPath);
      const exported =
        mod.default ??
        mod.meta ??
        Object.values(mod).find(
          (v) => typeof v === "object" && v !== null && (v as Record<string, unknown>)["__lumiModule"] === true,
        );
      if (!exported || (exported as Record<string, unknown>)["__lumiModule"] !== true) {
        errors.push("Index.ts export does not have __lumiModule === true");
      }
    } catch (err) {
      errors.push(`Index.ts failed to import: ${String(err)}`);
    }
  }

  const commandsDir = path.join(dir, "commands");
  if (await exists(commandsDir)) {
    const files = (await fs.readdir(commandsDir)).filter((f) => f.endsWith(".ts"));
    for (const file of files) {
      try {
        const cmdMod = await import(path.join(commandsDir, file));
        const defs = Object.entries(cmdMod).filter(([k]) => k.endsWith("Def"));
        if (defs.length === 0) {
          errors.push(`commands/${file}: no *Def exports found`);
          continue;
        }
        for (const [key, def] of defs) {
          const d = def as Record<string, unknown>;
          if (typeof d["name"] !== "string") errors.push(`commands/${file} ${key}: missing 'name' string`);
          if (typeof d["run"] !== "function" && typeof d["handlers"] !== "object") {
            errors.push(`commands/${file} ${key}: missing 'run' function or 'handlers' object`);
          }
        }
      } catch (err) {
        errors.push(`commands/${file} failed to import: ${String(err)}`);
      }
    }
  }

  return errors;
}

async function main() {
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  const addonDirs = entries.filter(
    (e) => e.isDirectory() && !e.name.startsWith(".") && !SKIP.has(e.name),
  );

  let failures = 0;

  for (const entry of addonDirs) {
    const dir = path.join(ROOT, entry.name);
    const errors = await validateAddon(dir);
    if (errors.length > 0) {
      console.log(`✖ ${entry.name}`);
      for (const e of errors) console.log(`    ${e}`);
      failures++;
    } else {
      console.log(`✔ ${entry.name}`);
    }
  }

  console.log(`\n${addonDirs.length - failures}/${addonDirs.length} addons passed.`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
