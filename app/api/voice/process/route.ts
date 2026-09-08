import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkVoiceEligibility, estimateFromVoiceFields, missingRequiredFields, type VoiceMemoType } from "@/lib/voice";
import { transcribeVoiceMemo, parseVoiceTranscript } from "@/lib/openai";
import { DEFAULT_RATES, type CompanyRates } from "@/lib/types";

export const runtime = "nodejs";

// Same cost-guard shape as /api/estimate's RATE_LIMIT — a burst-protection ceiling on
// the OpenAI spend per company, well above realistic usage (a crew doing back-to-back
// voice bids nonstop would hit maybe 10-15 in 10 minutes).
const RATE_LIMIT = { maxRequests: 20, windowMinutes: 10 };

/**
 * Step 1 of the voice flow: transcribe + (for bid) parse + price. Does NOT create a
 * quote/change-order/crew-note row for "bid" or "change_order" — those need a
 * contractor to confirm/edit fields first (see /api/voice/confirm and
 * components/voice-bid-button.tsx's preview screen). "crew_note" has no preview step
 * per spec ("save as timestamped log") and is written here in one shot.
 */
export async function POST(req: Request) {
  const { user, company } = await getCompanyContext();
  if (!user || !company) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { audio_url?: string; type?: VoiceMemoType; quote_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { audio_url, type, quote_id } = body;
  if (!audio_url || !type || !["bid", "change_order", "crew_note"].includes(type)) {
    return NextResponse.json({ error: "audio_url and a valid type are required" }, { status: 400 });
  }

  const supabase = await createClient();

  const eligibility = await checkVoiceEligibility(supabase, company.id, company.plan, type);
  if (!eligibility.allowed) {
    return NextResponse.json({ error: eligibility.reason, remaining: eligibility.remaining ?? 0 }, { status: 403 });
  }

  const rateLimit = await checkRateLimit(supabase, company.id, "voice_process", RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Too many voice requests — try again in about ${Math.ceil(
          rateLimit.retryAfterSeconds / 60
        )} minutes.`,
      },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const { transcript, error: transcribeError } = await transcribeVoiceMemo(audio_url);
  if (!transcript) {
    return NextResponse.json({ error: transcribeError || "Couldn't transcribe that recording" }, { status: 502 });
  }

  if (type === "crew_note") {
    const { data: note, error: insertError } = await supabase
      .from("crew_notes")
      .insert({
        company_id: company.id,
        created_by: user.id,
        quote_id: quote_id || null,
        audio_url,
        transcript,
      })
      .select()
      .single();
    if (insertError || !note) {
      return NextResponse.json({ error: insertError?.message || "Couldn't save the crew note" }, { status: 500 });
    }
    await supabase.from("voice_memos").insert({
      company_id: company.id,
      created_by: user.id,
      quote_id: quote_id || null,
      type: "crew_note",
      audio_url,
      transcript,
    });
    return NextResponse.json({ transcript, crew_note_id: note.id });
  }

  const { fields, error: parseError } = await parseVoiceTranscript(transcript);
  if (!fields) {
    return NextResponse.json({ error: parseError || "Couldn't parse that recording" }, { status: 502 });
  }

  const { data: voiceMemo, error: memoError } = await supabase
    .from("voice_memos")
    .insert({
      company_id: company.id,
      created_by: user.id,
      quote_id: quote_id || null,
      type,
      audio_url,
      transcript,
      parsed_fields: fields,
    })
    .select()
    .single();
  if (memoError || !voiceMemo) {
    return NextResponse.json({ error: memoError?.message || "Couldn't save the voice memo" }, { status: 500 });
  }

  if (type === "change_order") {
    return NextResponse.json({
      voice_memo_id: voiceMemo.id,
      transcript,
      fields,
      remaining: null,
    });
  }

  // type === "bid"
  const missing = missingRequiredFields(fields);
  if (missing.length > 0) {
    return NextResponse.json({
      voice_memo_id: voiceMemo.id,
      transcript,
      fields,
      missing_fields: missing,
      estimate: null,
      remaining: eligibility.remaining ?? null,
    });
  }

  const rates: CompanyRates = { ...DEFAULT_RATES, ...(company.rates_json || {}) };
  const estimate = estimateFromVoiceFields(fields, rates);

  return NextResponse.json({
    voice_memo_id: voiceMemo.id,
    transcript,
    fields,
    missing_fields: [],
    estimate,
    remaining: eligibility.remaining ?? null,
  });
}
