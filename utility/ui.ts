import { makeErrorCard, makeInfoCard, makeSuccessCard, type CardReply } from "@lumi/ui";

export interface StolenEmoji {
  name: string;
  id: string;
  animated: boolean;
}

export interface StealOutcome {
  stolen: readonly StolenEmoji[];
  failed: readonly string[];
}

export interface TranslationView {
  text: string;
  source: string | null;
  target: string;
  inputTruncated: boolean;
  outputTruncated: boolean;
}

export function stealResultCard(outcome: StealOutcome): CardReply {
  if (outcome.stolen.length === 0) {
    const body =
      outcome.failed.length > 0
        ? outcome.failed.map((line) => `• ${line}`)
        : ["Nothing was stolen."];
    return makeErrorCard("Steal Failed", body);
  }

  const lines = [
    `**Stolen (${outcome.stolen.length})**`,
    ...outcome.stolen.map((emoji) => {
      const prefix = emoji.animated ? "a" : "";
      return `• <${prefix}:${emoji.name}:${emoji.id}> \`:${emoji.name}:\``;
    }),
  ];
  if (outcome.failed.length > 0) {
    lines.push(
      "",
      `**Failed (${outcome.failed.length})**`,
      ...outcome.failed.map((line) => `• ${line}`),
    );
  }
  return makeSuccessCard("Emojis Stolen", lines);
}

export function translationCard(view: TranslationView): CardReply {
  const notes: string[] = [];
  if (view.inputTruncated) notes.push("Input truncated to 2,000 characters.");
  if (view.outputTruncated) notes.push("Output truncated to 3,800 characters.");
  return makeInfoCard(
    `${view.source ?? "auto"} → ${view.target}`,
    view.text,
    notes.length > 0 ? { footer: notes.join(" ") } : undefined,
  );
}
