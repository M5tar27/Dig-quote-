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
  subscription_status subscription_status not null default 'trialing',
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
