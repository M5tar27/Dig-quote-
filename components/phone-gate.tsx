"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, Lock } from "lucide-react";

type Stage = "enter-phone" | "enter-code" | "verified" | "blocked";

/** Weak client-side "device id" — persisted in localStorage, sent alongside the phone
 *  verification as one more abuse-detection signal. This is NOT real device
 *  fingerprinting (no canvas/audio/font probing) — just enough to notice the same
 *  browser trying multiple phone numbers in a row. */
function getDeviceId(): string {
  try {
    const key = "digquote_device_id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

/** Normalizes a US-style 10-digit number to E.164. Good enough for the target market
 *  (Bed-Stuy/Bushwick PMs); a number already starting with "+" is passed through. */
function toE164(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function PhoneGate({ onVerified }: { onVerified: (phoneHash: string) => void }) {
  const [stage, setStage] = useState<Stage>("enter-phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [e164, setE164] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  async function handleSendCode() {
    const normalized = toE164(phoneInput);
    if (!normalized) {
      toast.error("Enter a valid 10-digit phone number");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/phone/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't send the code");
      setE164(normalized);
      setStage("enter-code");
      toast.success(`Code sent to ${phoneInput}`);
    } catch (err: any) {
      toast.error(err.message || "Couldn't send the code");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    if (!e164 || code.trim().length < 4) return;
    setLoading(true);
    try {
      const res = await fetch("/api/phone/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: e164, code: code.trim(), device_fingerprint: getDeviceId() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.verified) throw new Error(body.error || "Couldn't verify that code");

      if (!body.eligible) {
        setBlockedReason(body.reason || "This phone number isn't eligible for the free bid.");
        setStage("blocked");
        return;
      }

      setStage("verified");
      onVerified(body.phone_hash);
    } catch (err: any) {
      toast.error(err.message || "Couldn't verify that code");
    } finally {
      setLoading(false);
    }
  }

  if (stage === "verified") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm font-medium text-success">
        <ShieldCheck className="h-5 w-5 shrink-0" />
        Phone verified — {phoneInput}
      </div>
    );
  }

  if (stage === "blocked") {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
        <Lock className="h-5 w-5 shrink-0" />
        <span>{blockedReason}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <p className="text-sm font-medium">Verify your phone for your free bid</p>
      <p className="text-sm text-muted-foreground">One free bid per phone number — this only takes a few seconds.</p>
      {stage === "enter-phone" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1 space-y-1">
            <Label htmlFor="freeBidPhone" className="sr-only">
              Phone number
            </Label>
            <Input
              id="freeBidPhone"
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="(347) 555-0142"
            />
          </div>
          <Button onClick={handleSendCode} disabled={loading} className="gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Send code
          </Button>
        </div>
      )}
      {stage === "enter-code" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1 space-y-1">
            <Label htmlFor="freeBidCode" className="sr-only">
              Verification code
            </Label>
            <Input
              id="freeBidCode"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
            />
          </div>
          <Button onClick={handleVerifyCode} disabled={loading} className="gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Verify
          </Button>
        </div>
      )}
    </div>
  );
}
