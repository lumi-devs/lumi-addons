#!/usr/bin/env bun
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const SKIP: Record<string, true> = {
  node_modules: true,
  scripts: true,
  ".lumi": true,
  dist: true,
  coverage: true,
};
const ALLOWED_PACKAGES = [
  "@lumi/module-kit",
  "@lumi/foundation",
  "@lumi/ui",
];

function isAllowedImport(specifier: string): boolean {
  if (specifier.startsWith("node:") || specifier.startsWith("bun:")) {
    return true;
  }
  if (specifier === "discord.js" || specifier === "zod") return true;
  return ALLOWED_PACKAGES.some(
    (pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`),
  );
}

const ManifestRequired = [
  "apiVersion",
  "name",
  "displayName",
  "emoji",
  "description",
  "version",
  "entry",
  "endUserDataStatement",
] as const;

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function validateManifest(dir: string, raw: string): string[] {
  const errors: string[] = [];
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    return [`manifest.json is not valid JSON: ${(error as Error).message}`];
  }

  for (const key of ManifestRequired) {
    if (!(key in manifest)) errors.push(`manifest.json missing "${key}"`);
  }
  if (manifest.apiVersion !== 2) errors.push('apiVersion must be 2');
  if (manifest.name !== dir) {
    errors.push(`manifest.name "${String(manifest.name)}" must match directory "${dir}"`);
  }
  if (
    typeof manifest.description === "string" &&
    manifest.description.length > 200
  ) {
    errors.push("description must be 200 characters or fewer");
  }
  if (typeof manifest.version === "string" && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push("version must be semver (x.y.z)");
  }
  if (typeof manifest.entry !== "string" || manifest.entry.length === 0) {
    errors.push("entry must be a non-empty string");
  }
  if ("supermodule" in manifest || "submodules" in manifest) {
    errors.push("supermodules are not supported in API v2");
  }
  if (
    "configFields" in manifest &&
    manifest.configFields !== undefined &&
    !Array.isArray(manifest.configFields)
  ) {
    errors.push("configFields must be an array");
  }
  if (Array.isArray(manifest.configFields)) {
    for (const field of manifest.configFields) {
      if (
        !field ||
        typeof field !== "object" ||
        typeof (field as Record<string, unknown>).key !== "string"
      ) {
        errors.push("every configFields entry must have a string key");
      }
    }
  }
  for (const key of ["requirements", "conflicts"] as const) {
    if (
      key in manifest &&
      manifest[key] !== undefined &&
      (!Array.isArray(manifest[key]) ||
        (manifest[key] as unknown[]).some(
          (value) => typeof value !== "string",
        ))
    ) {
      errors.push(`${key} must be an array of strings`);
    }
  }
  if (
    "capabilities" in manifest &&
    manifest.capabilities !== undefined &&
    !Array.isArray(manifest.capabilities)
  ) {
    errors.push("capabilities must be an array");
  }
  return errors;
}

async function listTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...(await listTsFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

async function validateImports(addonDir: string): Promise<string[]> {
  const errors: string[] = [];
  const files = await listTsFiles(addonDir);
  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    const specifiers = [
      ...source.matchAll(
        /(?:import|export)\s+(?:type\s+)?(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/g,
      ),
    ].map((match) => match[1]).filter((value): value is string => value !== undefined);

    for (const specifier of specifiers) {
      if (specifier.startsWith(".")) {
        if (!specifier.endsWith(".js")) {
          errors.push(`${path.relative(addonDir, file)}: relative import "${specifier}" must end in .js`);
        }
        const resolved = path.resolve(path.dirname(file), specifier);
        if (!resolved.startsWith(addonDir + path.sep)) {
          errors.push(`${path.relative(addonDir, file)}: import "${specifier}" escapes the addon`);
        }
        continue;
      }
      if (!isAllowedImport(specifier)) {
        errors.push(`${path.relative(addonDir, file)}: import "${specifier}" is not part of the addon API`);
      }
    }
  }
  return errors;
}

async function validateAddon(name: string): Promise<string[]> {
  const dir = path.join(ROOT, name);
  const errors: string[] = [];
  const manifestPath = path.join(dir, "manifest.json");

  if (!(await exists(manifestPath))) {
    return ["missing manifest.json"];
  }

  const manifestErrors = validateManifest(name, await fs.readFile(manifestPath, "utf8"));
  errors.push(...manifestErrors);

  let entry = "index.ts";
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
      entry?: unknown;
    };
    if (typeof manifest.entry === "string" && manifest.entry.length > 0) {
      entry = manifest.entry;
    }
  } catch {}

  const entryPath = path.join(dir, entry);
  if (!(await exists(entryPath))) {
    errors.push(`entry file "${entry}" does not exist`);
  } else {
    const source = await fs.readFile(entryPath, "utf8");
    if (!/\bexport\s+default\b/.test(source)) {
      errors.push(`entry file "${entry}" must default-export the module`);
    }
  }

  if (!(await exists(path.join(dir, "README.md")))) {
    errors.push("missing README.md");
  }

  errors.push(...(await validateImports(dir)));
  return errors;
}

async function main(): Promise<void> {
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  const addons = entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        !SKIP[entry.name],
    )
    .map((entry) => entry.name)
    .sort();

  if (addons.length === 0) {
    console.error("No addons found.");
    process.exit(1);
  }

  let failures = 0;
  for (const addon of addons) {
    const errors = await validateAddon(addon);
    if (errors.length === 0) {
      console.log(`ok   ${addon}`);
      continue;
    }
    failures += 1;
    console.error(`FAIL ${addon}`);
    for (const error of errors) console.error(`     - ${error}`);
  }

  console.log(`\n${addons.length - failures}/${addons.length} addons passed.`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
