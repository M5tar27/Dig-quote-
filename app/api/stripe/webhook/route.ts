import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { planForStripePriceId } from "@/lib/plans";

export const runtime = "nodejs";

function mapStripeStatus(status: Stripe.Subscription.Status): "trialing" | "active" | "past_due" | "canceled" | "none" {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "canceled";
    default:
      return "none";
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
  }

  const supabase = createServiceClient();

  async function findCompanyId(customerId: string, metadataCompanyId?: string | null) {
    if (metadataCompanyId) return metadataCompanyId;
    const { data } = await supabase
      .from("companies")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    return data?.id ?? null;
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = await findCompanyId(sub.customer as string, sub.metadata?.company_id);
      if (companyId) {
        const status = mapStripeStatus(sub.status);
        const priceId = sub.items.data[0]?.price?.id;
        const matchedPlan = planForStripePriceId(priceId);
        await supabase
          .from("companies")
          .update({
            stripe_subscription_id: sub.id,
            stripe_customer_id: sub.customer as string,
            subscription_status: status,
            // Only move off 'free' on a status that actually means "paying" — a price
            // we don't recognize, or a non-active status, leaves `plan` untouched
            // rather than silently downgrading/upgrading based on a guess.
            ...(status === "active" && matchedPlan ? { plan: matchedPlan } : {}),
            ...(status === "canceled" ? { plan: "free" } : {}),
          })
          .eq("id", companyId);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const companyId = await findCompanyId(sub.customer as string, sub.metadata?.company_id);
      if (companyId) {
        await supabase.from("companies").update({ subscription_status: "canceled", plan: "free" }).eq("id", companyId);
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const companyId = await findCompanyId(invoice.customer as string);
      if (companyId) {
        await supabase.from("companies").update({ subscription_status: "past_due" }).eq("id", companyId);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
