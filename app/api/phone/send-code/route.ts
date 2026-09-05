import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { isTwilioConfigured } from "@/lib/config";
import { twilio } from "@/lib/twilio";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profile?.company_id) {
    return NextResponse.json({ error: "No company on file" }, { status: 400 });
  }

  // Same cost-guard pattern as /api/estimate — SMS sends cost money per call.
  const rateLimit = await checkRateLimit(supabase, profile.company_id, "phone-send-code", {
    maxRequests: 5,
    windowMinutes: 10,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many verification attempts — try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const phone = body.phone?.trim();
  if (!phone || !E164_RE.test(phone)) {
    return NextResponse.json({ error: "A valid phone number in E.164 format (e.g. +15551234567) is required" }, { status: 400 });
  }

  try {
    await twilio.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID!).verifications.create({
      to: phone,
      channel: "sms",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Couldn't send the verification code" }, { status: 502 });
  }

  return NextResponse.json({ sent: true });
}
