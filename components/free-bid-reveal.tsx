"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * UI-only friction on free bids — not a real security boundary (the price is already
 * computed server-side by the time this renders). Just softens the "instant" feel to
 * nudge toward upgrading rather than making the free tier feel identical to paid.
 */
export function FreeBidReveal({
  revealAt,
  isFreeBid,
  children,
}: {
  revealAt: string | null;
  isFreeBid: boolean;
  children: React.ReactNode;
}) {
  const target = revealAt ? new Date(revealAt).getTime() : 0;
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, target - Date.now()));

  useEffect(() => {
    if (!isFreeBid || !revealAt) return;
    const interval = setInterval(() => {
      setRemainingMs(Math.max(0, target - Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [isFreeBid, revealAt, target]);

  if (!isFreeBid || remainingMs <= 0) {
    return <>{children}</>;
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <Clock className="h-8 w-8 text-muted-foreground" />
        <p className="text-lg font-semibold">
          Ready in {minutes}:{seconds.toString().padStart(2, "0")}
        </p>
        <p className="text-sm text-muted-foreground">Your free bid is finishing up.</p>
        <Link href="/pricing" className="text-sm font-medium text-primary underline">
          Skip the wait — see plans
        </Link>
      </CardContent>
    </Card>
  );
}
