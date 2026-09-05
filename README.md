# DigQuote

Turn excavation & landscaping site photos into a priced, professional quote in about 60 seconds.

Built for foremen with work gloves on: huge buttons, dead-simple flow, mobile-first.

**Stack:** Next.js 14 (App Router) + TypeScript · Supabase (Auth, Postgres, Storage) · Stripe · Tailwind + shadcn/ui-style components · OpenAI GPT-4o Vision · Resend · Vercel

---

## 1. Prerequisites

- Node 18+ and npm
- A [Supabase](https://supabase.com) project (free tier is fine to start)
- A [Stripe](https://stripe.com) account
- An [OpenAI](https://platform.openai.com) API key with GPT-4o access
- A [Resend](https://resend.com) account (for sending quote emails)

---

## 2. Supabase setup

1. Create a new Supabase project.
2. Open the **SQL Editor** and run, in order:
   - `supabase/schema.sql` — creates tables, enums, RLS policies, the `quotes` storage bucket + its policies, and the `get_public_quote` / `approve_public_quote` functions used by the public client-approval page.
   - `supabase/seed.sql` — creates one demo company + one demo quote so the app isn't empty on first login.
     - Demo login: **demo@digquote.app** / **DigQuoteDemo123!**
3. **Enable Google OAuth** (optional but supported): Authentication → Providers → Google, add your Client ID/Secret. Set the redirect URL to `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback` for local dev).
4. Grab your keys from Project Settings → API:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE` (the `service_role` secret — used server-side only, for the Stripe webhook and team invites)

**Storage:** `schema.sql` already creates a public `quotes` bucket. Photos and PDFs are stored at `{company_id}/{quote_id}/photo_N.jpg` and `{company_id}/{quote_id}/quote.pdf`. Bucket is public-read; writes are restricted by RLS to the uploader's own company folder.

**Security note on the public quote link:** the client-facing `/q/[token]` page never queries the `quotes` table directly with the anon key. It calls a `SECURITY DEFINER` Postgres function (`get_public_quote`) that returns exactly one row for an exact token match — so the anon key can't enumerate or bulk-read every company's quotes.

---

## 3. Stripe setup

1. Create a product **DigQuote Starter** with a recurring price of **$49.00/month**. Copy its **Price ID** (`price_...`) into `STRIPE_STARTER_PRICE_ID`.
2. Create a second product **DigQuote Pro** with a recurring price of **$149.00/month**. Copy its **Price ID** into `STRIPE_PRO_PRICE_ID`.
3. Copy your **Publishable key** (`pk_...`) into `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — the card-on-file form (Stripe Elements) needs it client-side.
4. Create a webhook endpoint pointing at `https://<your-domain>/api/stripe/webhook` listening for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Copy the webhook **Signing secret** (`whsec_...`).
6. For local testing, use the Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

There's no trial. Every company starts on the **Free** plan (`companies.plan = 'free'`): one AI-generated bid, ever, gated behind phone verification (see §3b) and a card on file (collected via a Stripe SetupIntent — never charged for the free bid itself). Upgrading to Starter or Pro is a normal Checkout session; `/api/stripe/webhook` maps the subscription's price id back to a plan via `lib/plans.ts`'s `planForStripePriceId()` and updates `companies.plan`. Canceling drops a company back to `free`. `/api/stripe/portal` opens Stripe's hosted Billing Portal so a Starter/Pro customer can cancel or change plans themselves — no admin work needed on your end.

---

## 3b. Twilio setup (free-bid phone verification)

The free plan's "one bid per business" limit is enforced by phone number, not email — email verification alone wouldn't stop someone from claiming a dozen free bids with a dozen inboxes. This needs a [Twilio](https://www.twilio.com) account with Verify enabled:

1. Create a **Verify Service** in the Twilio console. Copy its SID (`VA...`) into `TWILIO_VERIFY_SERVICE_SID`.
2. Copy your account's **Account SID** and **Auth Token** into `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`.
3. Generate a random secret (`openssl rand -hex 32`) for `PHONE_HASH_SECRET` — phone numbers are HMAC-hashed with this before being stored, so the app never keeps a plaintext or reversibly-hashed phone number at rest.

Twilio Lookup (included with the same credentials) also flags VOIP numbers, which are blocked from the free bid since they're trivial to generate in bulk.

If these four env vars aren't all set, `isTwilioConfigured()` returns false and the free-plan phone-verification step can't be completed — free-plan signups won't be able to generate their one bid until it's configured. Starter and Pro accounts are unaffected either way.

---

## 4. OpenAI & Resend

- `OPENAI_API_KEY` — needs GPT-4o (vision) access.
- `RESEND_API_KEY` — used to email quotes to clients.
- `RESEND_FROM_EMAIL` — optional. Defaults to `DigQuote <onboarding@resend.dev>`, Resend's built-in test sender, which **only delivers to your own Resend account email** — good for confirming "Email to Client" works end to end, useless for actually emailing clients. Once you verify your own domain in Resend (Domains → Add Domain → add the DNS records they give you), set this to `"DigQuote <quotes@yourdomain.com>"` and real client emails will start working — no code changes needed.

---

## 5. Environment variables

Copy `.env.example` to `.env.local` and fill in every value:

```
OPENAI_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_PRO_PRICE_ID=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_VERIFY_SERVICE_SID=
PHONE_HASH_SECRET=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The app needs the Supabase/OpenAI/Resend values to function at all — without them, Supabase-dependent pages (everything except the marketing homepage) will show an error until configured. The Stripe and Twilio values are needed for the Free plan's card-on-file step, phone verification, and any paid upgrade; see §3 and §3b above.

---

## 6. Run it locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`. Sign up, complete onboarding (create your company + default rates), and create your first quote — or log in as the seeded demo account above.

If Supabase isn't configured yet, every page except the marketing homepage will show a plain "DigQuote isn't set up yet" card telling you which env var is missing, instead of a raw error — that's expected until `.env.local` is filled in.

### Tests

```bash
npm test
```

Runs the pricing engine's unit tests (`lib/pricing.test.ts`) with [Vitest](https://vitest.dev) — the gravel/disposal/labor/equipment math, the manual-entry fallback formula, the "edit a line item" recalculation, and a rounding edge case (floating-point values like `1.005` that naive rounding gets wrong). One test is pinned to the exact total in `supabase/seed.sql`'s demo quote, so if you change the pricing formula, that test will tell you the seed data needs updating too.

---

## 7. Deploy to Vercel

1. Push this repo to GitHub.
2. Import it into Vercel.
3. Add all the environment variables from `.env.example` in Project Settings → Environment Variables (use your production Supabase/Stripe values; set `NEXT_PUBLIC_APP_URL` to your real domain).
4. Deploy.
5. Update the Stripe webhook endpoint and Google OAuth redirect URL to point at your production domain.

---

## How it works

### Auth & companies
Email/password + Google OAuth via Supabase Auth. On first sign-in, `/onboarding` creates a `companies` row (name, logo, default hourly rate, material markup %) and a `profiles` row linking the user to it as `admin`. Every table is scoped by `company_id` and locked down with Postgres RLS — see `supabase/schema.sql`.

### New quote flow (`/quotes/new`)
A 3-step mobile-first wizard (`components/quote-wizard.tsx`):
1. **Job info** — client name/address/phone (required), job type, notes.
2. **Photos** — 3–6 photos via `<input capture="environment">` so it opens the phone camera directly; tips shown for a wide shot + close-ups + a tape-measure shot.
3. **Generate** — uploads photos to Supabase Storage, then calls `/api/estimate`.

### AI estimation (`/api/estimate`)
Calls GPT-4o with vision on the uploaded photos plus job type/notes, asking for a structured JSON estimate (sqft, depth, cubic yards, gravel/sand tonnage, labor hours, equipment days, a 1–10 confidence score, and notes). The pricing engine in `lib/pricing.ts` then turns that into priced line items:

```
gravel_cost    = tons_gravel * rates.gravel_ton        ($150/ton Ohio default)
disposal_cost  = cubic_yards * rates.disposal_yard     ($45/yard default)
labor_cost     = excavator_hours * rates.excavator_hr + handwork_hours * rates.labor_hr
equipment_cost = equipment_days * rates.equipment_day  ($450/day default)
subtotal       = sum of the above
markup         = subtotal * (rates.markup_pct / 100)   (20% default)
profit         = subtotal * (rates.profit_pct / 100)   (15% default)
total          = subtotal + markup + profit
```

If GPT-4o fails, or returns confidence below 6/10, the quote is flagged `manual_mode` and the quote detail page shows a fallback form to enter square footage + depth directly (`/api/estimate/manual`) instead of trusting a shaky AI read. Once a quote has line items, they're editable in place on the quote detail page — a contractor can tweak any quantity or rate and the subtotal/markup/profit/total recompute live.

**Cost guard:** `/api/estimate` is rate-limited per company (20 calls / 10 minutes by default, see `lib/rate-limit.ts`) since each call is a real, metered OpenAI GPT-4o vision request. The limit is backed by a Postgres table (`api_usage_events`) rather than an in-memory counter, since Vercel serverless functions don't share memory across instances — an in-memory limit would silently under-enforce in production. The threshold is well above realistic usage (a crew doing back-to-back 60-second quotes nonstop would hit maybe 10 calls in 10 minutes) — it's there to catch a runaway loop or abusive script, not to cap the product's "unlimited quotes" promise. If a company hits the limit, they get a clear 429 message rather than a silent failure.

### PDF, email & the public client link
- `components/quote-pdf.tsx` (via `@react-pdf/renderer`) renders a branded PDF: logo, client info, photo grid, line-item table, big total, "valid 30 days," and the AI-estimate legal disclaimer.
- `GET /api/quotes/[id]/pdf` renders + caches the PDF to Storage and streams it back (used by "Download PDF").
- "Email to Client" (`emailQuoteToClient` in `app/actions.ts`) sends it via Resend with the PDF attached and flips the quote to `sent`.
- Every quote has a `public_token` and a `/q/[token]` page — no login required — where the client can view the estimate and tap **Approve**, which flips the quote to `won`. This is exposed through a token-gated Postgres function, not a raw table grant, so it can't be used to browse other companies' quotes.

### Dashboard (`/app`)
Stats cards (Total Quotes, Win Rate %, Pipeline $), a filterable table (status, date range), and one-tap Mark Won / Mark Lost actions.

### Billing
Three plans, no trial: **Free** ($0 — one bid, ever, phone-verified, card on file, watermarked draft PDF, can't be sent to a client), **Starter** ($49/mo — 30 bids/month, clean PDFs, send-to-client), **Pro** ($149/mo — unlimited bids, crew seats). `/pricing` starts a Stripe Checkout session (`/api/stripe/checkout`) for whichever plan the user picks; `/api/stripe/webhook` keeps `companies.plan` and `subscription_status` in sync from the subscription's price id (`lib/plans.ts`). Middleware re-checks plan + usage on every request — free blocks after the one bid, Starter blocks past 30 bids/month, both redirect to `/pricing`. `/api/stripe/portal` opens Stripe's Billing Portal so Starter/Pro customers can cancel or swap plans themselves.

The free bid itself is gated by `components/phone-gate.tsx` (Twilio Verify SMS code, VOIP numbers blocked via Twilio Lookup) and `components/card-on-file.tsx` (a Stripe SetupIntent that stores a card without charging it). `/api/estimate` re-checks plan, phone verification, and card-on-file server-side before generating a free bid — it never trusts the client's claim — and also perceptual-hashes (`lib/phash.ts`) each uploaded photo to block the same photos being reused across a different phone/company within 30 days. A free bid is watermarked, held behind a 5-minute reveal delay (`components/free-bid-reveal.tsx`), and can't be emailed to a client (`app/actions.ts` blocks it server-side too) — upgrading to Starter or Pro removes all three restrictions.

### Settings (`/settings`)
Company info + logo, pricing rates (feeds the pricing engine above), and team management — invite crew as **Admin** or **Estimator** (Supabase `auth.admin.inviteUserByEmail`, service-role only). Estimators don't see the Billing tab.

---

## Continuous integration

`.github/workflows/ci.yml` runs on every push and PR: type-check → pricing engine unit tests → `next build`. None of these steps need real Supabase/Stripe/OpenAI secrets — the app is built to fail gracefully without them (see `lib/config.ts` and `app/error.tsx`), so CI stays green on a fork with no secrets configured. It's checking that the code compiles, the pricing math is correct, and the app builds — not that your production credentials work.

---

## Legal safety

Every quote PDF and the public client page carry this disclaimer, per spec:

> Estimates are AI-generated for convenience only. Contractor must verify all measurements and site conditions. DigQuote is not liable for errors.

---

## Project structure

```
app/
  page.tsx                 marketing landing page
  login/ signup/ onboarding/   auth flow
  auth/callback/            OAuth + email-confirm callback
  pricing/                  Stripe checkout entry point
  q/[token]/                public, no-login client quote view
  (dashboard)/
    app/                    dashboard  → /app
    quotes/new/             new-quote wizard → /quotes/new
    quotes/[id]/            quote detail → /quotes/[id]
    settings/               → /settings
  api/
    estimate/               AI estimate + pricing engine
    estimate/manual/        manual sqft/depth fallback
    quotes/[id]/pdf/        PDF render + download
    stripe/checkout/        Stripe Checkout session
    stripe/webhook/         Stripe subscription sync
components/                 UI + feature components
lib/                        Supabase clients, pricing engine, OpenAI/Stripe/Resend wrappers
supabase/
  schema.sql                tables, RLS, storage bucket, public-quote functions
  seed.sql                  1 demo company + 1 demo quote
```
