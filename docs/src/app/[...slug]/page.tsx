import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "../../components/header";
import { Sidebar } from "../../components/sidebar";
import { TableOfContents } from "../../components/toc";
import { BottomPager } from "../../components/bottom-pager";
import { Footer } from "../../components/footer";
import {
  getDocBySlug,
  getAllDocSlugs,
  getNavSections,
  type DocPage,
} from "../../lib/docs";
import { ChevronRight } from "lucide-react";

interface PageProps {
  params: Promise<{
    slug: string[];
  }>;
}

export async function generateStaticParams() {
  const slugs = await getAllDocSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const doc = await getDocBySlug(slug);
  if (!doc) return { title: "Not Found | Lumi Addons" };
  return {
    title: `${doc.metadata.title} | Lumi Addons Documentation`,
    description: doc.metadata.description,
  };
}

export default async function DocPageRenderer({ params }: PageProps) {
  const { slug } = await params;
  const doc = await getDocBySlug(slug);
  if (!doc) notFound();

  const navSections = await getNavSections();

  // Compute Prev/Next pagination links
  const flatItems = navSections.flatMap((s) => s.items);
  const currentPath = "/" + slug.join("/");
  const currentIndex = flatItems.findIndex((item) => item.href === currentPath);
  const prevItem = currentIndex > 0 ? flatItems[currentIndex - 1] : null;
  const nextItem =
    currentIndex >= 0 && currentIndex < flatItems.length - 1
      ? flatItems[currentIndex + 1]
      : null;

  return (
    <div className="min-h-screen flex flex-col justify-between">
      <Header />

      <div className="max-w-7xl mx-auto w-full flex flex-1">
        {/* Left Sidebar */}
        <Sidebar sections={navSections} />

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 px-6 sm:px-10 py-10 max-w-4xl">
          {/* Breadcrumb Navigation */}
          <nav className="flex items-center gap-1.5 text-xs text-fg-subtle mb-6">
            <Link href="/" className="hover:text-fg transition-colors">
              Home
            </Link>
            <ChevronRight className="w-3 h-3" />
            <Link href="/docs" className="hover:text-fg transition-colors">
              Docs
            </Link>
            {slug.length > 1 && (
              <>
                <ChevronRight className="w-3 h-3" />
                <span className="capitalize">{slug[0]}</span>
              </>
            )}
            <ChevronRight className="w-3 h-3" />
            <span className="text-fg font-medium">{doc.metadata.title}</span>
          </nav>

          {/* Document Header */}
          <div className="mb-8 pb-6 border-b border-border">
            <div className="flex items-center gap-3 mb-2">
              {doc.metadata.emoji && (
                <span className="text-3xl p-2 rounded-xl bg-surface border border-border inline-block">
                  {doc.metadata.emoji}
                </span>
              )}
              <div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-fg tracking-tight">
                  {doc.metadata.title}
                </h1>
                {doc.metadata.description && (
                  <p className="text-sm text-fg-muted mt-1 leading-relaxed">
                    {doc.metadata.description}
                  </p>
                )}
              </div>
            </div>

            {/* Tags & Metadata Badges */}
            {doc.metadata.tags && doc.metadata.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {doc.metadata.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-0.5 rounded-full text-xs bg-surface border border-border text-fg-subtle"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* HTML rendered from Markdown */}
          <article
            className="prose"
            dangerouslySetInnerHTML={{ __html: doc.contentHtml }}
          />

          {/* Bottom Pagination */}
          <BottomPager prev={prevItem} next={nextItem} />
        </main>

        {/* Right Table of Contents */}
        <TableOfContents headings={doc.headings} />
      </div>

      <Footer />
    </div>
  );
}
