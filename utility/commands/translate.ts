import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import { translationCard } from "../ui.js";

const ModuleName = "utility";
const DEFAULT_TARGET = "en";
const MAX_INPUT_LENGTH = 2000;
const MAX_OUTPUT_LENGTH = 3800;
const REQUEST_TIMEOUT_MS = 10_000;
const CODE_PATTERN = /^[a-z]{2,3}(?:-[a-z]{2,4})?$/i;

const LANGUAGE_NAMES: Record<string, string> = {
  english: "en",
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  portuguese: "pt",
  "brazilian portuguese": "pt-BR",
  russian: "ru",
  japanese: "ja",
  chinese: "zh-CN",
  "simplified chinese": "zh-CN",
  "traditional chinese": "zh-TW",
  korean: "ko",
  arabic: "ar",
  hindi: "hi",
  dutch: "nl",
  polish: "pl",
  turkish: "tr",
  swedish: "sv",
  ukrainian: "uk",
  vietnamese: "vi",
  thai: "th",
  indonesian: "id",
  danish: "da",
  finnish: "fi",
  norwegian: "no",
  czech: "cs",
  greek: "el",
  hebrew: "he",
  hungarian: "hu",
  romanian: "ro",
  bulgarian: "bg",
  croatian: "hr",
  serbian: "sr",
  slovak: "sk",
  slovenian: "sl",
  estonian: "et",
  latvian: "lv",
  lithuanian: "lt",
  catalan: "ca",
  filipino: "tl",
  malay: "ms",
  persian: "fa",
  urdu: "ur",
  bengali: "bn",
  tamil: "ta",
  telugu: "te",
  marathi: "mr",
  gujarati: "gu",
  punjabi: "pa",
  swahili: "sw",
  afrikaans: "af",
};

export interface Translation {
  text: string;
  source: string | null;
}

export function resolveLanguage(input: string | null | undefined): string | null {
  const key = (input ?? "").trim().toLowerCase();
  if (!key) return null;
  const named = LANGUAGE_NAMES[key];
  if (named) return named;
  return CODE_PATTERN.test(key) ? key : null;
}

export function parseGtxResponse(data: unknown): Translation | null {
  if (!Array.isArray(data)) return null;
  const root: readonly unknown[] = data;
  const segments = root[0];
  if (!Array.isArray(segments)) return null;
  const segmentList: readonly unknown[] = segments;
  let text = "";
  for (const segment of segmentList) {
    if (!Array.isArray(segment)) continue;
    const fields: readonly unknown[] = segment;
    const value = fields[0];
    if (typeof value === "string") text += value;
  }
  text = text.trim();
  if (!text) return null;
  const rawSource = root[2];
  const source =
    typeof rawSource === "string" && rawSource.length > 0 ? rawSource : null;
  return { text, source };
}

async function fetchTranslation(
  text: string,
  target: string,
): Promise<{ ok: true; value: Translation } | { ok: false; error: string }> {
  const url =
    "https://translate.googleapis.com/translate_a/single" +
    `?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, error: "The translation service did not respond in time." };
    }
    return { ok: false, error: "Could not reach the translation service." };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: `The translation service returned HTTP ${response.status}.`,
    };
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, error: "The translation service returned an invalid response." };
  }
  const parsed = parseGtxResponse(data);
  if (!parsed) {
    return { ok: false, error: "The translation service returned no translated text." };
  }
  return { ok: true, value: parsed };
}

export const translateCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("translate")
    .setDescription("Translate text and auto-detect the source language.")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("Text to translate")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("target")
        .setDescription("Target language code or name (default: English)")
        .setRequired(false),
    ),
  async execute(interaction, services) {
    const guildId = interaction.guildId;
    if (guildId && !services.modules.isEnabled(guildId, ModuleName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Module Disabled", "The Utility module is disabled in this server."),
        ),
      );
      return;
    }
    const rawText = interaction.options.getString("text", true).trim();
    if (!rawText) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Nothing to Translate", "Provide the text you want to translate."),
        ),
      );
      return;
    }
    const targetToken = interaction.options.getString("target")?.trim() ?? "";
    let target = DEFAULT_TARGET;
    if (targetToken) {
      const resolved = resolveLanguage(targetToken);
      if (!resolved) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Unknown Language",
              `I do not recognise "${targetToken}". Use a code like "es" or a name like "Spanish".`,
            ),
          ),
        );
        return;
      }
      target = resolved;
    }
    const inputTruncated = rawText.length > MAX_INPUT_LENGTH;
    const text = inputTruncated ? rawText.slice(0, MAX_INPUT_LENGTH) : rawText;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await fetchTranslation(text, target);
    if (!result.ok) {
      await interaction.editReply(makeErrorCard("Translation Failed", result.error));
      return;
    }
    const outputTruncated = result.value.text.length > MAX_OUTPUT_LENGTH;
    const output = outputTruncated
      ? result.value.text.slice(0, MAX_OUTPUT_LENGTH)
      : result.value.text;
    await interaction.editReply(
      translationCard({
        text: output,
        source: result.value.source,
        target,
        inputTruncated,
        outputTruncated,
      }),
    );
  },
};
