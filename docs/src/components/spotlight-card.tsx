"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface SpotlightCardProps {
  title: string;
  description: string;
  href: string;
  emoji: string;
  badge?: string;
  tags?: string[];
}

export function SpotlightCard({
  title,
  description,
  href,
  emoji,
  badge,
  tags,
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <Link href={href} className="block group">
      <div
        ref={divRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setOpacity(1)}
        onMouseLeave={() => setOpacity(0)}
        className="relative card-premium p-6 h-full flex flex-col justify-between overflow-hidden"
      >
        {/* Glow effect */}
        <div
          className="pointer-events-none absolute -inset-px transition-opacity duration-300"
          style={{
            opacity,
            background: `radial-gradient(400px circle at ${position.x}px ${position.y}px, rgba(76, 110, 245, 0.15), transparent 80%)`,
          }}
        />

        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-3xl p-2.5 rounded-xl bg-surface-hover border border-border inline-block group-hover:scale-105 transition-transform">
              {emoji}
            </span>
            {badge && (
              <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-accent/15 text-accent border border-accent/20">
                {badge}
              </span>
            )}
          </div>

          <h3 className="text-lg font-bold text-fg group-hover:text-accent transition-colors flex items-center gap-1.5">
            {title}
            <ArrowRight className="w-4 h-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-accent" />
          </h3>
          <p className="text-sm text-fg-muted mt-2 leading-relaxed">{description}</p>
        </div>

        {tags && tags.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-1.5 pt-4 border-t border-border/50">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-[10px] font-mono rounded bg-surface-hover text-fg-subtle"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
