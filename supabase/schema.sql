-- ============================================================================
-- DigQuote — Supabase schema
-- Run this in the Supabase SQL editor (or `supabase db push`) on a fresh project.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type quote_status as enum ('draft', 'sent', 'won', 'lost');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type user_role as enum ('admin', 'estimator');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'none');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type job_type as enum ('Patio', 'Driveway', 'Trench', 'Grading', 'Pool Dig', 'Demolition', 'Other');
exception
  when duplicate_object then null;
end $$;

-- Free-bid relaunch: replaces the old single $99/mo + 14-day-trial model with
-- Free (lifetime 1 bid, phone-verified) / Starter ($49/mo, 30 bids) / Pro ($149/mo,
-- unlimited + crew seats). See lib/plans.ts for the limits matrix.
do $$ begin
  create type company_plan as enum ('free', 'starter', 'pro');
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  owner_id uuid not null references auth.users (id) on delete cascade,
  phone text,
  email text,
  default_terms text default 'Estimate valid for 30 days. 50% deposit due at scheduling, balance due on completion.',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status subscription_status not null default 'none',
  trial_ends_at timestamptz,
  plan company_plan not null default 'free',
  -- Required before /api/estimate will generate a free bid. Collected via a Stripe
  -- SetupIntent (lib: app/api/stripe/setup-intent) — a card on file is most of what
  -- deters casual free-tier abuse, but it is never auto-charged without the customer
  -- explicitly confirming a Starter/Pro checkout afterwards.
  free_bid_card_on_file boolean not null default false,
  rates_json jsonb not null default '{
    "excavator_hr": 125,
    "labor_hr": 55,
    "markup_pct": 20,
    "profit_pct": 15,
    "gravel_ton": 150,
    "disposal_yard": 45,
    "equipment_day": 450
  }'::jsonb,
  -- Operator certifications (OSHA/excavator training, etc). Array of
  -- {id, title, issuer, cert_number, completion_date, expires_at, file_url}.
  -- Shown as trust badges on the public quote page + quote PDF.
  certifications jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Backfill for pre-existing rows if this migration runs after companies already exist.
alter table companies add column if not exists certifications jsonb not null default '[]'::jsonb;

-- Free-bid relaunch migration: kills the 14-day trial in favor of a permanent
-- one-bid Free plan (see lib/plans.ts). Safe to run repeatedly and safe on a table
-- that already has rows — trial_ends_at becomes optional rather than being dropped,
-- so nothing breaks if any historical row still has a value in it.
alter table companies add column if not exists plan company_plan not null default 'free';
alter table companies add column if not exists free_bid_card_on_file boolean not null default false;
alter table companies alter column trial_ends_at drop not null;
alter table companies alter column trial_ends_at drop default;
alter table companies alter column subscription_status set default 'none';
update companies set plan = 'free', subscription_status = 'none' where subscription_status = 'trialing';

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid references companies (id) on delete cascade,
  role user_role not null default 'admin',
  full_name text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  client_name text not null,
  address text not null,
  phone text not null,
  client_email text,
  job_type job_type not null default 'Other',
  notes text,
  photos_urls text[] not null default '{}',
  status quote_status not null default 'draft',
  ai_data_json jsonb,
  total numeric(10, 2),
  pdf_url text,
  public_token text not null default encode(gen_random_bytes(16), 'hex'),
  -- Free-bid relaunch: a free bid is watermarked, held behind a reveal delay, and
  -- can't be sent to a client (see app/api/estimate, components/free-bid-reveal.tsx).
  is_free_bid boolean not null default false,
  free_reveal_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table quotes add column if not exists is_free_bid boolean not null default false;
alter table quotes add column if not exists free_reveal_at timestamptz;

create unique index if not exists quotes_public_token_idx on quotes (public_token);
create index if not exists quotes_company_id_idx on quotes (company_id);
create index if not exists quotes_status_idx on quotes (status);
create index if not exists profiles_company_id_idx on profiles (company_id);

