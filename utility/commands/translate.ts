import { logger } from "lumi";
import { defineCommand, type CommandContext } from "lumi/commands";
import { fetchJson } from "lumi/net";
import { makeInfoCard } from "lumi/ui";
import {
  DEFAULT_TARGET,
  parseGtxResponse,
  resolveLanguage,
} from "../lib/languages.js";

async function fetchTranslation(
  text: string,
  target: string,
): Promise<{ text: string; source: string | null } | null> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  try {
    return parseGtxResponse(await fetchJson<unknown>(url));
  } catch {
    await logger.error("Translation request failed");
    return null;
  }
}

export default defineCommand({
  name: "translate",
  description: "Translate text (auto-detects the source language)",
  build: () => ({
    name: "translate",
    description: "Translate text (auto-detects the source language)",
    options: [
      {
        type: 3,
        name: "text",
        description: "The text to translate",
        required: true,
      },
      {
        type: 3,
        name: "target",
        description:
          "Target language code or name (default: English)",
        required: false,
      },
    ],
  }),
  run: async (ctx: CommandContext) => {
    if (ctx.isSlash) await ctx.defer();

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
      await ctx.replyWarning(
        "Nothing to Translate",
        "Please provide text to translate.",
      );
      return;
    }

    const translated = await fetchTranslation(text, target);
    if (!translated) {
      await ctx.replyError("Translation Failed", "Could not translate text.");
      return;
    }

    await ctx.reply(
      makeInfoCard(
        translated.source
          ? `Translation (${translated.source} → ${target})`
          : "Translation",
        translated.text,
      ),
    );
  },
});
