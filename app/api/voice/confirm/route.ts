import { NextResponse } from "next/server";
import { getCompanyContext } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { renderAndStoreChangeOrderPdf } from "@/lib/generate-pdf";
import { estimateFromVoiceFields, missingRequiredFields } from "@/lib/voice";
import { PLAN_LIMITS } from "@/lib/plans";
import { DEFAULT_RATES, type CompanyRates } from "@/lib/types";
import type { ParsedVoiceFields } from "@/lib/openai";

export const runtime = "nodejs";

/**
 * Step 2 of the voice flow — turns a confirmed/edited voice memo into a real record.
 * Never trusts client-computed totals: bids are re-priced server-side from the final
 * fields the same way /api/estimate re-derives everything from photos, not from
 * whatever the client happened to display.
 */
export async function POST(req: Request) {
  const { user, company } = await getCompanyContext();
  if (!user || !company) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: {
    kind?: "bid" | "change_order";
    voice_memo_id?: string;
    // bid
    client_name?: string;
    address?: string;
    phone?: string;
    client_email?: string;
    job_type?: string;
    fields?: ParsedVoiceFields;
    // change_order
    quote_id?: string;
    description?: string;
    price?: number;
    customer_name?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = await createClient();

  if (body.kind === "change_order") {
    if (!PLAN_LIMITS[company.plan].voice.changeOrders) {
      return NextResponse.json({ error: "Voice change orders are a Pro feature." }, { status: 403 });
    }
    if (!body.description || body.price === undefined || body.price === null) {
      return NextResponse.json({ error: "description and price are required" }, { status: 400 });
    }

    const { data: co, error: insertError } = await supabase
      .from("change_orders")
      .insert({
        company_id: company.id,
        created_by: user.id,
        quote_id: body.quote_id || null,
        voice_memo_id: body.voice_memo_id || null,
        description: body.description,
        price: body.price,
        customer_name: body.customer_name || null,
      })
      .select()
      .single();
    if (insertError || !co) {
      return NextResponse.json({ error: insertError?.message || "Couldn't create the change order" }, { status: 500 });
    }

    if (body.voice_memo_id) {
      await supabase.from("voice_memos").update({ quote_id: body.quote_id || null }).eq("id", body.voice_memo_id);
    }

    try {
      await renderAndStoreChangeOrderPdf(
        supabase,
        {
          id: co.id,
          description: co.description,
          price: co.price,
          customerName: co.customer_name,
          signedAt: co.signed_at,
          createdAt: co.created_at,
          company: { name: company.name, phone: company.phone, email: company.email, default_terms: company.default_terms },
        },
        company.id
      );
    } catch (err: any) {
      // The change order itself is saved either way — a PDF render failure shouldn't
      // lose the record, just leave pdf_url null for a retry.
      return NextResponse.json({ change_order_id: co.id, public_token: co.public_token, pdf_error: err?.message });
    }

    return NextResponse.json({ change_order_id: co.id, public_token: co.public_token });
  }

  // kind === "bid" (default, for backwards-compat with a client that omits it)
  if (!PLAN_LIMITS[company.plan].voice.enabled) {
    return NextResponse.json({ error: "Voice bids aren't available on your plan." }, { status: 403 });
  }
  if (!body.client_name?.trim() || !body.address?.trim() || !body.phone?.trim() || !body.fields) {
    return NextResponse.json({ error: "client_name, address, phone, and fields are required" }, { status: 400 });
  }

  const missing = missingRequiredFields(body.fields);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Still missing: ${missing.join(", ")}. Fill those in before generating.` },
      { status: 400 }
    );
  }

  const rates: CompanyRates = { ...DEFAULT_RATES, ...(company.rates_json || {}) };
  const data = estimateFromVoiceFields(body.fields, rates);

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      company_id: company.id,
      created_by: user.id,
      client_name: body.client_name.trim(),
      address: body.address.trim(),
      phone: body.phone.trim(),
      client_email: body.client_email?.trim() || null,
      job_type: body.job_type || "Other",
      notes: body.fields.extra_notes || null,
      status: "draft",
      ai_data_json: data,
      total: data.total,
    })
    .select()
    .single();
  if (quoteError || !quote) {
    return NextResponse.json({ error: quoteError?.message || "Couldn't create the quote" }, { status: 500 });
  }

  if (body.voice_memo_id) {
    await supabase.from("voice_memos").update({ quote_id: quote.id }).eq("id", body.voice_memo_id);
  }

  return NextResponse.json({ quote_id: quote.id });
}
