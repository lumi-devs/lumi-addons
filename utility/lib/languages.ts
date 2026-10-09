export const DEFAULT_TARGET = "en";

const ALIASES: Record<string, string> = {
  en: "en",
  english: "en",
  es: "es",
  spanish: "es",
  fr: "fr",
  french: "fr",
  de: "de",
  german: "de",
  it: "it",
  italian: "it",
  pt: "pt",
  portuguese: "pt",
  ru: "ru",
  russian: "ru",
  ja: "ja",
  japanese: "ja",
  zh: "zh-CN",
  chinese: "zh-CN",
  "zh-cn": "zh-CN",
  ko: "ko",
  korean: "ko",
  ar: "ar",
  arabic: "ar",
  hi: "hi",
  hindi: "hi",
  nl: "nl",
  dutch: "nl",
  pl: "pl",
  polish: "pl",
  tr: "tr",
  turkish: "tr",
  sv: "sv",
  swedish: "sv",
  uk: "uk",
  ukrainian: "uk",
  vi: "vi",
  vietnamese: "vi",
  th: "th",
  thai: "th",
  id: "id",
  indonesian: "id",
};

export function resolveLanguage(
  input: string | null | undefined,
): string | null {
  const key = (input ?? "").trim().toLowerCase();
  if (!key) return null;
  return ALIASES[key] ?? (/^[a-z]{2}(-[a-z]{2})?$/.test(key) ? key : null);
}

export interface ParsedTranslation {
  text: string;
  source: string | null;
}

export function parseGtxResponse(data: unknown): ParsedTranslation | null {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
  const text = (data[0] as unknown[])
    .map((seg) => (Array.isArray(seg) ? String(seg[0] ?? "") : ""))
    .join("")
    .trim();
  if (!text) return null;
  const raw = (data as unknown[])[2];
  return { text, source: typeof raw === "string" ? raw : null };
}
