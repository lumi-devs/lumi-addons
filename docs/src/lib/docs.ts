import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

export interface DocHeading {
  id: string;
  text: string;
  level: number;
}

export interface DocMetadata {
  title: string;
  description: string;
  slug: string;
  category?: string;
  emoji?: string;
  version?: string;
  author?: string[];
  tags?: string[];
  order?: number;
}

export interface DocPage {
  metadata: DocMetadata;
  contentHtml: string;
  rawMarkdown: string;
  headings: DocHeading[];
}

export interface NavSection {
  title: string;
  emoji?: string;
  items: {
    title: string;
    href: string;
    emoji?: string;
    badge?: string;
    description?: string;
  }[];
}

const CONTENT_ROOT = path.join(process.cwd(), "src/content/docs");

export async function getDocBySlug(slugArray: string[]): Promise<DocPage | null> {
  const relPath = slugArray.join("/");
  const fullPath = path.join(CONTENT_ROOT, `${relPath}.md`);
  const indexPath = path.join(CONTENT_ROOT, relPath, "index.md");

  let targetPath = fullPath;
  try {
    await fs.access(fullPath);
  } catch {
    try {
      await fs.access(indexPath);
      targetPath = indexPath;
    } catch {
      return null;
    }
  }

  const rawFile = await fs.readFile(targetPath, "utf8");
  const { data, content } = matter(rawFile);

  const headings: DocHeading[] = [];
  const renderer = new marked.Renderer();
  renderer.heading = ({ text, depth }) => {
    const cleanText = text.replace(/<[^>]*>/g, "");
    const id = cleanText
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    headings.push({ id, text: cleanText, level: depth });
    return `<h${depth} id="${id}">${text}</h${depth}>`;
  };

  const contentHtml = await marked.parse(content, { renderer });

  const metadata: DocMetadata = {
    title: data.title || slugArray[slugArray.length - 1] || "Documentation",
    description: data.description || "",
    slug: "/" + slugArray.join("/"),
    category: data.category,
    emoji: data.emoji,
    version: data.version,
    author: data.author,
    tags: data.tags,
    order: data.order,
  };

  return {
    metadata,
    contentHtml,
    rawMarkdown: content,
    headings,
  };
}

export async function getAllDocSlugs(): Promise<string[][]> {
  const slugs: string[][] = [];

  async function walk(dir: string, current: string[] = []) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), [...current, entry.name]);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const base = entry.name.replace(/\.md$/, "");
        if (base === "index") {
          if (current.length > 0) slugs.push(current);
        } else {
          slugs.push([...current, base]);
        }
      }
    }
  }

  await walk(CONTENT_ROOT);
  return slugs;
}

export async function getNavSections(): Promise<NavSection[]> {
  return [
    {
      title: "Overview",
      items: [
        { title: "Introduction", href: "/docs", emoji: "⚡" },
        { title: "Getting Started", href: "/docs/guides/getting-started", emoji: "🚀" },
        { title: "Writing Addons", href: "/docs/guides/writing-addons", emoji: "🛠️" },
        { title: "SDK Reference", href: "/docs/guides/sdk-reference", emoji: "📚" },
        { title: "Publishing & Changesets", href: "/docs/guides/publishing-and-changesets", emoji: "📦" },
        { title: "GDPR Compliance", href: "/docs/guides/gdpr-compliance", emoji: "🔒" },
      ],
    },
    {
      title: "First-Party Addons",
      items: [
        { title: "Activity Roles", href: "/docs/addons/activity-roles", emoji: "🎮", description: "Presence-based role automation" },
        { title: "Booster Roles", href: "/docs/addons/booster-roles", emoji: "✨", description: "Custom booster roles & grace period" },
        { title: "Confessions", href: "/docs/addons/confessions", emoji: "🕊️", description: "Anonymous confessions & replies" },
        { title: "DragMe", href: "/docs/addons/dragme", emoji: "🧲", description: "Consent-based voice channel dragging" },
        { title: "Multi Lounge", href: "/docs/addons/multi-lounge", emoji: "🛋️", description: "Auto-scaling dynamic voice lounges" },
        { title: "Promoter", href: "/docs/addons/promoter", emoji: "📣", description: "Rewards for status promotion" },
        { title: "Role Mentions", href: "/docs/addons/rolementions", emoji: "🛡️", description: "Mention tracking & AutoMod protection" },
        { title: "Status Rotator", href: "/docs/addons/status", emoji: "🔁", description: "Global rotating bot presence" },
        { title: "Thread Cleaner", href: "/docs/addons/thread-cleaner", emoji: "🧹", description: "Inactivity thread archiver & sweep" },
        { title: "Utility Tools", href: "/docs/addons/utility", emoji: "🧰", description: "Translator & emoji stealer" },
      ],
    },
  ];
}
