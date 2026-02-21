-- ============================================================
-- FrySmart — Full Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. Config tables (no FKs to other tables)
-- ============================================================

create table trial_reasons (
  key text primary key,
  label text not null,
  type text not null check (type in ('successful', 'unsuccessful'))
);

create table volume_brackets (
  key text primary key,
  label text not null,
  color text not null
);

create table system_settings (
  id int primary key default 1 check (id = 1),
  warning_threshold int not null default 18,
  critical_threshold int not null default 24,
  default_fryer_count int not null default 4,
  trial_duration int not null default 7,
  report_frequency text not null default 'weekly',
  reminder_days int not null default 7,
  oil_type_options text[] not null default array['canola','palm','sunflower','soybean','cottonseed','tallow','blend','unknown'],
  theme_config jsonb not null default '{}'::jsonb,
  permissions_config jsonb not null default '{}'::jsonb
);

-- ============================================================
-- 2. competitors
-- ============================================================

create table competitors (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  code text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  type text not null default 'direct' check (type in ('direct', 'indirect')),
  states text[] not null default '{}',
  color text not null default '#e53e3e',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 3. oil_types (references competitors)
-- ============================================================

create table oil_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  code text not null,
  category text not null check (category in ('cookers', 'competitor')),
  tier text not null default 'standard' check (tier in ('standard', 'premium', 'elite')),
  oil_type text not null default 'canola' check (oil_type in ('canola', 'palm', 'sunflower', 'soybean', 'cottonseed', 'tallow', 'blend', 'unknown')),
  pack_size text not null default 'bulk' check (pack_size in ('bulk', '20l', '15l', '10l', '4l')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  competitor_id uuid references competitors(id) on delete set null
);

-- ============================================================
-- 4. profiles (linked to auth.users)
-- ============================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text,
  role text not null check (role in ('admin', 'mgt', 'state_manager', 'nam', 'bdm')),
  region text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  username text,
  rep_code text,
  crm_code text,
  password text,
  venue_id uuid,
  group_id uuid,
  last_active date
);

-- ============================================================
-- 5. groups (references profiles for nam_id)
-- ============================================================

create table groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  group_code text not null,
  username text,
  nam_id uuid references profiles(id) on delete set null,
  password text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  last_tpm_date date
);

-- ============================================================
-- 6. venues (references oil_types, groups, profiles)
-- ============================================================

create table venues (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'trial-only')),
  customer_code text,
  state text not null,
  fryer_count int not null default 4,
  volume_bracket text references volume_brackets(key),
  default_oil uuid references oil_types(id) on delete set null,
  group_id uuid references groups(id) on delete set null,
  bdm_id uuid references profiles(id) on delete set null,
  last_tpm_date date,
  trial_status text check (trial_status in ('pending', 'in-progress', 'completed', 'accepted', 'won', 'lost')),
  trial_start_date date,
  trial_end_date date,
  trial_oil_id uuid references oil_types(id) on delete set null,
  trial_notes text,
  current_weekly_avg numeric,
  current_price_per_litre numeric,
  offered_price_per_litre numeric,
  outcome_date date,
  trial_reason text references trial_reasons(key),
  sold_price_per_litre numeric,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 7. tpm_readings (references venues, profiles)
-- ============================================================

create table tpm_readings (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid not null references venues(id) on delete cascade,
  fryer_number int not null,
  reading_date date not null,
  reading_number int not null default 1,
  taken_by uuid references profiles(id) on delete set null,
  oil_age int,
  litres_filled numeric,
  tpm_value numeric,
  set_temperature numeric,
  actual_temperature numeric,
  filtered bool,
  food_type text,
  notes text,
  not_in_use bool not null default false,
  staff_name text,

  constraint tpm_readings_venue_fryer_date_num_unique
    unique (venue_id, fryer_number, reading_date, reading_number)
);

-- ============================================================
-- 8. Add deferred FK from profiles back to venues and groups
-- ============================================================

alter table profiles
  add constraint profiles_venue_id_fk
  foreign key (venue_id) references venues(id) on delete set null;

alter table profiles
  add constraint profiles_group_id_fk
  foreign key (group_id) references groups(id) on delete set null;

-- ============================================================
-- 9. Auto-update updated_at on competitors
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger competitors_updated_at
  before update on competitors
  for each row execute function update_updated_at();

-- ============================================================
-- 10. Seed config tables
-- ============================================================

