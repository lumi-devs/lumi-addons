"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavSection } from "../lib/docs";
import { ChevronRight } from "lucide-react";

export function Sidebar({
  sections,
  isOpen,
  onClose,
}: {
  sections: NavSection[];
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed lg:sticky top-16 z-30 h-[calc(100vh-4rem)] w-72 shrink-0 overflow-y-auto border-r border-border bg-bg p-6 transition-transform duration-200 lg:translate-x-0 ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <nav className="flex flex-col gap-6">
        {sections.map((sec) => (
          <div key={sec.title} className="flex flex-col gap-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle px-2">
              {sec.title}
            </h4>
            <div className="flex flex-col gap-0.5">
              {sec.items.map((item) => {
                const active = pathname === item.href || (item.href !== "/docs" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active
                        ? "bg-accent/15 text-white font-semibold"
                        : "text-fg-body hover:bg-surface-hover hover:text-fg"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {item.emoji && <span className="text-sm">{item.emoji}</span>}
                      <span className="truncate">{item.title}</span>
                    </div>
                    {active && <div className="w-1.5 h-1.5 rounded-full bg-accent" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
