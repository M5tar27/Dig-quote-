"use client";

import { useEffect, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, ShieldCheck } from "lucide-react";
import { getStripe } from "@/lib/stripe-client";

function CardForm({ onSaved }: { onSaved: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!stripe || !elements) return;
    setSaving(true);
    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });
      if (error) throw new Error(error.message || "Couldn't save that card");
      if (!setupIntent || setupIntent.status !== "succeeded") {
        throw new Error("Card setup didn't complete — try again");
      }

      const res = await fetch("/api/stripe/confirm-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setup_intent_id: setupIntent.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't confirm the card");

      toast.success("Card on file — not charged");
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Couldn't save that card");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <PaymentElement options={{ layout: "tabs" }} />
      <Button onClick={handleSave} disabled={saving || !stripe} className="w-full gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        Save card — not charged
      </Button>
    </div>
  );
}

/**
 * Free-plan companies need a card on file (never charged for the free bid itself —
 * see /api/stripe/setup-intent) before /api/estimate will grant it. This is the
 * companion gate to PhoneGate; the wizard requires both before enabling Generate.
 */
export function CardOnFile({ onSaved }: { onSaved: () => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stripe/setup-intent", { method: "POST" })
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (!body.client_secret) throw new Error(body.error || "Couldn't start card setup");
        setClientSecret(body.client_secret);
      })
      .catch((err) => !cancelled && setError(err.message || "Couldn't start card setup"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (saved) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm font-medium text-success">
        <ShieldCheck className="h-5 w-5 shrink-0" />
        Card on file — your free bid is ready to generate.
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!clientSecret) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading card form...
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <p className="text-sm font-medium">Add a card for your free bid</p>
      <p className="text-sm text-muted-foreground">
        Not charged — this is just to keep the free bid to one per business. You'll get a clear
        confirmation before anything is ever billed.
      </p>
      <Elements stripe={getStripe()} options={{ clientSecret }}>
        <CardForm
          onSaved={() => {
            setSaved(true);
            onSaved();
          }}
        />
      </Elements>
    </div>
  );
}
