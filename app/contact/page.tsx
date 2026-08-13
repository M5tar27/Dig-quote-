import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — DigQuote",
  description: "Get in touch with DigQuote, including privacy and data requests.",
};

export default function ContactPage() {
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

      <section className="container max-w-2xl py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">Contact us</h1>
        <p className="mt-4 text-muted-foreground">
          Questions about DigQuote, or requests related to your personal data and our{" "}
          <Link href="/privacy-policy" className="underline">
            Privacy Policy
          </Link>
          , can be sent to:
        </p>
        <p className="mt-6 text-lg font-semibold">
          <a href="mailto:privacy@digquote.com" className="hover:underline">
            privacy@digquote.com
          </a>
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          We aim to respond to all inquiries, including data access, correction, and deletion
          requests, within a reasonable timeframe as described in our Privacy Policy.
        </p>
      </section>

      <footer className="border-t py-8">
        <div className="container text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} DigQuote.</p>
        </div>
      </footer>
    </main>
  );
}
