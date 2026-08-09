import Stripe from "stripe";

let _stripe: Stripe | null = null;

/** Lazily instantiated so the module can be imported even when STRIPE_SECRET_KEY isn't set yet
 *  (e.g. during `next build` static analysis, or before the user has filled in .env.local). */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    if (!_stripe) {
      if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error("STRIPE_SECRET_KEY is not set. Add it to your .env.local to use billing features.");
      }
      _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2026-07-29.dahlia",
        typescript: true,
      });
    }
    // @ts-expect-error - dynamic proxy forwarding
    return _stripe[prop];
  },
});
