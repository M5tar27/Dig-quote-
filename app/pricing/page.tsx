import Link from "next/link";
import { getCompanyContext } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckoutButton } from "@/components/checkout-button";
import { Check } from "lucide-react";
import type { CompanyPlan } from "@/lib/types";

// This page's content depends on the visitor's auth/subscription state, so it must
// never be cached — otherwise one visitor's rendered HTML (e.g. a logged-out view)
// can get served to a different, logged-in visitor.
export const dynamic = "force-dynamic";

const STARTER_FEATURES = [
  "30 bids per month",
  "Clean PDF — no watermark",
  "Email quotes to clients",
  "Public client approval link",
  "Dashboard, win-rate & pipeline tracking",
];

const PRO_FEATURES = [
  "Unlimited bids",
  "Everything in Starter",
  "Add your crew as teammates",
  "Priority AI processing",
];

export default async function PricingPage({
  searchParams,
}: {
  searchParams: { paywall?: string };
}) {
  const { user, company } = await getCompanyContext();
  const plan: CompanyPlan | null = company?.plan ?? null;
  const isActivePaid = company?.subscription_status === "active" && (plan === "starter" || plan === "pro");

  return (
    <main className="min-h-screen bg-secondary/40 px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        {searchParams.paywall && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-center text-sm text-amber-900">
            {plan === "free"
              ? "You've used your free bid. Upgrade to keep quoting."
              : "You've hit this month's bid limit. Upgrade to keep quoting."}
          </div>
        )}

        <div className="text-center">
          <h1 className="text-2xl font-bold">Plans</h1>
          <p className="text-muted-foreground">One free bid to try it, then straightforward monthly pricing.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className={plan === "free" ? "border-2 border-primary" : ""}>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">
                $0<span className="text-sm font-normal text-muted-foreground"> first bid</span>
              </CardTitle>
              <CardDescription>Free — one per business</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" />1 bid, phone-verified
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" />
                  Watermarked draft PDF
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" />
                  Card on file, not charged
                </li>
              </ul>
              {!user && (
                <Link href="/signup">
                  <Button size="lg" variant="outline" className="w-full">
                    Get your free bid
                  </Button>
                </Link>
              )}
              {user && plan === "free" && (
                <p className="text-center text-sm text-muted-foreground">Your current plan</p>
              )}
            </CardContent>
          </Card>

          <Card className={plan === "starter" ? "border-2 border-primary" : ""}>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">
                $49<span className="text-sm font-normal text-muted-foreground">/mo</span>
              </CardTitle>
              <CardDescription>Starter — for solo jobs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                {STARTER_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              {user && company && plan !== "starter" && <CheckoutButton plan="starter" />}
              {user && plan === "starter" && isActivePaid && (
                <p className="text-center text-sm font-medium text-success">Your current plan</p>
              )}
              {!user && (
                <Link href="/signup">
                  <Button size="lg" className="w-full">
                    Start with Starter
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          <Card className={plan === "pro" ? "border-2 border-primary" : ""}>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">
                $149<span className="text-sm font-normal text-muted-foreground">/mo</span>
              </CardTitle>
              <CardDescription>Pro — for busy crews</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              {user && company && plan !== "pro" && <CheckoutButton plan="pro" variant="outline" />}
              {user && plan === "pro" && isActivePaid && (
                <p className="text-center text-sm font-medium text-success">Your current plan</p>
              )}
              {!user && (
                <Link href="/signup">
                  <Button size="lg" variant="outline" className="w-full">
                    Start with Pro
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-xs text-muted-foreground">Cancel anytime. No long-term contracts.</p>
      </div>
    </main>
  );
}
