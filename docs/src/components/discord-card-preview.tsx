"use client";

import { MessageSquare, Sparkles } from "lucide-react";

interface DiscordCardProps {
  color?: string;
  title: string;
  description: string;
  footer?: string;
  authorName?: string;
  authorIcon?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  buttons?: { label: string; style?: "primary" | "secondary" | "danger" | "success"; emoji?: string }[];
}

export function DiscordCardPreview({
  color = "#4C6EF5",
  title,
  description,
  footer,
  authorName,
  fields,
  buttons,
}: DiscordCardProps) {
  return (
    <div className="my-6 max-w-xl rounded-2xl bg-[#1e1f22] p-4 text-[#dbdee1] font-sans border border-white/5 shadow-xl">
      {/* Bot message header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white font-bold text-xs">
          L
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white text-sm">Lumi</span>
          <span className="bg-[#5865F2] text-white text-[10px] font-bold px-1 rounded uppercase tracking-wider">
            BOT
          </span>
          <span className="text-[11px] text-[#949ba4]">Today at 12:00 PM</span>
        </div>
      </div>

      {/* Embed Container */}
      <div
        className="rounded-lg bg-[#2b2d31] p-4 text-sm relative overflow-hidden"
        style={{ borderLeft: `4px solid ${color}` }}
      >
        {authorName && (
          <div className="text-xs font-semibold text-white mb-1.5 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span>{authorName}</span>
          </div>
        )}

        <div className="font-bold text-white text-base mb-1.5">{title}</div>
        <div className="text-[#dbdee1] leading-relaxed whitespace-pre-line text-[13px]">{description}</div>

        {fields && fields.length > 0 && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {fields.map((f, i) => (
              <div key={i} className={f.inline ? "col-span-1" : "col-span-2"}>
                <div className="text-xs font-bold text-white">{f.name}</div>
                <div className="text-xs text-[#dbdee1]">{f.value}</div>
              </div>
            ))}
          </div>
        )}

        {footer && (
          <div className="mt-3 pt-2 border-t border-white/5 text-[11px] text-[#949ba4] flex items-center gap-1.5">
            <span>{footer}</span>
          </div>
        )}
      </div>

      {/* Interactive Action Buttons */}
      {buttons && buttons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {buttons.map((b, i) => {
            const styleClasses =
              b.style === "danger"
                ? "bg-[#da373c] hover:bg-[#a12828] text-white"
                : b.style === "secondary"
                  ? "bg-[#4e5058] hover:bg-[#6d6f78] text-white"
                  : b.style === "success"
                    ? "bg-[#248046] hover:bg-[#1a6334] text-white"
                    : "bg-[#5865F2] hover:bg-[#4752c4] text-white";
            return (
              <button
                key={i}
                type="button"
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${styleClasses}`}
              >
                {b.emoji && <span>{b.emoji}</span>}
                <span>{b.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
