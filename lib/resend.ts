import { Resend } from "resend";

let _resend: Resend | null = null;

/** Lazily instantiated — see lib/stripe.ts for why. */
export const resend: Resend = new Proxy({} as Resend, {
  get(_target, prop) {
    if (!_resend) {
      _resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");
    }
    // @ts-expect-error - dynamic proxy forwarding
    return _resend[prop];
  },
});

export function quoteEmailHtml(opts: {
  clientName: string;
  address: string;
  companyName: string;
  total: number;
}) {
  return `
  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
    <p>Hi ${opts.clientName},</p>
    <p>Attached is your estimate for <strong>${opts.address}</strong>.</p>
    <p style="font-size: 20px; font-weight: bold;">Total: $${opts.total.toLocaleString()}</p>
    <p>Call with questions.</p>
    <p>— ${opts.companyName}</p>
    <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
    <p style="font-size: 12px; color: #888;">
      Estimates are AI-generated for convenience only. Contractor must verify all measurements
      and site conditions. ${opts.companyName} is not liable for errors.
    </p>
  </div>`;
}
