import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getCompanyContext } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const { user, company } = await getCompanyContext();
  if (!user || !company) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
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

  const trialEndsAt = company.trial_ends_at ? new Date(company.trial_ends_at) : null;
  const trialStillActive = trialEndsAt && trialEndsAt.getTime() > Date.now();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    subscription_data: {
      metadata: { company_id: company.id },
      ...(trialStillActive
        ? { trial_end: Math.floor((trialEndsAt as Date).getTime() / 1000) }
        : {}),
    },
    metadata: { company_id: company.id },
    success_url: `${appUrl}/app?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=canceled`,
  });

  return NextResponse.json({ url: session.url });
}
