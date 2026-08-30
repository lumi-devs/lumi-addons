"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, FileText, Package, ArrowRight, CornerDownLeft } from "lucide-react";

interface SearchItem {
  title: string;
  category: string;
  href: string;
  emoji?: string;
  description?: string;
}

const SEARCH_ITEMS: SearchItem[] = [
  { title: "Introduction & Overview", category: "Guides", href: "/docs", emoji: "⚡" },
  { title: "Getting Started", category: "Guides", href: "/docs/guides/getting-started", emoji: "🚀" },
  { title: "Writing Addons", category: "Guides", href: "/docs/guides/writing-addons", emoji: "🛠️" },
  { title: "SDK Reference", category: "Guides", href: "/docs/guides/sdk-reference", emoji: "📚" },
  { title: "Publishing & Changesets", category: "Guides", href: "/docs/guides/publishing-and-changesets", emoji: "📦" },
  { title: "GDPR Compliance", category: "Guides", href: "/docs/guides/gdpr-compliance", emoji: "🔒" },
  { title: "Activity Roles", category: "Addons", href: "/docs/addons/activity-roles", emoji: "🎮", description: "Presence-based role automation" },
  { title: "Booster Roles", category: "Addons", href: "/docs/addons/booster-roles", emoji: "✨", description: "Custom booster roles with grace period" },
  { title: "Confessions", category: "Addons", href: "/docs/addons/confessions", emoji: "🕊️", description: "Anonymous confessions & replies" },
  { title: "DragMe", category: "Addons", href: "/docs/addons/dragme", emoji: "🧲", description: "Voice channel drag requests" },
  { title: "Multi Lounge", category: "Addons", href: "/docs/addons/multi-lounge", emoji: "🛋️", description: "Dynamic scaling voice channels" },
  { title: "Promoter", category: "Addons", href: "/docs/addons/promoter", emoji: "📣", description: "Rewards for status promotions" },
  { title: "Role Mentions", category: "Addons", href: "/docs/addons/rolementions", emoji: "🛡️", description: "Mention tracking & protection" },
  { title: "Status Rotator", category: "Addons", href: "/docs/addons/status", emoji: "🔁", description: "Global rotating presence" },
  { title: "Thread Cleaner", category: "Addons", href: "/docs/addons/thread-cleaner", emoji: "🧹", description: "Inactivity thread archiver" },
  { title: "Utility Tools", category: "Addons", href: "/docs/addons/utility", emoji: "🧰", description: "Translator & emoji stealer" },
];

export function CommandPalette({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  const filtered = query.trim()
    ? SEARCH_ITEMS.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.category.toLowerCase().includes(query.toLowerCase()) ||
          item.description?.toLowerCase().includes(query.toLowerCase()),
      )
    : SEARCH_ITEMS;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      }
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      }
      if (e.key === "Enter" && filtered[selectedIndex]) {
        e.preventDefault();
        router.push(filtered[selectedIndex]!.href);
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filtered, selectedIndex, router, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl rounded-2xl bg-surface border border-border-strong shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-surface-hover/50">
          <Search className="w-5 h-5 text-fg-muted" />
          <input
            type="text"
            placeholder="Search documentation, guides, or addons..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            autoFocus
            className="w-full bg-transparent text-sm text-fg placeholder:text-fg-subtle outline-none"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-surface border border-border text-fg-subtle rounded">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-fg-muted">
              No results found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((item, idx) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  selectedIndex === idx
                    ? "bg-accent/15 text-white"
                    : "text-fg-body hover:bg-surface-hover hover:text-fg"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">{item.emoji || "📄"}</span>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <span>{item.title}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface border border-border text-fg-subtle">
                        {item.category}
                      </span>
                    </div>
                    {item.description && (
                      <div className="text-xs text-fg-muted truncate max-w-sm">{item.description}</div>
                    )}
                  </div>
                </div>
                {selectedIndex === idx && <CornerDownLeft className="w-4 h-4 text-accent shrink-0" />}
              </Link>
            ))
          )}
        </div>

        <div className="px-4 py-2 bg-surface-hover/30 border-t border-border flex items-center justify-between text-[11px] text-fg-subtle">
          <span>Navigate with ↑ and ↓</span>
          <span>Select with Enter</span>
        </div>
      </div>
    </div>
  );
}