insert into trial_reasons (key, label, type) values
  ('oil-lasted-longer', 'Oil Lasted Longer', 'successful'),
  ('better-food-quality', 'Better Food Quality', 'successful'),
  ('cost-savings', 'Cost Savings on Oil Usage', 'successful'),
  ('cleaner-frying', 'Cleaner Frying / Less Residue', 'successful'),
  ('bdm-relationship', 'BDM Relationship / Service', 'successful'),
  ('healthier-oil', 'Healthier Oil Option', 'successful'),
  ('easier-to-manage', 'Easier to Manage', 'successful'),
  ('consistent-results', 'Consistent Frying Results', 'successful'),
  ('better-value', 'Better Value for Money', 'successful'),
  ('recommended', 'Recommended by Others', 'successful'),
  ('trial-results', 'Trial Results Spoke for Themselves', 'successful'),
  ('reduced-oil-smell', 'Reduced Oil Smell', 'successful'),
  ('other-successful', 'Other', 'successful'),
  ('no-savings', 'No Savings Found', 'unsuccessful'),
  ('price-too-high', 'Price Too High', 'unsuccessful'),
  ('preferred-current', 'Preferred Current Supplier', 'unsuccessful'),
  ('quality-concern', 'Oil Quality Concerns', 'unsuccessful'),
  ('staff-resistance', 'Staff Resistance to Change', 'unsuccessful'),
  ('contract-locked', 'Locked Into Existing Contract', 'unsuccessful'),
  ('ownership-change', 'Ownership / Management Change', 'unsuccessful'),
  ('venue-closed', 'Venue Closed', 'unsuccessful'),
  ('chose-competitor', 'Chose Competitor', 'unsuccessful'),
  ('owner-not-interested', 'Owner Not Interested', 'unsuccessful'),
  ('no-response', 'No Response / Ghosted', 'unsuccessful'),
  ('other-unsuccessful', 'Other', 'unsuccessful');

insert into volume_brackets (key, label, color) values
  ('under-60', 'UNDER 60L', '#10b981'),
  ('60-100', '60 - 100L', '#eab308'),
  ('100-150', '100 - 150L', '#f97316'),
  ('150-plus', '150L+', '#ef4444');

insert into system_settings (warning_threshold, critical_threshold, default_fryer_count, trial_duration, report_frequency, reminder_days, oil_type_options)
values (18, 24, 4, 7, 'weekly', 7, array['canola','palm','sunflower','soybean','cottonseed','tallow','blend','unknown']);

-- ============================================================
-- 11. Enable Row Level Security on all tables
--     (policies will be added in a later phase)
-- ============================================================

alter table competitors enable row level security;
alter table oil_types enable row level security;
alter table profiles enable row level security;
alter table groups enable row level security;
alter table venues enable row level security;
alter table tpm_readings enable row level security;
alter table trial_reasons enable row level security;
alter table volume_brackets enable row level security;
alter table system_settings enable row level security;

-- Temporary permissive policies so the app works before
-- role-based RLS is implemented in Phase 3.
-- These allow all authenticated users full access.

create policy "Allow all for authenticated" on competitors
  for all to authenticated using (true) with check (true);

create policy "Allow all for authenticated" on oil_types
  for all to authenticated using (true) with check (true);

create policy "Allow all for authenticated" on profiles
  for all to authenticated using (true) with check (true);

create policy "Allow all for authenticated" on groups
  for all to authenticated using (true) with check (true);

create policy "Allow all for authenticated" on venues
  for all to authenticated using (true) with check (true);

create policy "Allow all for authenticated" on tpm_readings
  for all to authenticated using (true) with check (true);

create policy "Allow read for authenticated" on trial_reasons
  for select to authenticated using (true);

create policy "Allow read for authenticated" on volume_brackets
  for select to authenticated using (true);

create policy "Allow read for authenticated" on system_settings
  for select to authenticated using (true);

create policy "Allow update for authenticated" on system_settings
  for update to authenticated using (true) with check (true);

-- ============================================================
-- 12. Migration: fix live DB to add 'accepted' trial status
--     Run this on existing databases that were created before
--     the 'accepted' status was added to the CHECK constraint.
-- ============================================================

-- ALTER TABLE venues DROP CONSTRAINT venues_trial_status_check;
-- ALTER TABLE venues ADD CONSTRAINT venues_trial_status_check
--   CHECK (trial_status IN ('pending', 'in-progress', 'completed', 'accepted', 'won', 'lost'));

-- ============================================================
-- Done! All tables, constraints, seeds, and temp RLS created.
-- ============================================================
