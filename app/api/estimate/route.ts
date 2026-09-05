import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estimateFromPhotos } from "@/lib/openai";
import { calculatePricing } from "@/lib/pricing";
import { checkRateLimit } from "@/lib/rate-limit";
import { isTwilioConfigured } from "@/lib/config";
import { checkFreeBidEligibility, markFreeBidUsed } from "@/lib/phone";
import { computeImagePhashFromUrl, findNearDuplicatePhoto, recordPhotoHash } from "@/lib/phash";
import { DEFAULT_RATES, type AiDataJson, type CompanyRates } from "@/lib/types";

const CONFIDENCE_THRESHOLD = 6;

// Generous headroom above realistic usage — see lib/rate-limit.ts. This is a cost guard
// on the OpenAI call below, not a cap on the product's "unlimited quotes" promise.
const RATE_LIMIT = { maxRequests: 20, windowMinutes: 10 };

export async function POST(req: Request) {
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

  const rateLimit = await checkRateLimit(supabase, profile.company_id, "estimate", RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Too many AI estimate requests — try again in about ${Math.ceil(
          rateLimit.retryAfterSeconds / 60
        )} minutes. This limit exists to catch runaway requests, not to cap normal quoting.`,
      },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  let body: {
    quote_id?: string;
    photos_urls?: string[];
    job_type?: string;
    notes?: string;
    company_rates?: Partial<CompanyRates>;
    is_free_bid?: boolean;
    phone_hash?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { quote_id, photos_urls, job_type, notes } = body;

  if (!quote_id || !photos_urls || photos_urls.length < 3) {
    return NextResponse.json({ error: "quote_id and at least 3 photos_urls are required" }, { status: 400 });
  }

  // Never trust the client's claim about plan/free-bid status — re-fetch server-side.
  const { data: companyRow } = await supabase
    .from("companies")
    .select("plan, free_bid_card_on_file")
    .eq("id", profile.company_id)
    .maybeSingle();

  const isFreeBid = companyRow?.plan === "free" && Boolean(body.is_free_bid);
  let photoHashes: string[] = [];

  if (isFreeBid) {
    if (!isTwilioConfigured()) {
      return NextResponse.json({ error: "Free-bid phone verification isn't configured yet." }, { status: 503 });
    }
    if (!body.phone_hash) {
      return NextResponse.json({ error: "Phone verification is required for the free bid." }, { status: 400 });
    }
    if (!companyRow?.free_bid_card_on_file) {
      return NextResponse.json({ error: "A card on file is required for the free bid." }, { status: 400 });
    }

    const eligibility = await checkFreeBidEligibility(body.phone_hash);
    if (!eligibility.eligible) {
      return NextResponse.json({ error: eligibility.reason || "Not eligible for the free bid." }, { status: 403 });
    }

    // Perceptual-hash every photo once — reused below both for the dedup check and
    // for recording, so we don't fetch/hash each image twice.
    photoHashes = await Promise.all(photos_urls.map((url) => computeImagePhashFromUrl(url)));
    for (const phash of photoHashes) {
      const isDuplicate = await findNearDuplicatePhoto(phash, profile.company_id);
      if (isDuplicate) {
        return NextResponse.json(
          { error: "These photos have already been used for a free bid on another account." },
          { status: 403 }
        );
      }
    }
  }

  const rates: CompanyRates = { ...DEFAULT_RATES, ...(body.company_rates || {}) };

  const { estimate, error: aiError } = await estimateFromPhotos({
    photoUrls: photos_urls,
    jobType: job_type || "Other",
    notes: notes || "",
  });

  let data: AiDataJson;

  if (!estimate) {
    // Fallback: AI unavailable — hand off to manual entry.
    data = {
      estimate: null,
      line_items: [],
      subtotal: 0,
      markup: 0,
      profit: 0,
      total: 0,
      ai_confidence_1to10: 0,
      ai_notes: "AI couldn't read photos. Enter sqft manually.",
      manual_mode: true,
      raw_response: aiError,
    };
  } else {
    data = calculatePricing(estimate, rates);
    if (estimate.confidence_1to10 < CONFIDENCE_THRESHOLD) {
      data.manual_mode = true;
      data.ai_notes = `${estimate.notes} (Low confidence — please verify sqft/depth manually.)`;
    }
  }

  const freeRevealAt = isFreeBid ? new Date(Date.now() + 5 * 60_000).toISOString() : null;

  const { error: updateError } = await supabase
    .from("quotes")
    .update({
      ai_data_json: data,
      total: data.manual_mode && !estimate ? null : data.total,
      ...(isFreeBid ? { is_free_bid: true, free_reveal_at: freeRevealAt } : {}),
    })
    .eq("id", quote_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Only mark the phone/photos as "used" once the quote row itself is confirmed
  // saved — a mid-failure above shouldn't burn the free bid.
  if (isFreeBid && body.phone_hash) {
    await markFreeBidUsed(body.phone_hash, quote_id);
    await Promise.all(
      photoHashes.map((phash) => recordPhotoHash(phash, quote_id, profile.company_id))
    ).catch(() => {
      // Best-effort — a failed hash record shouldn't fail the whole request.
    });
  }

  return NextResponse.json({
    line_items: data.line_items,
    subtotal: data.subtotal,
    total: data.total,
    ai_confidence_1to10: data.ai_confidence_1to10,
    ai_notes: data.ai_notes,
    manual_mode: data.manual_mode,
  });
}
