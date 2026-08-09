import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estimateFromPhotos } from "@/lib/openai";
import { calculatePricing } from "@/lib/pricing";
import { checkRateLimit } from "@/lib/rate-limit";
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

  const { error: updateError } = await supabase
    .from("quotes")
    .update({
      ai_data_json: data,
      total: data.manual_mode && !estimate ? null : data.total,
    })
    .eq("id", quote_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
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
