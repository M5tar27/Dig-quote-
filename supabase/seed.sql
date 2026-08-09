-- ============================================================================
-- DigQuote — demo seed data
-- Run AFTER schema.sql. Creates one demo user/company + one demo quote so you
-- can log in and see the app populated immediately.
--
-- Demo login:
--   email:    demo@digquote.app
--   password: DigQuoteDemo123!
-- ============================================================================

do $$
declare
  v_user_id uuid := 'a0000000-0000-4000-8000-000000000001';
  v_company_id uuid := 'b0000000-0000-4000-8000-000000000001';
  v_quote_id uuid := 'c0000000-0000-4000-8000-000000000001';
begin
  -- Demo auth user (Supabase local/dev only — do not run against prod with real users).
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'demo@digquote.app',
    crypt('DigQuoteDemo123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}'
  )
  on conflict (id) do nothing;

  insert into companies (
    id, name, logo_url, owner_id, phone, email,
    subscription_status, trial_ends_at, rates_json
  )
  values (
    v_company_id,
    'Buckeye Excavation & Landscaping',
    null,
    v_user_id,
    '(614) 555-0142',
    'demo@digquote.app',
    'trialing',
    now() + interval '14 days',
    '{
      "excavator_hr": 125,
      "labor_hr": 55,
      "markup_pct": 20,
      "profit_pct": 15,
      "gravel_ton": 150,
      "disposal_yard": 45,
      "equipment_day": 450
    }'::jsonb
  )
  on conflict (id) do nothing;

  insert into profiles (id, company_id, role, full_name, email)
  values (v_user_id, v_company_id, 'admin', 'Dave Kowalski', 'demo@digquote.app')
  on conflict (id) do nothing;

  insert into quotes (
    id, company_id, created_by, client_name, address, phone, job_type, notes,
    photos_urls, status, ai_data_json, total, pdf_url, created_at
  )
  values (
    v_quote_id,
    v_company_id,
    v_user_id,
    'Karen Mitchell',
    '4521 Maple Ridge Dr, Westerville, OH 43081',
    '(614) 555-9981',
    'Patio',
    'Remove old concrete patio, haul off dirt, 12in dig, prep for pavers.',
    array[
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800',
      'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800'
    ],
    'sent',
    '{
      "estimate": {
        "sqft": 320,
        "avg_depth_inches": 12,
        "cubic_yards_to_remove": 13.2,
        "tons_gravel_needed": 8.5,
        "tons_sand_needed": 3.0,
        "labor_hours_excavator": 6,
        "labor_hours_handwork": 8,
        "equipment_days": 1,
        "confidence_1to10": 8,
        "notes": "Clear access from driveway. Verify no utility lines before digging near the east fence."
      },
      "line_items": [
        {"label": "Excavation labor", "quantity": 6, "unit": "hrs", "unit_cost": 125, "total": 750},
        {"label": "Hand labor", "quantity": 8, "unit": "hrs", "unit_cost": 55, "total": 440},
        {"label": "Equipment (mini-excavator)", "quantity": 1, "unit": "days", "unit_cost": 450, "total": 450},
        {"label": "Gravel", "quantity": 8.5, "unit": "tons", "unit_cost": 150, "total": 1275},
        {"label": "Disposal / haul-off", "quantity": 13.2, "unit": "cu yd", "unit_cost": 45, "total": 594},
        {"label": "Sand", "quantity": 3.0, "unit": "tons", "unit_cost": 60, "total": 180}
      ],
      "subtotal": 3689,
      "markup": 737.80,
      "profit": 553.35,
      "total": 4980.15,
      "ai_confidence_1to10": 8,
      "ai_notes": "Clear access from driveway. Verify no utility lines before digging near the east fence.",
      "manual_mode": false
    }'::jsonb,
    4980.15,
    null,
    now() - interval '2 days'
  )
  on conflict (id) do nothing;
end $$;
