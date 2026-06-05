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

export async function processAiRequest(
  apiUrl: string,
  apiKey: string,
  modelName: string,
  question: string,
  guild: Guild,
  channel: TextBasedChannel,
  history: Array<{ role: string; parts: Array<{ text: string }> }> = []
): Promise<string> {
  const messages: OpenAIMessage[] = [
    {
      role: "system",
      content: [
        "You are an advanced AI assistant in a Discord server.",
        "Answer the user directly and conversationally. For greetings, small talk, or anything you already know, just reply normally — do NOT use any tools.",
        "You have tools to search the internet, read local documents, and look up user info/messages. Use a tool ONLY when the user clearly needs real-time, external, or server-specific information you don't already have.",
        "When you do use a tool, invoke it via the function-calling mechanism. NEVER write out your reasoning about which tool to call, and never describe a tool call in prose — either call the tool or give the user a normal answer.",
        "Always respond using beautiful Markdown formatting. Use codeblocks with the correct language identifier when providing code or configs. Be helpful, concise, and smart."
      ].join(" ")
    }
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
  let forcePlainAnswer = false;

  while (attempts < 5) {
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

        const result = await handleToolCall(call.function.name, args, guild, channel);
        
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
