import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getCompanyContext } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { user, company } = await getCompanyContext();
    if (!user || !company) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    let body: { setup_intent_id?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body.setup_intent_id) {
      return NextResponse.json({ error: "setup_intent_id is required" }, { status: 400 });
    }

    // Never trust the client's claim that the card saved — retrieve the SetupIntent
    // from Stripe directly and verify both its status and that it belongs to this
    // company's own customer before flipping free_bid_card_on_file.
    const setupIntent = await stripe.setupIntents.retrieve(body.setup_intent_id);
    if (setupIntent.status !== "succeeded") {
      return NextResponse.json({ error: "Card setup hasn't completed yet." }, { status: 400 });
    }
    if (setupIntent.customer !== company.stripe_customer_id) {
      return NextResponse.json({ error: "That card setup doesn't belong to this company." }, { status: 403 });
    }

    const supabase = await createClient();
    const { error } = await supabase.from("companies").update({ free_bid_card_on_file: true }).eq("id", company.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ confirmed: true });
  } catch (err: any) {
    console.error("[stripe confirm-card] failed:", err);
    return NextResponse.json({ error: err?.message || "Could not confirm the card." }, { status: 500 });
  }
}
