/** Central checks for whether required third-party services are configured. */

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_STARTER_PRICE_ID &&
      process.env.STRIPE_PRO_PRICE_ID &&
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  );
}

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Twilio Verify (SMS code) + Lookup (VOIP detection) gate the Free plan's one bid to
 * one real phone number per business. Without all four, the free-bid phone-verification
 * step can't be completed — see components/phone-gate.tsx and lib/phone.ts — but the
 * rest of the app (including Starter/Pro) works fine regardless.
 */
export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_VERIFY_SERVICE_SID &&
      process.env.PHONE_HASH_SECRET
  );
}

/**
 * Prefix used to mark "this app isn't configured yet" errors so an error.tsx boundary
 * can recognize them across the server→client error serialization boundary, where only
 * `message` (and `digest`) reliably survive — custom Error subclasses / instanceof checks
 * do not. See components/config-error-card.tsx for the matching display component.
 */
export const CONFIG_ERROR_PREFIX = "DIGQUOTE_CONFIG_ERROR:";

export function configError(message: string): Error {
  return new Error(`${CONFIG_ERROR_PREFIX} ${message}`);
}

export function isConfigError(error: { message?: string }): boolean {
  return Boolean(error?.message?.includes(CONFIG_ERROR_PREFIX));
}

export function stripConfigErrorPrefix(message: string): string {
  return message.replace(CONFIG_ERROR_PREFIX, "").trim();
}
