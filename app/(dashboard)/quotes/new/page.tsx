import { redirect } from "next/navigation";
import { getCompanyContext } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { QuoteWizard } from "@/components/quote-wizard";
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

  return (
    <div className="mx-auto max-w-xl">
      <QuoteWizard companyId={company.id} rates={rates} plan={company.plan} />
    </div>
  );
}
