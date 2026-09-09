import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getCompanyContext } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const { user, company } = await getCompanyContext();
    if (!user || !company) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    if (company.plan !== "free") {
      return NextResponse.json({ error: "Card-on-file is only needed for the free plan." }, { status: 400 });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 500 });
    }

    const supabase = await createClient();

    let customerId = company.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: company.name,
        metadata: { company_id: company.id },
      });
      customerId = customer.id;
      await supabase.from("companies").update({ stripe_customer_id: customerId }).eq("id", company.id);
    }

    // usage: "off_session" — collects the card without charging it, so it can later
    // be charged automatically only if the customer explicitly checks out into a
    // paid plan (never for the free bid itself).
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      metadata: { company_id: company.id },
    });

    return NextResponse.json({ client_secret: setupIntent.client_secret });
  } catch (err: any) {
    console.error("[stripe setup-intent] failed:", err);
    return NextResponse.json({ error: err?.message || "Could not start card setup." }, { status: 500 });
  }
}