-- Rate-limiting log for endpoints with a real per-call cost (currently: the OpenAI
-- GPT-4o vision call in /api/estimate). One row per call; lib/rate-limit.ts counts
-- rows in a rolling window rather than maintaining a counter, which is simple and
-- correct even with concurrent requests. Old rows are cheap to prune periodically
-- (they're tiny and RLS-scoped), but not required for correctness.
create table if not exists api_usage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  endpoint text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Free-bid anti-abuse: phone verification + image-hash dedup.
-- Deliberately NOT scoped by company_id and have NO RLS policies (RLS is enabled
-- with zero policies, so only the service-role client can touch them) — the whole
-- point is catching abuse across different accounts/companies, which a per-company
-- policy would defeat.
-- ---------------------------------------------------------------------------
create table if not exists verified_phones (
  id uuid primary key default gen_random_uuid(),
  -- HMAC-SHA256 of the E.164 phone number (see lib/phone.ts's hashPhone, keyed by
  -- PHONE_HASH_SECRET) rather than a bare hash — plain E.164 numbers are low enough
  -- entropy that an unsalted/unkeyed hash is effectively reversible by anyone with
  -- database access.
  phone_hash text not null,
  is_voip boolean not null default false,
  ip text,
  device_fingerprint text,
  free_bid_used boolean not null default false,
  free_bid_quote_id uuid references quotes (id) on delete set null,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists verified_phones_phone_hash_idx on verified_phones (phone_hash);
alter table verified_phones enable row level security;

create table if not exists photo_hashes (
  id uuid primary key default gen_random_uuid(),
  -- dHash (perceptual hash) of an uploaded job photo — see lib/phash.ts. Used to
  -- block the same photos being reused across a different phone/company within
  -- PHASH_LOOKBACK_DAYS, a common free-tier abuse pattern.
  phash text not null,
  quote_id uuid references quotes (id) on delete cascade,
  company_id uuid references companies (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists photo_hashes_phash_idx on photo_hashes (phash);
alter table photo_hashes enable row level security;

create index if not exists api_usage_events_lookup_idx on api_usage_events (company_id, endpoint, created_at);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists quotes_set_updated_at on quotes;
create trigger quotes_set_updated_at
  before update on quotes
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper: current user's company_id (avoids recursive RLS lookups)
-- ---------------------------------------------------------------------------
create or replace function current_company_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select company_id from profiles where id = auth.uid();
$$;

create or replace function current_user_role()
returns user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table companies enable row level security;
alter table profiles enable row level security;
alter table quotes enable row level security;

-- companies: members can read their own company; only the owner can update it.
drop policy if exists "companies_select_own" on companies;
create policy "companies_select_own" on companies
  for select using (id = current_company_id() or owner_id = auth.uid());

drop policy if exists "companies_insert_self" on companies;
create policy "companies_insert_self" on companies
  for insert with check (owner_id = auth.uid());

drop policy if exists "companies_update_admin" on companies;
create policy "companies_update_admin" on companies
  for update using (owner_id = auth.uid() or (id = current_company_id() and current_user_role() = 'admin'));

-- profiles: users can read/update their own profile, and see teammates in their company.
drop policy if exists "profiles_select_self_or_company" on profiles;
create policy "profiles_select_self_or_company" on profiles
  for select using (id = auth.uid() or company_id = current_company_id());

drop policy if exists "profiles_insert_self" on profiles;
create policy "profiles_insert_self" on profiles
  for insert with check (id = auth.uid());

drop policy if exists "profiles_update_self_or_admin" on profiles;
create policy "profiles_update_self_or_admin" on profiles
  for update using (id = auth.uid() or (company_id = current_company_id() and current_user_role() = 'admin'));

-- quotes: strictly scoped to the user's company.
drop policy if exists "quotes_select_company" on quotes;
create policy "quotes_select_company" on quotes
  for select using (company_id = current_company_id());

drop policy if exists "quotes_insert_company" on quotes;
create policy "quotes_insert_company" on quotes
  for insert with check (company_id = current_company_id() and created_by = auth.uid());

drop policy if exists "quotes_update_company" on quotes;
create policy "quotes_update_company" on quotes
  for update using (company_id = current_company_id());

drop policy if exists "quotes_delete_admin" on quotes;
create policy "quotes_delete_admin" on quotes
  for delete using (company_id = current_company_id() and current_user_role() = 'admin');

-- api_usage_events: a company can log and count only its own calls.
alter table api_usage_events enable row level security;

drop policy if exists "api_usage_events_select_company" on api_usage_events;
create policy "api_usage_events_select_company" on api_usage_events
  for select using (company_id = current_company_id());

drop policy if exists "api_usage_events_insert_company" on api_usage_events;
create policy "api_usage_events_insert_company" on api_usage_events
  for insert with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- Storage bucket for job photos + generated PDFs
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('quotes', 'quotes', true)
on conflict (id) do nothing;

-- Public read (bucket is public), but writes are restricted to the owning company's
-- folder ({company_id}/{quote_id}/...), matched against the uploader's own company.
drop policy if exists "quotes_bucket_public_read" on storage.objects;
create policy "quotes_bucket_public_read" on storage.objects
  for select using (bucket_id = 'quotes');

drop policy if exists "quotes_bucket_company_insert" on storage.objects;
create policy "quotes_bucket_company_insert" on storage.objects
  for insert with check (
    bucket_id = 'quotes'
    and (storage.foldername(name))[1] = current_company_id()::text
  );

drop policy if exists "quotes_bucket_company_update" on storage.objects;
create policy "quotes_bucket_company_update" on storage.objects
  for update using (
    bucket_id = 'quotes'
    and (storage.foldername(name))[1] = current_company_id()::text
  );

drop policy if exists "quotes_bucket_company_delete" on storage.objects;
create policy "quotes_bucket_company_delete" on storage.objects
  for delete using (
    bucket_id = 'quotes'
    and (storage.foldername(name))[1] = current_company_id()::text
  );

-- ---------------------------------------------------------------------------
-- Public quote lookup (for the client-facing /q/[token] approval page).
-- No auth required. Implemented as a SECURITY DEFINER function rather than a
-- bare view+grant so the anon key can only ever fetch ONE quote at a time, by
-- its exact unguessable token — it can't enumerate or bulk-select every quote.
-- Excludes internal fields (created_by, company owner info, etc).
-- ---------------------------------------------------------------------------
-- The live function's return row (OUT params) predates the company_certifications
-- column and can't be changed via CREATE OR REPLACE — drop it first. The
-- companies.certifications column is added above (add column if not exists),
-- earlier in this same script, so it exists by the time this recreates the
-- function.
drop function if exists get_public_quote(text);

create or replace function get_public_quote(p_token text)
returns table (
  id uuid,
  public_token text,
  client_name text,
  address text,
  job_type job_type,
  status quote_status,
  total numeric,
  pdf_url text,
  photos_urls text[],
  created_at timestamptz,
  company_name text,
  company_logo_url text,
  company_phone text,
  company_email text,
  company_terms text,
  company_certifications jsonb
)
language sql
security definer
stable
set search_path = public
as $$
  select
    q.id, q.public_token, q.client_name, q.address, q.job_type, q.status,
    q.total, q.pdf_url, q.photos_urls, q.created_at,
    c.name, c.logo_url, c.phone, c.email, c.default_terms, c.certifications
  from quotes q
  join companies c on c.id = q.company_id
  where q.public_token = p_token;
$$;

grant execute on function get_public_quote(text) to anon, authenticated;

-- Lets a client approve their quote from the public page (also token-gated,
-- and only allowed while the quote is still 'sent').
create or replace function approve_public_quote(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update quotes set status = 'won' where public_token = p_token and status = 'sent';
$$;

grant execute on function approve_public_quote(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Voice Memo feature (New Bid / Change Order / Crew Note by voice).
-- Free = 0 voice attempts (button visible, always upsells). Starter = 30
-- voice bids per rolling calendar month (see lib/voice.ts's checkVoiceEligibility
-- — there's no stored Stripe billing-period boundary yet, so "per month" is
-- approximated as "since the 1st of the current UTC month," same simplification
-- as everywhere else in this schema that doesn't yet track period_start/end).
-- Pro = unlimited voice bids + Change Order and Crew Note voice types.
-- ---------------------------------------------------------------------------
do $$ begin
  create type voice_memo_type as enum ('bid', 'change_order', 'crew_note');
exception
  when duplicate_object then null;
end $$;

-- One row per completed (transcribed + parsed) voice memo, regardless of type.
-- Counting rows here (type='bid', created_at >= start of month) is how the
-- Starter 30/mo voice cap is enforced — mirrors api_usage_events' "insert one
-- row per successful call, count rows" pattern rather than a separate counter
-- column, so it can't drift out of sync with what actually happened.
create table if not exists voice_memos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  quote_id uuid references quotes (id) on delete set null,
  type voice_memo_type not null default 'bid',
  audio_url text not null,
  transcript text,
  -- {length, width, depth_inches, soil_type, access_ft, haul_ft, loads,
  --  address, customer_name, timeline, extra_notes} — see lib/openai.ts's
  -- parseVoiceTranscript. Nullable fields the parser couldn't extract are
  -- surfaced back to the contractor to fill in by hand (missed-field prompt).
  parsed_fields jsonb,
  created_at timestamptz not null default now()
);

create index if not exists voice_memos_company_type_created_idx
  on voice_memos (company_id, type, created_at);
alter table voice_memos enable row level security;

drop policy if exists "voice_memos_select_company" on voice_memos;
create policy "voice_memos_select_company" on voice_memos
  for select using (company_id = current_company_id());

drop policy if exists "voice_memos_insert_company" on voice_memos;
create policy "voice_memos_insert_company" on voice_memos
  for insert with check (company_id = current_company_id() and created_by = auth.uid());

-- Pro-only: "Add Change Order" voice type. Gets its own public_token (same
-- pattern as quotes) so a customer can view + sign it from an unauthenticated
-- link without seeing anything else in the account.
create table if not exists change_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  quote_id uuid references quotes (id) on delete set null,
  voice_memo_id uuid references voice_memos (id) on delete set null,
  description text not null default '',
  price numeric(10, 2),
  pdf_url text,
  customer_name text,
  public_token text not null default encode(gen_random_bytes(16), 'hex'),
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists change_orders_public_token_idx on change_orders (public_token);
create index if not exists change_orders_company_id_idx on change_orders (company_id);
alter table change_orders enable row level security;

drop policy if exists "change_orders_select_company" on change_orders;
create policy "change_orders_select_company" on change_orders
  for select using (company_id = current_company_id());

drop policy if exists "change_orders_insert_company" on change_orders;
create policy "change_orders_insert_company" on change_orders
  for insert with check (company_id = current_company_id() and created_by = auth.uid());

-- Signing happens from the public (unauthenticated) page via a security-definer
-- function, same shape as approve_public_quote below.
create or replace function sign_public_change_order(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update change_orders set signed_at = now() where public_token = p_token and signed_at is null;
$$;

grant execute on function sign_public_change_order(text) to anon, authenticated;

create or replace function get_public_change_order(p_token text)
returns table (
  id uuid,
  description text,
  price numeric,
  pdf_url text,
  customer_name text,
  signed_at timestamptz,
  created_at timestamptz,
  company_name text,
  company_phone text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    co.id, co.description, co.price, co.pdf_url, co.customer_name, co.signed_at, co.created_at,
    c.name, c.phone
  from change_orders co
  join companies c on c.id = co.company_id
  where co.public_token = p_token;
$$;

grant execute on function get_public_change_order(text) to anon, authenticated;

-- Pro-only: "Crew Note" voice type — a timestamped, append-only field log for
-- liability protection (e.g. "customer added scope on-site," "hit unexpected
-- rock at 2pm"). Deliberately has NO update/delete policy anywhere in this
-- schema — once created, a crew note can't be edited or removed by anyone
-- through the app, which is the point of keeping it as a liability record.
create table if not exists crew_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  quote_id uuid references quotes (id) on delete set null,
  voice_memo_id uuid references voice_memos (id) on delete set null,
  audio_url text not null,
  transcript text,
  created_at timestamptz not null default now()
);

create index if not exists crew_notes_company_id_idx on crew_notes (company_id, created_at);
alter table crew_notes enable row level security;

drop policy if exists "crew_notes_select_company" on crew_notes;
create policy "crew_notes_select_company" on crew_notes
  for select using (company_id = current_company_id());

drop policy if exists "crew_notes_insert_company" on crew_notes;
create policy "crew_notes_insert_company" on crew_notes
  for insert with check (company_id = current_company_id() and created_by = auth.uid());
