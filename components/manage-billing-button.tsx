"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

/** Opens Stripe's hosted Billing Portal, where the customer can cancel, swap plans,
 *  or update their card themselves — see app/api/stripe/portal. */
export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body.error || "Could not open billing portal");
      window.location.href = body.url;
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <Button size="lg" onClick={handleClick} disabled={loading} className="gap-2">
      {loading && <Loader2 className="h-5 w-5 animate-spin" />}
      Manage subscription
    </Button>
  );
}
