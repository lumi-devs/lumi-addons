import type { Guild } from "discord.js";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { Type } from "@google/genai";

// 1. Tool Schemas for Gemini
// Cast to any to avoid strict type mismatch with Google SDK definitions
export const aiToolDeclarations: any[] = [
  {
    name: "get_user_info",
    description: "Fetches details about a specific user in the Discord server.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        userIdOrName: {
          type: Type.STRING,
          description: "The ID, username, or nickname of the user to look up.",
        },
      },
      required: ["userIdOrName"],
    },
  },
  {
    name: "get_channel_info",
    description: "Fetches details about a specific channel in the Discord server.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        channelNameOrId: {
          type: Type.STRING,
          description: "The name or ID of the channel to look up.",
        },
      },
      required: ["channelNameOrId"],
    },
  },
  {
    name: "search_docs",
    description: "Searches the server's knowledge base (documents) for information.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "The search query to look for in the documents.",
        },
      },
      required: ["query"],
    },
  },
];

// 2. Tool Implementations

export async function getUserInfo(
  guild: Guild,
  userIdOrName: string,
): Promise<string> {
  try {
    const members = await guild.members.fetch({ query: userIdOrName, limit: 1 });
    const member = members.first();
    if (!member) {
      try {
        const m = await guild.members.fetch(userIdOrName);
        if (m) {
          const roles = m.roles.cache.map((r) => r.name).join(", ");
          return `User: ${m.user.tag} (ID: ${m.id})\nNickname: ${m.nickname ?? "None"}\nRoles: ${roles}\nJoined at: ${m.joinedAt?.toISOString()}`;
        }
      } catch {
        return `User '${userIdOrName}' not found in the server.`;
      }
    } else {
      const roles = member.roles.cache.map((r) => r.name).join(", ");
      return `User: ${member.user.tag} (ID: ${member.id})\nNickname: ${member.nickname ?? "None"}\nRoles: ${roles}\nJoined at: ${member.joinedAt?.toISOString()}`;
    }
  } catch (error: any) {
    return `Error fetching user info: ${error.message}`;
  }
  return `User '${userIdOrName}' not found in the server.`;
}

export async function getChannelInfo(
  guild: Guild,
  channelNameOrId: string,
): Promise<string> {
  try {
    const channels = await guild.channels.fetch();
    const cleanName = channelNameOrId.replace(/^#/, "");
    const channel = channels.find(
      (c) => c && (c.id === cleanName || c.name.toLowerCase() === cleanName.toLowerCase())
    );

    if (!channel) {
      return `Channel '${channelNameOrId}' not found in the server.`;
    }

    let info = `Channel Name: #${channel.name} (ID: ${channel.id})\nType: ${channel.type}`;
    if ("topic" in channel && channel.topic) {
      info += `\nTopic: ${channel.topic}`;
    }
    if (channel.parent) {
      info += `\nCategory: ${channel.parent.name}`;
    }
    return info;
  } catch (error: any) {
    return `Error fetching channel info: ${error.message}`;
  }
}

export async function searchDocs(query: string): Promise<string> {
  try {
    // Look in lumi root dir for data/server-knowledge
    // This is assuming the process is run from the lumi root
    const docsDir = join(process.cwd(), "data", "server-knowledge");
    const files = await readdir(docsDir).catch(() => []);
    
    if (files.length === 0) {
      return "No documents found in the server knowledge base.";
    }

    const mdFiles = files.filter(f => f.endsWith('.md') || f.endsWith('.txt'));
    let combinedKnowledge = "";

    let totalLines = 0;
    
    for (const file of mdFiles) {
      const content = await readFile(join(docsDir, file), "utf-8");
      const lines = content.split('\n');
      totalLines += lines.length;
      
      const matchedLines = lines.filter(l => l.toLowerCase().includes(query.toLowerCase()));
      if (matchedLines.length > 0) {
        combinedKnowledge += `\n--- From document ${file} ---\n`;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line && line.toLowerCase().includes(query.toLowerCase())) {
            combinedKnowledge += `...${lines[Math.max(0, i-1)]}\n`;
            combinedKnowledge += `${lines[i]}\n`;
            combinedKnowledge += `${lines[Math.min(lines.length-1, i+1)]}...\n`;
          }
        }
      }
    }

    if (combinedKnowledge.trim() === "") {
      if (totalLines < 1000) {
        let allDocs = "";
        for (const file of mdFiles) {
          const content = await readFile(join(docsDir, file), "utf-8");
          allDocs += `\n--- Document ${file} ---\n${content}\n`;
        }
        return `No exact match for '${query}', but here is the full knowledge base context:\n${allDocs.slice(0, 15000)}`;
      }
      return `No matches found for '${query}' in the documents.`;
    }

    return `Search results for '${query}':\n${combinedKnowledge.slice(0, 15000)}`;
  } catch (error: any) {
    return `Error searching docs: ${error.message}`;
  }
}

export async function handleToolCall(
  name: string,
  args: any,
  guild: Guild
): Promise<any> {
  switch (name) {
    case "get_user_info":
      return { info: await getUserInfo(guild, args.userIdOrName) };
    case "get_channel_info":
      return { info: await getChannelInfo(guild, args.channelNameOrId) };
    case "search_docs":
      return { info: await searchDocs(args.query) };
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
