"use client";

import { useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";

export function CodeBlock({
  code,
  language = "bash",
  title,
}: {
  code: string;
  language?: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-xl border border-border bg-[#0a0d14] overflow-hidden group">
      {title && (
        <div className="flex items-center justify-between px-4 py-2 bg-surface/60 border-b border-border text-xs text-fg-muted font-mono">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-accent" />
            <span>{title}</span>
          </div>
          <span className="text-[10px] uppercase font-semibold text-fg-subtle">{language}</span>
        </div>
      )}
      <div className="relative p-4 font-mono text-sm overflow-x-auto text-[#e2e8f0]">
        <pre className="!bg-transparent !p-0 !m-0">
          <code>{code}</code>
        </pre>
        <button
          onClick={handleCopy}
          className="absolute right-3 top-3 p-1.5 rounded-lg bg-surface/80 border border-border text-fg-muted hover:text-fg hover:border-border-strong opacity-0 group-hover:opacity-100 transition-all shadow-sm"
          title="Copy code"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
