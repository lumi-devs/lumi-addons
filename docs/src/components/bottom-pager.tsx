"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PagerItem {
  title: string;
  href: string;
}

export function BottomPager({
  prev,
  next,
}: {
  prev?: PagerItem | null;
  next?: PagerItem | null;
}) {
  if (!prev && !next) return null;

  return (
    <div className="mt-12 pt-6 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-4">
      {prev ? (
        <Link
          href={prev.href}
          className="flex flex-col p-4 rounded-xl card-premium group text-left"
        >
          <span className="text-[10px] uppercase font-bold text-fg-subtle flex items-center gap-1 mb-1">
            <ChevronLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
            Previous
          </span>
          <span className="text-sm font-semibold text-fg group-hover:text-accent transition-colors">
            {prev.title}
          </span>
        </Link>
      ) : (
        <div />
      )}

      {next ? (
        <Link
          href={next.href}
          className="flex flex-col p-4 rounded-xl card-premium group text-right sm:items-end"
        >
          <span className="text-[10px] uppercase font-bold text-fg-subtle flex items-center gap-1 mb-1">
            Next
            <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </span>
          <span className="text-sm font-semibold text-fg group-hover:text-accent transition-colors">
            {next.title}
          </span>
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
