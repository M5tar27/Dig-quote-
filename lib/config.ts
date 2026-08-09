/** Central checks for whether required third-party services are configured. */

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
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
