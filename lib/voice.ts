import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_LIMITS } from "./plans";
import { calculatePricing } from "./pricing";
import type { AiDataJson, AiEstimate, CompanyPlan, CompanyRates } from "./types";
import type { ParsedVoiceFields } from "./openai";

export type VoiceMemoType = "bid" | "change_order" | "crew_note";

export interface VoiceEligibility {
  allowed: boolean;
  reason?: string;
  /** Present for `type: "bid"` on Starter — drives the "12/30 voice bids left" counter. */
  remaining?: number | null;
}

/**
 * Server-side paywall check — never trust a client's claim about remaining credits.
 * Mirrors checkFreeBidEligibility (lib/phone.ts) and checkRateLimit (lib/rate-limit.ts)'s
 * "count rows, then decide" shape, scoped to a real Supabase-authenticated (RLS'd)
 * client rather than the service client, since these are always called from a signed-in
 * company context (see app/api/voice/process/route.ts).
 */
export async function checkVoiceEligibility(
  supabase: SupabaseClient,
  companyId: string,
  plan: CompanyPlan,
  type: VoiceMemoType
): Promise<VoiceEligibility> {
  const limits = PLAN_LIMITS[plan].voice;

  if (!limits.enabled) {
    return {
      allowed: false,
      reason: "Talk your bids — no typing. Upgrade to Starter $49/mo to unlock voice.",
    };
  }

  if (type === "change_order" && !limits.changeOrders) {
    return {
      allowed: false,
      reason: "Voice change orders are a Pro feature. Upgrade to Pro to unlock them.",
    };
  }

  if (type === "crew_note" && !limits.crewNotes) {
    return {
      allowed: false,
      reason: "Voice crew notes are a Pro feature. Upgrade to Pro to unlock them.",
    };
  }

  // Change orders / crew notes on Pro are unlimited by definition (only "bid" has a
  // monthly cap on any plan) — nothing left to count.
  if (type !== "bid" || limits.bidsPerMonth === null) {
    return { allowed: true, remaining: null };
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("voice_memos")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("type", "bid")
    .gte("created_at", monthStart.toISOString());

  // Fail open on a transient DB error — this is a plan-limit guard, not a security
  // boundary, and the real cost guard (checkRateLimit-style burst protection) still
  // applies inside the OpenAI calls themselves.
  if (error) {
    return { allowed: true, remaining: limits.bidsPerMonth };
  }

  const used = count ?? 0;
  if (used >= limits.bidsPerMonth) {
    return {
      allowed: false,
      reason: "Out of voice bids — go unlimited with Pro + unlock change orders",
      remaining: 0,
    };
  }

  return { allowed: true, remaining: limits.bidsPerMonth - used };
}

/** Core fields a usable bid needs — anything else missing gets folded into extra_notes for a human to read. */
const REQUIRED_FIELDS: Array<{ key: keyof ParsedVoiceFields; label: string }> = [
  { key: "length", label: "Length" },
  { key: "width", label: "Width" },
  { key: "depth_inches", label: "Depth" },
];

/** Which required measurements the parser couldn't pull out of the transcript. */
export function missingRequiredFields(fields: ParsedVoiceFields): string[] {
  return REQUIRED_FIELDS.filter((f) => fields[f.key] === null || fields[f.key] === undefined).map(
    (f) => f.label
  );
}

/**
 * Converts parsed voice fields into the same AiEstimate shape estimateFromPhotos produces,
 * so voice-generated bids flow through the exact same calculatePricing() engine as
 * photo-generated ones — one pricing model, not two to keep in sync.
 *
 * There's no vision model here doing its own quantity takeoff, so this is a straightforward
 * geometry pass (sqft × depth → cubic yards, 10% overdig) with light, clearly-labeled
 * adjustments for what a contractor would actually call out on a job: rockier soil takes
 * longer to move, a tight access gate means more hand labor and slower equipment time, and
 * haul distance/load count add truck time on top of the flat per-yard disposal rate that
 * calculatePricing already charges. Always returned as manual_mode — same as any
 * low-confidence or manually-entered estimate elsewhere in the app — so the contractor
 * double-checks numbers before sending, since this is derived from what someone said out
 * loud, not measured from photos.
 */
export function estimateFromVoiceFields(fields: ParsedVoiceFields, rates: CompanyRates): AiDataJson {
  const length = fields.length ?? 0;
  const width = fields.width ?? 0;
  const depthInches = fields.depth_inches ?? 0;
  const sqft = length * width;

  const isRock = fields.soil_type === "rock";
  const overdigFactor = isRock ? 1.2 : 1.1;
  const cubicYards = round2((sqft * (depthInches / 12) * overdigFactor) / 27);

  // Tight access (a gate/gap narrower than ~10ft) slows a mini-excavator down and pushes
  // more of the job onto hand labor.
  const tightAccess = fields.access_ft !== null && fields.access_ft < 10;
  const excavatorDivisor = isRock ? 2.5 : tightAccess ? 3 : 4;
  const handworkBase = sqft / 200;

  // Truck time beyond the flat per-yard disposal rate: round-trip haul distance × load
  // count, converted to hours at a conservative average site speed.
  const haulMiles = ((fields.haul_ft ?? 0) * 2) / 5280;
  const loads = fields.loads ?? Math.max(1, Math.ceil(cubicYards / 6));
  const haulHours = round2((haulMiles / 15) * loads);

  const estimate: AiEstimate = {
    sqft: round2(sqft),
    avg_depth_inches: depthInches,
    cubic_yards_to_remove: cubicYards,
    tons_gravel_needed: round2(cubicYards * 1.4),
    tons_sand_needed: 0,
    labor_hours_excavator: round2(cubicYards / excavatorDivisor + haulHours),
    labor_hours_handwork: round2(handworkBase + (tightAccess ? handworkBase * 0.5 : 0)),
    equipment_days: Math.max(1, Math.ceil(cubicYards / 20)),
    confidence_1to10: 5,
    notes: [
      "Built from a voice memo — verify measurements on-site before sending.",
      fields.soil_type ? `Soil: ${fields.soil_type}.` : null,
      tightAccess ? `Tight access (${fields.access_ft}ft) — hand labor increased.` : null,
      fields.extra_notes || null,
    ]
      .filter(Boolean)
      .join(" "),
  };

  const data = calculatePricing(estimate, rates);
  data.manual_mode = true;
  return data;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
