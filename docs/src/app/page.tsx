import Link from "next/link";
import { Header } from "../components/header";
import { Footer } from "../components/footer";
import { SpotlightCard } from "../components/spotlight-card";
import { CodeBlock } from "../components/code-block";
import {
  Sparkles,
  Zap,
  Shield,
  Layers,
  ArrowRight,
  Download,
  Terminal,
  BookOpen,
  CheckCircle2,
} from "lucide-react";

interface AddonSummary {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: "Roles" | "Voice" | "Moderation" | "Utility" | "System";
  tags: string[];
  version: string;
}

const ADDONS: AddonSummary[] = [
  {
    id: "activity-roles",
    name: "Activity Roles",
    emoji: "🎮",
    description:
      "Auto-assign roles based on users' Discord presence (Playing, Streaming, Listening, Custom status).",
    category: "Roles",
    tags: ["presence", "auto-role", "gaming"],
    version: "1.0.0",
  },
  {
    id: "booster-roles",
    name: "Booster Roles",
    emoji: "✨",
    description:
      "Self-service custom booster roles with color picker, role sharing, and automatic grace period cleanup.",
    category: "Roles",
    tags: ["nitro", "boosters", "custom-color"],
    version: "1.0.0",
  },
  {
    id: "confessions",
    name: "Confessions",
    emoji: "🕊️",
    description:
      "Anonymous confessions channel with numbered cards, threaded replies, and cryptographic hash-based moderation.",
    category: "Utility",
    tags: ["anonymous", "threads", "community"],
    version: "1.0.0",
  },
  {
    id: "dragme",
    name: "DragMe",
    emoji: "🧲",
    description:
      "Consent-based voice dragging: ask channel members for permission with one-click interactive buttons.",
    category: "Voice",
    tags: ["voice", "interactive", "consent"],
    version: "1.0.0",
  },
  {
    id: "multi-lounge",
    name: "Multi Lounge",
    emoji: "🛋️",
    description:
      "Dynamic voice channels that automatically scale with user demand and cleanly delete when empty.",
    category: "Voice",
    tags: ["dynamic-vc", "auto-scale", "clean"],
    version: "1.0.0",
  },
  {
    id: "promoter",
    name: "Promoter",
    emoji: "📣",
    description:
      "Reward members who advertise the server in their status or name tag with automated roles and logs.",
    category: "Roles",
    tags: ["growth", "rewards", "vanity"],
    version: "1.0.0",
  },
  {
    id: "rolementions",
    name: "Role Mentions",
    emoji: "🛡️",
    description:
      "Track role mentions with daily analytics and auto-protect sensitive staff roles via native AutoMod rules.",
    category: "Moderation",
    tags: ["automod", "anti-ping", "analytics"],
    version: "1.0.0",
  },
  {
    id: "status",
    name: "Status Rotator",
    emoji: "🔁",
    description:
      "Owner-managed rotating bot presence with activity types, online states, and live placeholder variables.",
    category: "System",
    tags: ["presence", "branding", "owner"],
    version: "1.0.0",
  },
  {
    id: "thread-cleaner",
    name: "Thread Cleaner",
    emoji: "🧹",
    description:
      "Automatically archive and lock inactive threads, plus moderator bulk sweep tooling to declutter channels.",
    category: "Moderation",
    tags: ["threads", "cleanup", "bulk-sweep"],
    version: "1.0.0",
  },
  {
    id: "utility",
    name: "Utility Tools",
    emoji: "🧰",
    description:
      "Essential server utilities including multi-engine translation and custom emoji stealer with image resizing.",
    category: "Utility",
    tags: ["translate", "emoji-stealer", "tools"],
    version: "1.0.0",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col justify-between">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          {/* Ambient Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-accent/15 blur-[120px] rounded-full pointer-events-none -z-10" />

          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/25 text-xs font-semibold text-accent mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Lumi Addon Ecosystem v1.0</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold text-fg tracking-tight leading-[1.1] mb-6">
              Extensible, Zero-Downtime <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-accent via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                Addons for Lumi
              </span>
            </h1>

            <p className="text-base sm:text-lg text-fg-muted leading-relaxed mb-8 max-w-2xl mx-auto">
              Self-contained, hot-loadable modules for your Lumi bot fleet. Install without restarts, configure via dashboard or slash commands, and build your own with the Lumi SDK.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/docs/guides/getting-started"
                className="px-6 py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent-hover transition-all shadow-lg shadow-accent/25 flex items-center gap-2 group"
              >
                <span>Quick Start Guide</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>

              <Link
                href="/docs"
                className="px-6 py-3 rounded-xl bg-surface border border-border font-semibold text-sm text-fg hover:bg-surface-hover hover:border-border-strong transition-all flex items-center gap-2"
              >
                <BookOpen className="w-4 h-4 text-fg-muted" />
                <span>Explore Documentation</span>
              </Link>
            </div>
          </div>

          {/* Quick Install Banner */}
          <div className="mt-14 max-w-2xl mx-auto">
            <CodeBlock
              title="One-Line Addon Installation"
              language="discord"
              code={`,repo add lumi-addons https://github.com/lumi-devs/lumi-addons.git\n,download lumi-addons booster-roles\n/modules enable booster-roles`}
            />
          </div>
        </section>

        {/* Feature Highlights */}
        <section className="py-12 border-y border-border bg-bg-subtle/50 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-surface border border-border">
              <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent mb-4">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-fg text-base mb-2">Zero-Downtime Hot Reloads</h3>
              <p className="text-xs text-fg-muted leading-relaxed">
                Addons load and unload at runtime across all bot worker shards without restarting the gateway or dropping voice sessions.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-surface border border-border">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 mb-4">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-fg text-base mb-2">GDPR & CCPA Compliant</h3>
              <p className="text-xs text-fg-muted leading-relaxed">
                Every addon declares an explicit end-user data statement with built-in hooks for right-to-be-forgotten user data exports and deletions.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-surface border border-border">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400 mb-4">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-fg text-base mb-2">Typed Addon SDK</h3>
              <p className="text-xs text-fg-muted leading-relaxed">
                Build custom modules using <code className="text-accent">lumi</code>, <code className="text-accent">lumi/commands</code>, <code className="text-accent">lumi/ui</code>, and <code className="text-accent">lumi/scheduling</code>.
              </p>
            </div>
          </div>
        </section>

        {/* Addon Gallery */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
            <div>
              <div className="kicker-tag text-accent mb-1">Addon Catalog</div>
              <h2 className="text-3xl font-extrabold text-fg tracking-tight">
                First-Party Addon Modules
              </h2>
              <p className="text-sm text-fg-muted mt-1">
                Battle-tested, production-ready modules maintained by the Lumi team.
              </p>
            </div>
            <div className="text-xs text-fg-subtle">
              Showing <span className="text-fg font-bold">{ADDONS.length}</span> verified addons
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ADDONS.map((addon) => (
              <SpotlightCard
                key={addon.id}
                title={addon.name}
                emoji={addon.emoji}
                description={addon.description}
                href={`/docs/addons/${addon.id}`}
                badge={addon.category}
                tags={addon.tags}
              />
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
