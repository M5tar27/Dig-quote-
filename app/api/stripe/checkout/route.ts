import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getCompanyContext } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const PRICE_ENV_VARS = {
  starter: "STRIPE_STARTER_PRICE_ID",
  pro: "STRIPE_PRO_PRICE_ID",
} as const;

export async function POST(req: Request) {
  try {
    const { user, company } = await getCompanyContext();
    if (!user || !company) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    let body: { plan?: "starter" | "pro" } = {};
    try {
      body = await req.json();
    } catch {
      // No body is fine — defaults to starter below.
    }
    const plan = body.plan === "pro" ? "pro" : "starter";
    const priceId = process.env[PRICE_ENV_VARS[plan]];

    if (!process.env.STRIPE_SECRET_KEY || !priceId) {
      return NextResponse.json(
        { error: "Billing isn't configured yet (missing Stripe secret key or price ID)." },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
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

    // No trials anymore — see supabase/schema.sql's free-bid relaunch migration.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { company_id: company.id },
      },
      metadata: { company_id: company.id },
      success_url: `${appUrl}/app?checkout=success`,
      cancel_url: `${appUrl}/pricing?checkout=canceled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[stripe checkout] failed:", err);
    return NextResponse.json(
      { error: err?.message || "Could not start checkout. Please try again." },
      { status: 500 }
    );
  }
}
