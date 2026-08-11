import Link from "next/link";
import { getCompanyContext } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckoutButton } from "@/components/checkout-button";
import { Check } from "lucide-react";

const FEATURES = [
  "Unlimited AI-generated quotes",
  "Branded PDF estimates",
  "Email quotes to clients",
  "Public client approval link",
  "Dashboard, win-rate & pipeline tracking",
  "Team seats for your crew",
];

export default async function PricingPage({
  searchParams,
}: {
  searchParams: { paywall?: string };
}) {
  const { user, company } = await getCompanyContext();
  const trialActive = company?.subscription_status === "trialing";
  const isActiveSub = company?.subscription_status === "active";

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        {searchParams.paywall && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-center text-sm text-amber-900">
            Your free trial has ended. Subscribe to keep creating quotes.
          </div>
        )}

        <Card className="border-2 border-primary">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">$99<span className="text-lg font-normal text-muted-foreground">/mo</span></CardTitle>
            <CardDescription>Unlimited quotes. Cancel anytime.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ul className="space-y-2 text-sm">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" />
                  {f}
                </li>
              ))}
            </ul>

            {!user && (
              <Link href="/signup">
                <Button size="lg" className="w-full">
                  Start your 14-day free trial
                </Button>
              </Link>
            )}

            {user && company && !isActiveSub && <CheckoutButton />}

            {user && company && trialActive && (
              <p className="text-center text-sm text-muted-foreground">
                You're on your 14-day trial. Subscribing now locks in your rate.
              </p>
            )}

            {user && company && isActiveSub && (
              <p className="text-center text-sm font-medium text-success">
                You're subscribed — thanks for being a DigQuote customer!
              </p>
            )}

            <p className="text-center text-xs text-muted-foreground">
              No credit card required for the trial.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
