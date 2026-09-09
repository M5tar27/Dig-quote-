import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTwilioConfigured } from "@/lib/config";
import { twilio } from "@/lib/twilio";
import {
  hashPhone,
  clientIpFromHeaders,
  lookupPhoneType,
  checkFreeBidEligibility,
  recordVerifiedPhone,
} from "@/lib/phone";

const E164_RE = /^\+[1-9]\d{7,14}$/;

export async function POST(req: Request) {
  if (!isTwilioConfigured()) {
    return NextResponse.json({ error: "Phone verification isn't configured yet." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { phone?: string; code?: string; device_fingerprint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const phone = body.phone?.trim();
  const code = body.code?.trim();
  if (!phone || !E164_RE.test(phone) || !code) {
    return NextResponse.json({ error: "Phone and code are required" }, { status: 400 });
  }

  let approved = false;
  try {
    const check = await twilio.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
      .verificationChecks.create({ to: phone, code });
    approved = check.status === "approved";
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Couldn't verify that code" }, { status: 502 });
  }

  if (!approved) {
    // Deliberately don't touch verified_phones on a wrong-code guess — only a
    // Twilio-approved code gets anywhere near the eligibility check below.
    return NextResponse.json({ verified: false, error: "Incorrect or expired code" }, { status: 400 });
  }

  const phoneHash = hashPhone(phone);
  const { isVoip } = await lookupPhoneType(phone);
  const ip = clientIpFromHeaders(req.headers);

  await recordVerifiedPhone({
    phoneHash,
    isVoip,
    ip,
    deviceFingerprint: body.device_fingerprint || null,
  });

  const eligibility = await checkFreeBidEligibility(phoneHash);

  return NextResponse.json({
    verified: true,
    eligible: eligibility.eligible,
    reason: eligibility.reason,
    phone_hash: phoneHash,
  });
}
