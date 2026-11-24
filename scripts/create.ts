import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

function titleCase(str: string): string {
  return str
    .split(/[-_ ]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.log(`
Lumi Add-on Scaffolder (Create a new official add-on)

Usage:
  bun run create <name> [options]

Options:
  --display="<name>"    Display name (default: Title Case of name)
  --desc="<text>"       Description (default: "A custom add-on for Lumi v2.")
  --category="<cat>"    Category (default: "Add-ons")

Example:
  bun run create poll-master --display="Poll Master"
`);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const rawName = args[0]!.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  let displayName = titleCase(rawName);
  let description = `A custom add-on for Lumi v2.`;
  let category = "Add-ons";

  for (const arg of args.slice(1)) {
    if (arg.startsWith("--display=")) displayName = arg.slice("--display=".length);
    else if (arg.startsWith("--desc=")) description = arg.slice("--desc=".length);
    else if (arg.startsWith("--category=")) category = arg.slice("--category=".length);
  }

  const targetDir = path.join(ROOT, rawName);
  if (fs.existsSync(targetDir)) {
    console.error(`Error: Add-on directory "${rawName}" already exists.`);
    process.exit(1);
  }

  fs.mkdirSync(path.join(targetDir, "tests"), { recursive: true });

  const manifest = {
    apiVersion: 2,
    name: rawName,
    displayName,
    emoji: "🔌",
    description,
    version: "1.0.0",
    category,
    entry: "index.ts",
    endUserDataStatement: "This module stores configuration per guild. No personal user data is persisted.",
    configFields: [
      {
        key: "enabled",
        name: "Module Enabled",
        type: "boolean",
        description: `Toggle ${displayName} functionality.`,
        defaultValue: true,
      },
    ],
  };

  fs.writeFileSync(
    path.join(targetDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const indexSource = `import { defineModule } from "@lumi/module-kit";
import { SlashCommandBuilder } from "discord.js";

export default defineModule({
  name: "${rawName}",
  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("${rawName}")
        .setDescription("Interact with ${displayName}"),
      execute: async (interaction, { services }) => {
        const guildId = interaction.guildId;
        if (guildId && !services.modules.isEnabled(guildId, "${rawName}")) {
          await interaction.reply({
            content: "${displayName} is currently disabled in this server.",
            ephemeral: true,
          });
          return;
        }

        await interaction.reply({
          content: \`Hello from **${displayName}**! Operating smoothly on \${interaction.client.user.username}.\`,
          ephemeral: true,
        });
      },
    },
  ],
  listeners: [
    {
      event: "ready",
      handler: async (client, { services }) => {
        services.logger.info("${displayName} add-on loaded successfully.");
      },
    },
  ],
});
`;
  fs.writeFileSync(path.join(targetDir, "index.ts"), indexSource);

  const readmeSource = `# ${displayName}

${description}

## Commands
- \`/${rawName}\`: Interact with ${displayName}

## Configuration
- \`enabled\` (boolean, default \`true\`): Enable or disable ${displayName} in this guild.
`;
  fs.writeFileSync(path.join(targetDir, "README.md"), readmeSource);

  const testSource = `import { describe, expect, it } from "bun:test";
import mod from "../index.js";

describe("${rawName} add-on", () => {
  it("exports valid module definition matching manifest", () => {
    expect(mod.name).toBe("${rawName}");
    expect(mod.commands?.length).toBeGreaterThan(0);
    expect(mod.listeners).toBeDefined();
  });
});
`;
  fs.writeFileSync(path.join(targetDir, "tests", `${rawName}.test.ts`), testSource);

  console.log(`
🎉 Successfully scaffolded add-on "${displayName}" in:
   ${targetDir}

Next steps:
  1. Link to Lumi bot: sh scripts/link.sh ${rawName}
  2. Run validation:  bun run validate
  3. Run typecheck:   bun run typecheck
  4. Run tests:       bun test
`);
}

main();
