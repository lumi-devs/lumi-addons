import type { Guild, TextBasedChannel } from "discord.js";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { searchInternet } from "./internet-search.js";

export const aiToolDeclarations = [
  {
    type: "function",
    function: {
      name: "close_ticket",
      description: "Closes and archives the current support ticket thread if the user's issue is fully resolved.",
      parameters: { type: "object", properties: {}, required: [] },
    }
  },
  {
    type: "function",
    function: {
      name: "search_internet",
      description: "Searches the internet for real-time information.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." },
        },
        required: ["query"],
      },
    }
  },
  {
    type: "function",
    function: {
      name: "search_docs",
      description: "Searches the server's knowledge base (documents) for information.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." },
        },
        required: ["query"],
      },
    }
  },
  {
    type: "function",
    function: {
      name: "get_user_info",
      description: "Fetches details about a specific user in the server.",
      parameters: {
        type: "object",
        properties: {
          userIdOrName: { type: "string", description: "ID, username, or nickname." },
        },
        required: ["userIdOrName"],
      },
    }
  },
  {
    type: "function",
    function: {
      name: "search_user_history",
      description: "Searches recent messages from a user in the current channel.",
      parameters: {
        type: "object",
        properties: {
          userIdOrName: { type: "string", description: "ID or username of the author." },
          query: { type: "string", description: "Optional text to filter messages by." },
        },
        required: ["userIdOrName"],
      },
    }
  }
];

export async function getUserInfo(guild: Guild, userIdOrName: string): Promise<string> {
  try {
    const members = await guild.members.fetch({ query: userIdOrName, limit: 1 });
    const member = members.first();
    if (!member) {
      try {
        const m = await guild.members.fetch(userIdOrName);
        if (m) {
          const roles = m.roles.cache.map((r) => r.name).join(", ");
          return `User: ${m.user.tag}\nID: ${m.id}\nRoles: ${roles}`;
        }
      } catch {
        return `User '${userIdOrName}' not found.`;
      }
    } else {
      const roles = member.roles.cache.map((r) => r.name).join(", ");
      return `User: ${member.user.tag}\nID: ${member.id}\nRoles: ${roles}`;
    }
  } catch (error: any) {
    return `Error fetching user info: ${error.message}`;
  }
  return `User '${userIdOrName}' not found.`;
}

export async function searchDocs(query: string): Promise<string> {
  try {
    const docsDir = join(process.cwd(), "data", "server-knowledge");
    const files = await readdir(docsDir).catch(() => []);
    if (files.length === 0) return "No documents found in knowledge base.";

    const mdFiles = files.filter((f) => f.endsWith('.md') || f.endsWith('.txt'));
    let combined = "";

    for (const file of mdFiles) {
      const content = await readFile(join(docsDir, file), "utf-8");
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(query.toLowerCase())) {
          combined += `\n[${file}]: ...${lines[i]}...\n`;
        }
      }
    }

    if (!combined.trim()) return `No matches found for '${query}'.`;
    return combined.slice(0, 5000);
  } catch (error: any) {
    return `Error searching docs: ${error.message}`;
  }
}

export async function searchUserHistory(channel: TextBasedChannel, userIdOrName: string, query?: string): Promise<string> {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    let userMsgs = messages.filter(
      (m) => m.author.id === userIdOrName || m.author.username.toLowerCase() === userIdOrName.toLowerCase()
    );

    if (query) {
      userMsgs = userMsgs.filter((m) => m.content.toLowerCase().includes(query.toLowerCase()));
    }

    if (userMsgs.size === 0) return `No recent messages found from ${userIdOrName}.`;

    const msgsArray = Array.from(userMsgs.values()).map(m => `[${m.createdAt.toISOString()}] ${m.content}`);
    return `Recent messages:\n${msgsArray.join("\n")}`.slice(0, 5000);
  } catch (error: any) {
    return `Error fetching history: ${error.message}`;
  }
}

export async function handleToolCall(name: string, args: any, guild: Guild, channel: TextBasedChannel): Promise<any> {
  switch (name) {
    case "close_ticket":
      if (channel.isThread()) {
        await channel.setArchived(true, "Resolved by AI Support");
        return { info: "Ticket thread archived successfully. Do not reply to the user anymore, as the ticket is closed." };
      }
      return { error: "Cannot close ticket: not currently inside a thread." };
    case "search_internet": return { info: await searchInternet(args.query) };
    case "search_docs": return { info: await searchDocs(args.query) };
    case "get_user_info": return { info: await getUserInfo(guild, args.userIdOrName) };
    case "search_user_history": return { info: await searchUserHistory(channel, args.userIdOrName, args.query) };
    default: return { error: `Unknown tool: ${name}` };
  }
}
