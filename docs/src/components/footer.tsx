import Link from "next/link";
import { Heart, Shield } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-bg-subtle py-12 px-4 sm:px-6 lg:px-8 mt-20">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-fg-subtle">
        <div className="flex items-center gap-2">
          <span>Lumi Addons © {new Date().getFullYear()} Lumi Developers.</span>
          <span>•</span>
          <a
            href="https://github.com/lumi-devs/lumi-addons/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
            className="hover:text-fg underline underline-offset-2"
          >
            AGPL-3.0 License
          </a>
        </div>

        <div className="flex items-center gap-6">
          <a
            href="https://github.com/lumi-devs/lumi"
            target="_blank"
            rel="noreferrer"
            className="hover:text-fg transition-colors"
          >
            Lumi Core
          </a>
          <a
            href="https://github.com/lumi-devs/lumi-addons"
            target="_blank"
            rel="noreferrer"
            className="hover:text-fg transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
