import crypto from "crypto";
import { twilio } from "./twilio";
import { createServiceClient } from "./supabase/server";

/**
 * HMAC-SHA256 rather than a bare hash: E.164 phone numbers are low enough entropy
 * (a handful of billion possibilities, heavily clustered by area code) that an
 * unsalted/unkeyed hash is effectively reversible via brute force by anyone with
 * database access. Keying it with a server-only secret closes that off.
 */
export function hashPhone(e164: string): string {
  if (!process.env.PHONE_HASH_SECRET) {
    throw new Error("PHONE_HASH_SECRET is not set. Add it to use phone verification.");
  }
  return crypto.createHmac("sha256", process.env.PHONE_HASH_SECRET).update(e164).digest("hex");
}

export function clientIpFromHeaders(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return headers.get("x-real-ip");
}

/** Uses Twilio Lookup's line_type_intelligence to flag VOIP numbers, which are
 *  trivial to generate in bulk and are blocked from the free bid. Fails open
 *  (treats as non-VOIP) on any Lookup error — this is an abuse-reduction signal,
 *  not the primary security boundary (phone verification + card-on-file are). */
export async function lookupPhoneType(e164: string): Promise<{ isVoip: boolean }> {
  try {
    const result = await twilio.lookups.v2.phoneNumbers(e164).fetch({ fields: "line_type_intelligence" });
    const type = result.lineTypeIntelligence?.type;
    return { isVoip: type === "voip" };
  } catch {
    return { isVoip: false };
  }
}

export interface FreeBidEligibility {
  eligible: boolean;
  reason?: string;
}

export async function checkFreeBidEligibility(phoneHash: string): Promise<FreeBidEligibility> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("verified_phones")
    .select("free_bid_used, is_voip")
    .eq("phone_hash", phoneHash)
    .maybeSingle();

  if (error) {
    // Fail closed on a DB error here — this is the actual abuse boundary, unlike Lookup.
    return { eligible: false, reason: "Couldn't verify phone eligibility — try again." };
  }
  if (data?.is_voip) {
    return { eligible: false, reason: "VOIP numbers can't be used for the free bid." };
  }
  if (data?.free_bid_used) {
    return { eligible: false, reason: "This phone number has already used its free bid." };
  }
  return { eligible: true };
}

export async function recordVerifiedPhone(params: {
  phoneHash: string;
  isVoip: boolean;
  ip: string | null;
  deviceFingerprint: string | null;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("verified_phones").upsert(
    {
      phone_hash: params.phoneHash,
      is_voip: params.isVoip,
      ip: params.ip,
      device_fingerprint: params.deviceFingerprint,
      verified_at: new Date().toISOString(),
    },
    { onConflict: "phone_hash" }
  );
}

export async function markFreeBidUsed(phoneHash: string, quoteId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("verified_phones")
    .update({ free_bid_used: true, free_bid_quote_id: quoteId })
    .eq("phone_hash", phoneHash);
}
