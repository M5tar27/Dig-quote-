"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfigErrorCard } from "@/components/config-error-card";
import { isConfigError, stripConfigErrorPrefix } from "@/lib/config";
import { AlertTriangle } from "lucide-react";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  if (isConfigError(error)) {
    return <ConfigErrorCard message={stripConfigErrorPrefix(error.message)} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 pt-8 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="text-sm text-muted-foreground">{error.message || "An unexpected error occurred."}</p>
          <Button size="lg" onClick={reset}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
