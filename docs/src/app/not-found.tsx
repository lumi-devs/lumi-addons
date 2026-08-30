import Link from "next/link";
import { Header } from "../components/header";
import { Footer } from "../components/footer";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col justify-between">
      <Header />
      <main className="max-w-xl mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center mx-auto mb-6 text-accent">
          <FileQuestion className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-fg tracking-tight">404 - Page Not Found</h1>
        <p className="text-sm text-fg-muted mt-3 leading-relaxed">
          The documentation or addon page you are looking for doesn&apos;t exist or has moved.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/"
            className="px-4 py-2 rounded-xl bg-surface border border-border text-xs font-semibold text-fg hover:bg-surface-hover transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <Link
            href="/docs"
            className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors"
          >
            Explore Docs
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
