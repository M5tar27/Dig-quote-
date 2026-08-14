import Link from "next/link";
import type { Metadata } from "next";
import { cookiePolicyHtml } from "./policy-html";

export const metadata: Metadata = {
  title: "Cookie Policy — DigQuote",
  description: "How DigQuote uses cookies and similar technologies.",
};

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            Dig<span className="text-primary">Quote</span>
          </Link>
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            ← Back to home
          </Link>
        </div>
      </header>

      <section className="container max-w-3xl py-12">
        <div
          className="prose prose-sm max-w-none sm:prose-base"
          dangerouslySetInnerHTML={{ __html: cookiePolicyHtml }}
        />
      </section>

      <footer className="border-t py-8">
        <div className="container text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} DigQuote.</p>
        </div>
      </footer>
    </main>
  );
}
