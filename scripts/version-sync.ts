#!/usr/bin/env bun
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const pkgPath = path.join(ROOT, "package.json");
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
  const version = pkg.version || "1.0.0";

  console.log(`[version-sync] Syncing addon versions to v${version}...`);

  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  let updatedCount = 0;

  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.name.startsWith(".") ||
      entry.name === "node_modules" ||
      entry.name === "scripts" ||
      entry.name === "docs" ||
      entry.name === "site"
    ) {
      continue;
    }

    const addonDir = path.join(ROOT, entry.name);
    const infoPath = path.join(addonDir, "info.json");
    if (await pathExists(infoPath)) {
      const info = JSON.parse(await fs.readFile(infoPath, "utf8"));
      info.version = version;
      await fs.writeFile(infoPath, JSON.stringify(info, null, 2) + "\n", "utf8");

      const manifestPath = path.join(addonDir, "manifest.json");
      if (await pathExists(manifestPath)) {
        try {
          const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
          manifest.version = version;
          await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
        } catch {
          // Ignore manifest parse error
        }
      }

      const indexPath = path.join(addonDir, "index.ts");
      if (await pathExists(indexPath)) {
        let indexContent = await fs.readFile(indexPath, "utf8");
        indexContent = indexContent.replace(/version:\s*"[^"]+"/, `version: "${version}"`);
        await fs.writeFile(indexPath, indexContent, "utf8");
      }

      console.log(`  ✓ Updated ${entry.name} -> v${version}`);
      updatedCount++;
    }
  }

  console.log(`[version-sync] Successfully synchronized ${updatedCount} addon(s) to v${version}.`);
}

main().catch((err) => {
  console.error("[version-sync] Failed:", err);
  process.exit(1);
});
