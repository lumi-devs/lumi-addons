import { fetch as sfetch, FetchResultTypes } from "@sapphire/fetch";
import { withSpan } from "@lumi/observability";
import { aiToolDeclarations, handleToolCall } from "./ai-tools.js";
import type { Guild, TextBasedChannel } from "discord.js";

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

/** Identity of the person the assistant is currently replying to. */
export interface AiAuthor {
  id: string;
  username: string;
  displayName: string;
}

/**
 * Matches short greetings / pleasantries / acknowledgements where calling a tool
 * is never appropriate. Weak models (e.g. llama-3.1-8b) otherwise "helpfully"
 * fire `search_internet` for a bare "hey", so we short-circuit those to a plain
 * reply. Kept deliberately narrow — anything time/server/host-specific (e.g.
 * "how many members", "what time is it") must NOT match so real tools still run.
 */
const SMALL_TALK =
  /^(?:h(?:i+|ey+|ello+|iya|owdy)|yo+|sup|wass?up|wh?at'?s?\s?up|good\s+(?:morning|afternoon|evening|night)|g(?:m|n)|thanks?(?:\s+you)?|thx|ty|np|no\s+problem|ok(?:ay)?|cool|nice|gg|lol|lmao|haha+|bye|cya|see\s+ya|how(?:'?s| is| are)\b[^?]*)\b[\s!.,…~?]*$/i;

function isSmallTalk(question: string): boolean {
  const t = question.trim();
  if (!t) return true;
  if (t.length > 40) return false;
  return SMALL_TALK.test(t);
}

export async function processAiRequest(
  apiUrl: string,
  apiKey: string,
  modelName: string,
  question: string,
  guild: Guild,
  channel: TextBasedChannel,
  history: Array<{ role: string; parts: Array<{ text: string }> }> = [],
  author?: AiAuthor
): Promise<string> {
  const systemLines = [
    "You are an advanced, autonomous AI assistant operating inside a Discord server.",
    "You have tools to inspect this server (members, roles, channels, emojis, recent messages, server stats), check your own bot status, read the host system (CPU, RAM, disk, uptime, process), get the current date/time, search the internet, fetch web pages, and read a knowledge-base of documents.",
    "Decide for yourself when a tool is needed and call it directly — do not ask the user for permission, and do not narrate which tool you are about to use. Either call the tool or answer.",
    "You can chain tools: call one, read its result, then call another when the first answer feeds the next. Prefer tools over guessing for anything that is live, server-specific, time-sensitive, or about the host.",
    "Only answer from your own memory for things that don't change (general knowledge, definitions, casual conversation). For greetings and small talk, just reply naturally without tools.",
    'Examples — greetings and pleasantries get a plain reply with NO tool call: User: "hey" → Assistant: "Hey! How can I help?"  •  User: "thanks" → Assistant: "Anytime!"  •  User: "how are you?" → Assistant: "Doing great, thanks for asking!". Only reach for a tool when the question genuinely needs live, server-specific, time-sensitive, or host data.',
    "You do NOT inherently know the current time — call get_datetime whenever time or dates matter.",
    "Always respond using clean Discord Markdown. Use fenced codeblocks with the right language for code or configs. Be helpful, concise, and accurate; never invent server data — if a tool says something wasn't found, say so."
  ];

  if (author) {
    // Give the model the asker's identity so "who am I", "my roles", etc. resolve
    // to this person. Tools also accept "me"/"myself" and map it to this ID.
    systemLines.splice(
      1,
      0,
      `You are currently talking to ${author.displayName} (username: ${author.username}, user ID: ${author.id}). When they say "me", "my", "myself", or "I", they mean this person — answer about them directly, and pass "me" to user-lookup tools to reference them.`
    );
  }

  const messages: OpenAIMessage[] = [
    { role: "system", content: systemLines.join(" ") }
  ];

  // Map Gemini-style history to OpenAI format if provided
  for (const h of history) {
    messages.push({
      role: h.role === "model" ? "assistant" : "user",
      content: h.parts.map(p => p.text).join("\n")
    });
  }

  messages.push({ role: "user", content: question || "Hello!" });

  let attempts = 0;
  // Set once a weak model narrates a tool call instead of emitting one; forces a
  // plain-text answer on the retry so the leaked reasoning never reaches the user.
  // Pre-armed for greetings/small-talk so the very first call goes out with
  // tool_choice:"none" — a bare "hey" must never trigger an internet search.
  let forcePlainAnswer = isSmallTalk(question);

  // Allow several rounds so the model can chain tool calls (e.g. find_user →
  // get_user_info → search_user_history) before producing its final answer.
  while (attempts < 8) {
    attempts++;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const body = JSON.stringify({
      model: modelName,
      messages,
      tools: aiToolDeclarations,
      tool_choice: forcePlainAnswer ? "none" : "auto"
    });

    // Wrap the external API call in a distributed trace
    const response: any = await withSpan(
      "ai.inference",
      async () => {
        return sfetch(
          `${apiUrl.replace(/\/$/, "")}/chat/completions`,
          { method: "POST", headers, body },
          FetchResultTypes.JSON
        );
      },
      { attributes: { "ai.model": modelName, "ai.provider": apiUrl } }
    );

    const message = response.choices[0].message;
    messages.push(message);

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const call of message.tool_calls) {
        if (call.type !== "function") continue;
        
        let args = {};
        try {
          args = JSON.parse(call.function.arguments);
        } catch (e) {
          // ignore parsing error
        }

        const result = await handleToolCall(call.function.name, args, guild, channel, author);
        
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(result)
        });
      }
    } else {
      const content = message.content || "";

      // Weak models sometimes describe the tool they'd call ("the function call that
      // best answers the prompt is a search…") in plain text instead of emitting a
      // structured tool_call. Detect that once and retry with tools disabled so the
      // model is forced to actually answer the user.
      const looksLikeToolNarration =
        /\b(the\s+)?function call\b|\btool call\b|\bbest answers the prompt\b|\bi (?:would|will|should|could|can|need to) (?:search|call|use|invoke|look up)\b/i.test(
          content
        );

      if (looksLikeToolNarration && !forcePlainAnswer) {
        forcePlainAnswer = true;
        messages.push({
          role: "user",
          content:
            "Do not describe or narrate any tool usage. Answer my previous message directly and conversationally."
        });
        continue;
      }

      return content || "I processed the request, but have no text to return.";
    }
  }

  return "Tool execution limits reached without a final answer.";
}
