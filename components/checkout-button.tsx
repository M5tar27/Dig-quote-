"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function CheckoutButton({
  plan,
  label,
  variant,
}: {
  plan: "starter" | "pro";
  label?: string;
  variant?: "default" | "outline";
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body.error || "Could not start checkout");
      window.location.href = body.url;
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <Button size="lg" variant={variant} className="w-full" onClick={handleClick} disabled={loading}>
      {loading && <Loader2 className="h-5 w-5 animate-spin" />}
      {label || `Start with ${plan === "pro" ? "Pro" : "Starter"}`}
    </Button>
  );
}
