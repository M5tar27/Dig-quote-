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

1. Create a product **DigQuote** with a recurring price of **$99.00/month**. Copy the **Price ID** (`price_...`).
2. Create a webhook endpoint pointing at `https://<your-domain>/api/stripe/webhook` listening for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
3. Copy the webhook **Signing secret** (`whsec_...`).
4. For local testing, use the Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

Every company gets a 14-day trial (`companies.trial_ends_at`) the moment they sign up — this is enforced independently of Stripe, and mirrored into the Checkout session's `trial_end` so Stripe doesn't charge until the same date. Middleware blocks `/quotes/new` once the trial has expired and there's no active subscription, redirecting to `/pricing`.

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
STRIPE_PRICE_ID=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The app needs these to function — without them, Supabase-dependent pages (everything except the marketing homepage) will show an error until configured.

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
`/pricing` starts a Stripe Checkout session (`/api/stripe/checkout`) for the $99/mo price, honoring whatever's left of the company's 14-day trial. `/api/stripe/webhook` keeps `companies.subscription_status` in sync. Middleware blocks quote creation once the trial's over and there's no active subscription.

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
