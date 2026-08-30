"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Menu, X, Sparkles, BookOpen, Layers } from "lucide-react";
import { VersionSelector } from "./version-selector";
import { CommandPalette } from "./command-palette";

export function Header({
  onToggleSidebar,
}: {
  onToggleSidebar?: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 w-full glass border-b border-border/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            {onToggleSidebar && (
              <button
                onClick={onToggleSidebar}
                className="lg:hidden p-2 rounded-lg text-fg-muted hover:text-fg hover:bg-surface"
                title="Toggle Sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-base shadow-lg shadow-accent/20 group-hover:scale-105 transition-transform">
                L
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-fg text-sm tracking-tight flex items-center gap-1.5">
                  Lumi Addons
                  <span className="px-1.5 py-0.2 rounded bg-accent/15 text-accent text-[10px] font-semibold">
                    SDK
                  </span>
                </span>
                <span className="text-[10px] text-fg-subtle">First-Party Modules</span>
              </div>
            </Link>
          </div>

          {/* Center Search Bar */}
          <div className="hidden md:flex items-center flex-1 max-w-md mx-4">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center justify-between px-3.5 py-1.5 rounded-xl bg-surface border border-border hover:border-border-strong text-xs text-fg-muted transition-all shadow-sm group"
            >
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-fg-subtle group-hover:text-accent transition-colors" />
                <span>Search addons, commands, guides...</span>
              </div>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-surface-hover border border-border text-fg-subtle rounded">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSearchOpen(true)}
              className="md:hidden p-2 rounded-lg text-fg-muted hover:text-fg hover:bg-surface"
              title="Search"
            >
              <Search className="w-5 h-5" />
            </button>

            <VersionSelector />

            <nav className="hidden sm:flex items-center gap-1">
              <Link
                href="/docs"
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-fg-body hover:text-fg hover:bg-surface transition-colors"
              >
                Docs
              </Link>
              <Link
                href="/docs/addons/activity-roles"
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-fg-body hover:text-fg hover:bg-surface transition-colors"
              >
                Addons
              </Link>
            </nav>

            <div className="h-4 w-px bg-border hidden sm:block" />

            <a
              href="https://github.com/lumi-devs/lumi-addons"
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-lg text-fg-muted hover:text-fg hover:bg-surface transition-colors"
              title="GitHub Repository"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      <CommandPalette isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
