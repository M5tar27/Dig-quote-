import { redirect } from "next/navigation";
import { getCompanyContext } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { QuoteWizard } from "@/components/quote-wizard";
import { VoiceBidButton } from "@/components/voice-bid-button";
import { PLAN_LIMITS } from "@/lib/plans";
import { DEFAULT_RATES } from "@/lib/types";

export default async function NewQuotePage() {
  const { company } = await getCompanyContext();
  if (!company) return null;

  // Defense in depth alongside middleware's paywall check — re-verified here in case
  // this page is reached without going through middleware for any reason.
  if (company.plan === "free") {
    const supabase = await createClient();
    const { count } = await supabase
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("is_free_bid", true);
    if ((count ?? 0) >= PLAN_LIMITS.free.bidsPerMonth!) {
      redirect("/pricing?paywall=1");
    }
  }

  const rates = { ...DEFAULT_RATES, ...(company.rates_json || {}) };

  // Voice Memo feature: Starter's remaining monthly voice-bid count, computed the same
  // way lib/voice.ts's checkVoiceEligibility does server-side (this is just for the
  // initial "N/30 left" display — the real enforcement happens again on the API side).
  let voiceRemaining: number | null | undefined;
  if (company.plan === "starter") {
    const supabase = await createClient();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("voice_memos")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("type", "bid")
      .gte("created_at", monthStart.toISOString());
    voiceRemaining = Math.max(0, (PLAN_LIMITS.starter.voice.bidsPerMonth ?? 30) - (count ?? 0));
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="rounded-xl border bg-card p-4 text-center">
        <p className="mb-3 text-sm font-semibold text-muted-foreground">Or talk it in — no typing</p>
        <VoiceBidButton tier={company.plan} companyId={company.id} voiceRemaining={voiceRemaining} />
      </div>
      <QuoteWizard companyId={company.id} rates={rates} plan={company.plan} />
    </div>
  );
}
