import type { CompanyPlan } from "./types";

export interface PlanLimit {
  label: string;
  priceMonthly: number;
  /** Bids allowed per rolling calendar month. `null` = unlimited. */
  bidsPerMonth: number | null;
  cleanPdf: boolean;
  canSend: boolean;
  crewSeats: boolean;
  stripePriceEnvVar?: "STRIPE_STARTER_PRICE_ID" | "STRIPE_PRO_PRICE_ID";
}

/**
 * Plan structure as of the free-bid relaunch — replaces the old single $99/mo
 * unlimited plan + 14-day trial (see supabase/schema.sql migration comment).
 * Free is lifetime-1-bid, not time-boxed, and gated by phone verification
 * (lib/phone.ts) rather than a clock.
 */
export const PLAN_LIMITS: Record<CompanyPlan, PlanLimit> = {
  free: {
    label: "Free",
    priceMonthly: 0,
    bidsPerMonth: 1,
    cleanPdf: false,
    canSend: false,
    crewSeats: false,
  },
  starter: {
    label: "Starter",
    priceMonthly: 49,
    bidsPerMonth: 30,
    cleanPdf: true,
    canSend: true,
    crewSeats: false,
    stripePriceEnvVar: "STRIPE_STARTER_PRICE_ID",
  },
  pro: {
    label: "Pro",
    priceMonthly: 149,
    bidsPerMonth: null,
    cleanPdf: true,
    canSend: true,
    crewSeats: true,
    stripePriceEnvVar: "STRIPE_PRO_PRICE_ID",
  },
};

export function planForStripePriceId(priceId: string | null | undefined): "starter" | "pro" | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return "starter";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  return null;
}
