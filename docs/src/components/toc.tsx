"use client";

import { useEffect, useState } from "react";
import { DocHeading } from "../lib/docs";
import { AlignLeft } from "lucide-react";

export function TableOfContents({ headings }: { headings: DocHeading[] }) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "0% 0% -60% 0%" },
    );

    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <div className="hidden xl:block w-64 shrink-0 p-6 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-subtle mb-3">
        <AlignLeft className="w-3.5 h-3.5 text-accent" />
        <span>On this page</span>
      </div>
      <nav className="flex flex-col gap-1.5 text-xs">
        {headings.map((h) => (
          <a
            key={h.id}
            href={`#${h.id}`}
            className={`transition-colors py-1 ${
              h.level === 3 ? "pl-3" : "pl-0"
            } ${
              activeId === h.id
                ? "text-accent font-semibold"
                : "text-fg-muted hover:text-fg"
            }`}
          >
            {h.text}
          </a>
        ))}
      </nav>
    </div>
  );
}
