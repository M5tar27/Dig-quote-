import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Wrench } from "lucide-react";

/**
 * Shown instead of a raw stack trace when a required service (Supabase, most commonly)
 * hasn't been configured yet — e.g. a fresh clone before .env.local is filled in.
 */
export function ConfigErrorCard({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 px-4">
      <Card className="w-full max-w-md border-primary/40">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Wrench className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>DigQuote isn't set up yet</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-center text-sm text-muted-foreground">
          <p>
            Copy <code className="rounded bg-muted px-1.5 py-0.5">.env.example</code> to{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">.env.local</code> and fill in your
            Supabase project's URL and anon key, then restart the dev server.
          </p>
          <p>Full setup steps are in the repo's README.md.</p>
        </CardContent>
      </Card>
    </main>
  );
}
