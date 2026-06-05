import { ChannelType, type Guild, type GuildMember, type TextBasedChannel } from "discord.js";
import { container } from "@sapphire/framework";
import { fetch as sfetch, FetchResultTypes } from "@sapphire/fetch";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import os from "node:os";
import { searchInternet } from "./internet-search.js";
import type { AiAuthor } from "./ai-executor.js";

const DOCS_DIR = join(process.cwd(), "data", "server-knowledge");

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Words the model may use to refer to the person it's talking to. */
const SELF_REFS = new Set(["me", "myself", "i", "my", "mine", "self", "you"]);

/**
 * Resolve a free-text user reference from the model into a concrete ID/query.
 * "me"/"myself"/the asker's own name → the author's ID; `<@123>` mentions are
 * unwrapped to the bare snowflake; everything else passes through as a query.
 */
/** Best-effort parse of a JSON args string the model may send instead of an object. */
function tryParseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Coerce a tool argument into a string — models sometimes send numbers/objects. */
function s(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function resolveUserRef(ref: unknown, author?: AiAuthor): string {
  const trimmed = s(ref).trim();
  if (!trimmed) return author?.id ?? "";

  const lower = trimmed.toLowerCase().replace(/^@/, "");
  if (
    author &&
    (SELF_REFS.has(lower) ||
      lower === author.username.toLowerCase() ||
      lower === author.displayName.toLowerCase() ||
      trimmed === author.id)
  ) {
    return author.id;
  }

  const mention = trimmed.match(/^<@!?(\d+)>$/);
  return mention ? mention[1] : trimmed;
}

/** Render a member into a compact, model-readable profile. */
function describeMember(m: GuildMember): string {
  const roles = m.roles.cache
    .filter((r) => r.id !== m.guild.id) // drop @everyone
    .map((r) => r.name);
  return [
    `Display name: ${m.displayName}`,
    `Username: ${m.user.username}`,
    `User ID: ${m.id}`,
    `Account created: ${m.user.createdAt.toISOString().slice(0, 10)}`,
    m.joinedAt ? `Joined server: ${m.joinedAt.toISOString().slice(0, 10)}` : null,
    `Roles: ${roles.length ? roles.join(", ") : "none"}`,
    m.user.bot ? "This user is a bot." : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function fmtBytes(n: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function msToDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length) parts.push(`${s}s`);
  return parts.join(" ");
}

function channelTypeLabel(type: ChannelType): string {
  switch (type) {
    case ChannelType.GuildText:
      return "text";
    case ChannelType.GuildVoice:
      return "voice";
    case ChannelType.GuildAnnouncement:
      return "announcement";
    case ChannelType.GuildForum:
      return "forum";
    case ChannelType.GuildStageVoice:
      return "stage";
    case ChannelType.GuildCategory:
      return "category";
    case ChannelType.PublicThread:
    case ChannelType.PrivateThread:
    case ChannelType.AnnouncementThread:
      return "thread";
    default:
      return "channel";
  }
}

/** Block loopback / private / link-local hosts so fetch_url can't be used for SSRF. */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

// ── Tool declarations (sent to the model) ───────────────────────────────────

export const aiToolDeclarations = [
  // Actions
  {
    type: "function",
    function: {
      name: "close_ticket",
      description: "Closes and archives the current support ticket thread if the user's issue is fully resolved.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // Internet & time
  {
    type: "function",
    function: {
      name: "search_internet",
      description: "Searches the internet for real-time information. Use for current events, facts, or anything outside your knowledge.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "The search query." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetches a public http(s) web page or API and returns its readable text content. Use to read a link the user shared or follow up on a search result.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "The full http(s) URL to fetch." } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_datetime",
      description: "Returns the current date and time. You do NOT otherwise know the current time, so call this whenever the user asks about now, today, dates, or scheduling.",
      parameters: {
        type: "object",
        properties: { timezone: { type: "string", description: "Optional IANA timezone, e.g. 'America/New_York'. Defaults to UTC." } },
        required: [],
      },
    },
  },
  // Server awareness
  {
    type: "function",
    function: {
      name: "get_server_info",
      description: "Returns stats about the current Discord server: member count, owner, boost tier, channel/role/emoji counts, creation date.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_channels",
      description: "Lists the channels in the server with their type and category.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_channel_info",
      description: "Returns details about a specific channel (topic, type, category, slowmode, NSFW).",
      parameters: {
        type: "object",
        properties: { channelIdOrName: { type: "string", description: "Channel ID, #mention, or name." } },
        required: ["channelIdOrName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_roles",
      description: "Lists the server's roles with member counts and colors.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_role_info",
      description: "Returns details about a role: member count, color, key permissions, and sample members.",
      parameters: {
        type: "object",
        properties: { roleIdOrName: { type: "string", description: "Role ID, @mention, or name." } },
        required: ["roleIdOrName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_info",
      description: "Fetches a member's profile (display name, username, ID, join date, roles). Pass 'me' to reference the person you're talking to.",
      parameters: {
        type: "object",
        properties: { userIdOrName: { type: "string", description: "User ID, username, nickname, @mention, or 'me'." } },
        required: ["userIdOrName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_user",
      description: "Searches for members by partial name or nickname, returning up to 5 matches.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Partial username or nickname to search for." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_user_history",
      description: "Searches recent messages from a specific user in the current channel. Pass 'me' for the asker.",
      parameters: {
        type: "object",
        properties: {
          userIdOrName: { type: "string", description: "User ID, username, or 'me'." },
          query: { type: "string", description: "Optional text to filter messages by." },
        },
        required: ["userIdOrName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_messages",
      description: "Returns the most recent messages in the current channel for conversation context.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", description: "How many messages (1-50, default 20)." } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_emojis",
      description: "Lists the server's custom emojis.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_bot_status",
      description: "Returns the bot's own status: WebSocket ping, uptime, and number of servers it's in.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // Host / system
  {
    type: "function",
    function: {
      name: "get_system_stats",
      description: "Returns host machine stats: CPU model/cores, load average, total/free RAM, OS, and host uptime.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_process_stats",
      description: "Returns the bot process stats: runtime version, PID, process uptime, and memory (RSS/heap) usage.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_disk_usage",
      description: "Returns disk usage (used/total/free) for the bot's working directory.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // Files / knowledge
  {
    type: "function",
    function: {
      name: "search_docs",
      description: "Searches the server's knowledge base (documents) for matching lines.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "The search query." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_docs",
      description: "Lists the documents available in the server's knowledge base.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_doc",
      description: "Reads the full contents of a named document from the knowledge base.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "The document filename (e.g. 'rules.md')." } },
        required: ["name"],
      },
    },
  },
];

// ── Tool implementations ────────────────────────────────────────────────────

export async function getUserInfo(guild: Guild, userIdOrName: string, author?: AiAuthor): Promise<string> {
  const ref = resolveUserRef(userIdOrName, author);
  if (!ref) return "No user reference was provided.";

  // A bare snowflake → fetch directly by ID (covers the resolved "me" case).
  if (/^\d{16,20}$/.test(ref)) {
    try {
      const m = await guild.members.fetch(ref);
      return describeMember(m);
    } catch {
      return `User with ID ${ref} is not a member of this server.`;
    }
  }

  // Otherwise treat it as a username/nickname search.
  try {
    const members = await guild.members.fetch({ query: ref, limit: 1 });
    const member = members.first();
    if (member) return describeMember(member);
    return `No member matching '${ref}' was found in this server.`;
  } catch (error: any) {
    return `Error fetching user info: ${error.message}`;
  }
}

export async function findUser(guild: Guild, query: string): Promise<string> {
  try {
    const members = await guild.members.fetch({ query: query.trim(), limit: 5 });
    if (!members.size) return `No members matching '${query}'.`;
    return members.map((m) => `${m.displayName} (@${m.user.username}, ID ${m.id})`).join("\n");
  } catch (error: any) {
    return `Error searching members: ${error.message}`;
  }
}

export async function searchUserHistory(
  channel: TextBasedChannel,
  userIdOrName: string,
  query?: string,
  author?: AiAuthor,
): Promise<string> {
  const ref = resolveUserRef(userIdOrName, author);
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    let userMsgs = messages.filter(
      (m) => m.author.id === ref || m.author.username.toLowerCase() === ref.toLowerCase(),
    );

    if (query) {
      userMsgs = userMsgs.filter((m) => m.content.toLowerCase().includes(query.toLowerCase()));
    }

    if (userMsgs.size === 0) return `No recent messages found from ${userIdOrName}.`;

    const msgsArray = Array.from(userMsgs.values()).map((m) => `[${m.createdAt.toISOString()}] ${m.content}`);
    return `Recent messages:\n${msgsArray.join("\n")}`.slice(0, 5000);
  } catch (error: any) {
    return `Error fetching history: ${error.message}`;
  }
}

export async function getRecentMessages(channel: TextBasedChannel, limit = 20): Promise<string> {
  try {
    const n = Math.min(Math.max(Math.floor(limit) || 20, 1), 50);
    const messages = await channel.messages.fetch({ limit: n });
    const arr = Array.from(messages.values())
      .reverse()
      .map((m) => `${m.author.username}: ${m.content || "[embed/attachment]"}`);
    return arr.length ? arr.join("\n").slice(0, 5000) : "No recent messages.";
  } catch (error: any) {
    return `Error fetching messages: ${error.message}`;
  }
}

export async function getServerInfo(guild: Guild): Promise<string> {
  const channels = guild.channels.cache;
  const text = channels.filter((c) => c.isTextBased()).size;
  const voice = channels.filter((c) => c.isVoiceBased()).size;
  let owner = guild.ownerId;
  try {
    const o = await guild.fetchOwner();
    owner = `${o.user.username} (${o.id})`;
  } catch {
    /* fall back to raw owner ID */
  }
  return [
    `Server: ${guild.name}`,
    `Server ID: ${guild.id}`,
    `Owner: ${owner}`,
    `Members: ${guild.memberCount}`,
    `Created: ${guild.createdAt.toISOString().slice(0, 10)}`,
    `Boost tier: ${guild.premiumTier} (${guild.premiumSubscriptionCount ?? 0} boosts)`,
    `Channels: ${channels.size} (${text} text, ${voice} voice)`,
    `Roles: ${guild.roles.cache.size}`,
    `Custom emojis: ${guild.emojis.cache.size}`,
  ].join("\n");
}

export function listChannels(guild: Guild): string {
  const lines = guild.channels.cache
    .filter((c) => c.type !== ChannelType.GuildCategory)
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => `#${c.name} [${channelTypeLabel(c.type)}]${c.parent ? ` (in ${c.parent.name})` : ""}`)
    .slice(0, 200);
  return lines.length ? lines.join("\n") : "No channels found.";
}

export function getChannelInfo(guild: Guild, channelIdOrName: string): string {
  const ref = channelIdOrName.replace(/^#/, "").replace(/^<#(\d+)>$/, "$1").trim();
  const ch =
    guild.channels.cache.get(ref) ??
    guild.channels.cache.find((c) => c.name.toLowerCase() === ref.toLowerCase());
  if (!ch) return `No channel matching '${channelIdOrName}' found.`;

  const lines: Array<string | null> = [
    `Channel: #${ch.name}`,
    `ID: ${ch.id}`,
    `Type: ${channelTypeLabel(ch.type)}`,
    ch.parent ? `Category: ${ch.parent.name}` : null,
  ];
  if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) {
    if (ch.topic) lines.push(`Topic: ${ch.topic}`);
    if (ch.rateLimitPerUser) lines.push(`Slowmode: ${ch.rateLimitPerUser}s`);
    lines.push(`NSFW: ${ch.nsfw ? "yes" : "no"}`);
  }
  return lines.filter(Boolean).join("\n");
}

export function listRoles(guild: Guild): string {
  const roles = guild.roles.cache
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => `${r.name} — ${r.members.size} members${r.hexColor !== "#000000" ? `, ${r.hexColor}` : ""}`)
    .slice(0, 150);
  return roles.length ? roles.join("\n") : "No roles.";
}

export function getRoleInfo(guild: Guild, roleIdOrName: string): string {
  const ref = roleIdOrName.replace(/^@/, "").replace(/^<@&(\d+)>$/, "$1").trim();
  const role =
    guild.roles.cache.get(ref) ??
    guild.roles.cache.find((r) => r.name.toLowerCase() === ref.toLowerCase());
  if (!role) return `No role matching '${roleIdOrName}' found.`;

  const perms = role.permissions.toArray().slice(0, 15);
  const members = role.members.map((m) => m.user.username).slice(0, 30);
  return [
    `Role: ${role.name}`,
    `ID: ${role.id}`,
    `Members: ${role.members.size}`,
    `Color: ${role.hexColor}`,
    `Mentionable: ${role.mentionable}`,
    `Displayed separately: ${role.hoist}`,
    `Key permissions: ${perms.length ? perms.join(", ") : "none"}`,
    members.length ? `Sample members: ${members.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function listEmojis(guild: Guild): string {
  const emojis = guild.emojis.cache.map((e) => `:${e.name}: (${e.animated ? "animated" : "static"})`).slice(0, 100);
  return emojis.length ? emojis.join(", ") : "No custom emojis in this server.";
}

export function getBotStatus(): string {
  const c = container.client;
  return [
    `Bot: ${c.user?.username ?? "unknown"}`,
    `WebSocket ping: ${Math.round(c.ws.ping)}ms`,
    `Uptime: ${msToDuration(c.uptime ?? 0)}`,
    `Servers: ${c.guilds.cache.size}`,
  ].join("\n");
}

export function getDateTime(timezone?: string): string {
  const now = new Date();
  if (timezone) {
    try {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        dateStyle: "full",
        timeStyle: "long",
      });
      return `${fmt.format(now)} (${timezone})`;
    } catch {
      return `Unknown timezone '${timezone}'. Use IANA names like 'America/New_York' or 'Europe/London'.`;
    }
  }
  return `${now.toISOString()} (UTC) — Unix timestamp ${Math.floor(now.getTime() / 1000)}`;
}

export async function fetchUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Invalid URL.";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only http(s) URLs are allowed.";
  }
  if (isBlockedHost(parsed.hostname)) {
    return "That host is not allowed (private/loopback address).";
  }
  try {
    const text = await sfetch(parsed.toString(), FetchResultTypes.Text);
    const stripped = text
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return stripped.slice(0, 4000) || "No readable text content at that URL.";
  } catch (error: any) {
    return `Error fetching URL: ${error.message}`;
  }
}

export function getSystemStats(): string {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const load = os.loadavg();
  const cpus = os.cpus();
  return [
    `Host: ${os.hostname()}`,
    `OS: ${os.type()} ${os.release()} (${os.platform()}/${os.arch()})`,
    `CPU: ${cpus[0]?.model?.trim() ?? "unknown"} × ${cpus.length} cores`,
    `Load average (1/5/15m): ${load.map((n) => n.toFixed(2)).join(" / ")}`,
    `Memory: ${fmtBytes(usedMem)} / ${fmtBytes(totalMem)} used (${((usedMem / totalMem) * 100).toFixed(0)}%)`,
    `Host uptime: ${msToDuration(os.uptime() * 1000)}`,
  ].join("\n");
}

export function getProcessStats(): string {
  const m = process.memoryUsage();
  const g = globalThis as unknown as { Bun?: { version: string } };
  const runtime = g.Bun?.version ? `Bun ${g.Bun.version}` : `Node ${process.version}`;
  return [
    `Runtime: ${runtime}`,
    `PID: ${process.pid}`,
    `Process uptime: ${msToDuration(process.uptime() * 1000)}`,
    `Memory RSS (total): ${fmtBytes(m.rss)}`,
    `Heap used: ${fmtBytes(m.heapUsed)} / ${fmtBytes(m.heapTotal)}`,
  ].join("\n");
}

export async function getDiskUsage(): Promise<string> {
  try {
    const fsp = (await import("node:fs/promises")) as unknown as {
      statfs?: (p: string) => Promise<{ blocks: number; bfree: number; bavail: number; bsize: number }>;
    };
    if (typeof fsp.statfs !== "function") return "Disk usage is not available on this runtime.";
    const s = await fsp.statfs(process.cwd());
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    const used = total - free;
    return `Disk (${process.cwd()}): ${fmtBytes(used)} / ${fmtBytes(total)} used (${((used / total) * 100).toFixed(0)}%), ${fmtBytes(free)} free`;
  } catch (error: any) {
    return `Disk usage unavailable: ${error.message}`;
  }
}

export async function searchDocs(query: string): Promise<string> {
  try {
    const files = await readdir(DOCS_DIR).catch(() => [] as string[]);
    const mdFiles = files.filter((f) => f.endsWith(".md") || f.endsWith(".txt"));
    if (mdFiles.length === 0) return "No documents found in knowledge base.";

    let combined = "";
    for (const file of mdFiles) {
      const content = await readFile(join(DOCS_DIR, file), "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          combined += `\n[${file}]: ...${line.trim()}...\n`;
        }
      }
    }

    if (!combined.trim()) return `No matches found for '${query}'.`;
    return combined.slice(0, 5000);
  } catch (error: any) {
    return `Error searching docs: ${error.message}`;
  }
}

export async function listDocs(): Promise<string> {
  const files = (await readdir(DOCS_DIR).catch(() => [] as string[])).filter(
    (f) => f.endsWith(".md") || f.endsWith(".txt"),
  );
  return files.length ? `Available documents:\n${files.join("\n")}` : "No documents in knowledge base.";
}

export async function readDoc(name: string): Promise<string> {
  // Sandbox: only a plain filename inside DOCS_DIR, no traversal or absolute paths.
  const safe = basename(name);
  if (safe !== name.trim() || name.includes("..") || name.includes("/") || name.includes("\\")) {
    return "Invalid document name — only plain filenames in the knowledge base are allowed.";
  }
  if (!/\.(md|txt)$/i.test(safe)) return "Only .md and .txt documents can be read.";

  const full = resolve(DOCS_DIR, safe);
  if (!full.startsWith(resolve(DOCS_DIR) + sep)) return "Access denied.";

  try {
    const content = await readFile(full, "utf-8");
    return content.slice(0, 6000) || `Document '${safe}' is empty.`;
  } catch {
    return `Document '${safe}' not found.`;
  }
}

// ── Dispatch ────────────────────────────────────────────────────────────────

export async function handleToolCall(
  name: string,
  args: any,
  guild: Guild,
  channel: TextBasedChannel,
  author?: AiAuthor,
): Promise<any> {
  // Models occasionally pass JSON instead of an args object, or send numeric IDs.
  if (typeof args === "string") args = (tryParseArgs(args) as Record<string, unknown>) ?? {};
  if (args == null || typeof args !== "object") args = {};

  switch (name) {
    // Actions
    case "close_ticket":
      if (channel.isThread()) {
        await channel.setArchived(true, "Resolved by AI Support");
        return { info: "Ticket thread archived successfully. Do not reply to the user anymore, as the ticket is closed." };
      }
      return { error: "Cannot close ticket: not currently inside a thread." };

    // Internet & time
    case "search_internet":
      return { info: await searchInternet(args.query) };
    case "fetch_url":
      return { info: await fetchUrl(args.url) };
    case "get_datetime":
      return { info: getDateTime(args.timezone) };

    // Server awareness
    case "get_server_info":
      return { info: await getServerInfo(guild) };
    case "list_channels":
      return { info: listChannels(guild) };
    case "get_channel_info":
      return { info: getChannelInfo(guild, args.channelIdOrName) };
    case "list_roles":
      return { info: listRoles(guild) };
    case "get_role_info":
      return { info: getRoleInfo(guild, args.roleIdOrName) };
    case "get_user_info":
      return { info: await getUserInfo(guild, args.userIdOrName, author) };
    case "find_user":
      return { info: await findUser(guild, args.query) };
    case "search_user_history":
      return { info: await searchUserHistory(channel, args.userIdOrName, args.query, author) };
    case "get_recent_messages":
      return { info: await getRecentMessages(channel, args.limit) };
    case "list_emojis":
      return { info: listEmojis(guild) };
    case "get_bot_status":
      return { info: getBotStatus() };

    // Host / system
    case "get_system_stats":
      return { info: getSystemStats() };
    case "get_process_stats":
      return { info: getProcessStats() };
    case "get_disk_usage":
      return { info: await getDiskUsage() };

    // Files / knowledge
    case "search_docs":
      return { info: await searchDocs(args.query) };
    case "list_docs":
      return { info: await listDocs() };
    case "read_doc":
      return { info: await readDoc(args.name) };

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
