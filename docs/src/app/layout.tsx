import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumi Addons | Official Documentation & Addon Registry",
  description:
    "First-party hot-loadable dynamic modules for the Lumi Discord Bot. Browse addons, guides, SDK documentation, and command references.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col bg-bg text-fg antialiased selection:bg-accent/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
