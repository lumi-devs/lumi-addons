"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, GitBranch, Sparkles } from "lucide-react";

interface Version {
  id: string;
  name: string;
  badge?: string;
  isLatest?: boolean;
}

const VERSIONS: Version[] = [
  { id: "v1.0.0", name: "v1.0.0", badge: "Latest", isLatest: true },
  { id: "v0.9.0", name: "v0.9.0", badge: "Beta" },
  { id: "main", name: "main (dev)", badge: "Nightly" },
];

export function VersionSelector() {
  const [selected, setSelected] = useState(VERSIONS[0]!);
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1 text-xs font-medium rounded-lg bg-surface border border-border hover:border-border-strong text-fg-body hover:text-fg transition-all"
        title="Select Documentation Version"
      >
        <GitBranch className="w-3.5 h-3.5 text-accent" />
        <span>{selected.name}</span>
        {selected.badge && (
          <span className="px-1.5 py-0.2 bg-accent/15 text-accent rounded text-[10px] font-semibold">
            {selected.badge}
          </span>
        )}
        <ChevronDown className={`w-3 h-3 text-fg-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-48 rounded-xl bg-surface border border-border shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
            Select Version
          </div>
          {VERSIONS.map((v) => (
            <button
              key={v.id}
              onClick={() => {
                setSelected(v);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                selected.id === v.id
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-fg-body hover:bg-surface-hover hover:text-fg"
              }`}
            >
              <div className="flex items-center gap-2">
                <span>{v.name}</span>
                {v.badge && (
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] ${
                      v.isLatest
                        ? "bg-emerald-500/15 text-emerald-400 font-semibold"
                        : "bg-fg-muted/15 text-fg-muted"
                    }`}
                  >
                    {v.badge}
                  </span>
                )}
              </div>
              {selected.id === v.id && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
          <div className="mt-1 pt-1 border-t border-border/50 px-2 py-1 text-[11px] text-fg-subtle flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-accent" />
            <span>Auto-synced with Changesets</span>
          </div>
        </div>
      )}
    </div>
  );
}
