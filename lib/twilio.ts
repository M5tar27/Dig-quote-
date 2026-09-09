import Twilio from "twilio";

let _twilio: ReturnType<typeof Twilio> | null = null;

/** Lazily instantiated, same pattern as lib/stripe.ts, so the module can be imported
 *  even when Twilio env vars aren't set yet — see lib/config.ts's isTwilioConfigured(). */
export const twilio: ReturnType<typeof Twilio> = new Proxy({} as ReturnType<typeof Twilio>, {
  get(_target, prop) {
    if (!_twilio) {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set. Add them to use phone verification.");
      }
      _twilio = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }
    // @ts-expect-error - dynamic proxy forwarding
    return _twilio[prop];
  },
});
