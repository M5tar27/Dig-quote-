import type { SupabaseClient } from "@supabase/supabase-js";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Rolling-window rate limit backed by Postgres (via `api_usage_events`), scoped per
 * company. Exists to stop a runaway loop or abusive script from burning through OpenAI
 * spend on /api/estimate — not to cap legitimate contractor usage. A crew doing back-to-back
 * 60-second quotes nonstop would hit maybe 10 calls in 10 minutes; the defaults below give
 * generous headroom above that.
 *
 * Deliberately implemented as "count rows in the last N minutes, then insert one" against
 * Postgres rather than in-memory counters, because Vercel serverless functions don't share
 * memory across instances/regions — an in-memory Map would silently under-enforce in
 * production. This does one extra DB round trip per call, which is a fine trade for
 * correctness on an endpoint that's already making a multi-second OpenAI call.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  companyId: string,
  endpoint: string,
  opts: { maxRequests?: number; windowMinutes?: number } = {}
): Promise<RateLimitResult> {
  const maxRequests = opts.maxRequests ?? 20;
  const windowMinutes = opts.windowMinutes ?? 10;
  const windowStart = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  const { count, error: countError } = await supabase
    .from("api_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("endpoint", endpoint)
    .gte("created_at", windowStart);

  // If we can't reach the rate-limit table for some reason, fail open rather than
  // blocking a real quote over a transient DB hiccup — this is a cost guard, not
  // a security boundary.
  if (countError) {
    return { allowed: true, remaining: maxRequests, retryAfterSeconds: 0 };
  }

  const used = count ?? 0;
  if (used >= maxRequests) {
    return { allowed: false, remaining: 0, retryAfterSeconds: windowMinutes * 60 };
  }

  await supabase.from("api_usage_events").insert({ company_id: companyId, endpoint });

  return { allowed: true, remaining: maxRequests - used - 1, retryAfterSeconds: 0 };
}
