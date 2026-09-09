import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getCompanyContext } from "@/lib/data";

/** Stripe's hosted Billing Portal — lets a Starter/Pro customer cancel, change plan,
 *  or update their card themselves, without needing DigQuote to build that UI. This
 *  is what makes "cancel anytime" (see app/pricing) an actual self-serve promise. */
export async function POST() {
  try {
    const { user, company } = await getCompanyContext();
    if (!user || !company) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    if (!company.stripe_customer_id) {
      return NextResponse.json({ error: "No billing account on file yet." }, { status: 400 });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripe_customer_id,
      return_url: `${appUrl}/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[stripe portal] failed:", err);
    return NextResponse.json({ error: err?.message || "Could not open the billing portal." }, { status: 500 });
  }
}
