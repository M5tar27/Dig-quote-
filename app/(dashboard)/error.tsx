"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfigErrorCard } from "@/components/config-error-card";
import { isConfigError, stripConfigErrorPrefix } from "@/lib/config";
import { AlertTriangle } from "lucide-react";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  if (isConfigError(error)) {
    return <ConfigErrorCard message={stripConfigErrorPrefix(error.message)} />;
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 pt-8 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred. Try again."}
          </p>
          <Button size="lg" onClick={reset}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
