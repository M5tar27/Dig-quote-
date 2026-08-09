import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, Clock, FileCheck, ShieldCheck } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <span className="text-xl font-bold">
            Dig<span className="text-primary">Quote</span>
          </span>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Start free trial</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="container py-12 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Quotes take you <span className="text-primary">3 hours</span>.
            <br />
            DigQuote does it in <span className="text-primary">60 seconds</span>.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            Snap a few photos on the job site. Get a professional, priced excavation or
            landscaping quote you can text or email right there in the driveway.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto">
                Start your 14-day free trial
              </Button>
            </Link>
            <Link href="/pricing" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                See pricing
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            No credit card required for the trial. $99/mo unlimited quotes after.
          </p>
        </div>
      </section>

      <section className="container grid gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Camera, title: "Snap photos", desc: "3-6 photos from your phone, right on site." },
          { icon: Clock, title: "60-second AI estimate", desc: "GPT-4o vision measures the job and prices it." },
          { icon: FileCheck, title: "Instant PDF", desc: "Branded quote, ready to text or email the client." },
          { icon: ShieldCheck, title: "You stay in control", desc: "Every estimate is editable — you have the final say." },
        ].map((f) => (
          <Card key={f.title}>
            <CardContent className="pt-6">
              <f.icon className="mb-3 h-8 w-8 text-primary" />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <footer className="border-t py-8">
        <div className="container text-center text-sm text-muted-foreground">
          <p>
            Estimates are AI-generated for convenience only. Contractor must verify all
            measurements and site conditions. DigQuote is not liable for errors.
          </p>
          <p className="mt-2">© {new Date().getFullYear()} DigQuote.</p>
        </div>
      </footer>
    </main>
  );
}
