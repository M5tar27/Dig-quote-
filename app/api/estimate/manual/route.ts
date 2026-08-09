import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateManualPricing } from "@/lib/pricing";
import { DEFAULT_RATES, type CompanyRates } from "@/lib/types";

/** Manual fallback: contractor enters sqft + depth directly when the AI estimate is unavailable or low-confidence. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { quote_id, sqft, depth_inches, company_rates } = body || {};

  if (!quote_id || !sqft || !depth_inches) {
    return NextResponse.json({ error: "quote_id, sqft, and depth_inches are required" }, { status: 400 });
  }

  const rates: CompanyRates = { ...DEFAULT_RATES, ...(company_rates || {}) };
  const data = calculateManualPricing(Number(sqft), Number(depth_inches), rates);

  const { error } = await supabase
    .from("quotes")
    .update({ ai_data_json: data, total: data.total })
    .eq("id", quote_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    line_items: data.line_items,
    subtotal: data.subtotal,
    total: data.total,
    manual_mode: true,
  });
}
