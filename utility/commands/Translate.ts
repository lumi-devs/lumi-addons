import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { makeInfoCard } from "#src/lib/ui/Cards.js";
import { DEFAULT_TARGET, parseGtxResponse, resolveLanguage } from "../utilities/Languages.js";

async function fetchTranslation(
  text: string,
  target: string,
): Promise<{ text: string; source: string | null } | null> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return parseGtxResponse(await res.json() as unknown);
  } catch {
    return null;
  }
}

async function run(ctx: CommandContext): Promise<void> {
  if (ctx.isSlash) await ctx.defer({ ephemeral: false });

  const targetToken = ((await ctx.getString("target")) ?? "").trim() || null;
  const rest = ((await ctx.getString("text", { rest: true })) ?? "").trim();
  const resolved = resolveLanguage(targetToken);

  if (targetToken && !resolved && ctx.isSlash) {
    await ctx.replyError(
      "Unknown Language",
      `I don't recognise "${targetToken}". Use a code like "es" or a name like "Spanish".`,
    );
    return;
  }

  const target = resolved ?? DEFAULT_TARGET;
  const text =
    !ctx.isSlash && targetToken && !resolved
      ? `${targetToken}${rest ? ` ${rest}` : ""}`
      : rest;

  if (!text) {
    await ctx.replyWarning("Nothing to Translate", "Please provide text to translate.");
    return;
  }

  const translated = await fetchTranslation(text, target);
  if (!translated) {
    await ctx.replyError("Translation Failed", "Could not translate text.");
    return;
  }

  await ctx.reply(
    makeInfoCard(
      translated.source ? `Translation (${translated.source} -> ${target})` : "Translation",
      translated.text,
    ),
  );
}

export const translateDef: CommandDef = {
  name: "translate",
  module: "utility",
  description: "Translate text (auto-detects the source language)",
  build: () =>
    new SlashCommandBuilder()
      .setName("translate")
      .setDescription("Translate text (auto-detects the source language)")
      .addStringOption((opt) =>
        opt.setName("text").setDescription("The text to translate").setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("target")
          .setDescription("Target language code or name (default: English)")
          .setRequired(false),
      ),
  run,
};
