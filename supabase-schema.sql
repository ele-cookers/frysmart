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
  permissions_config jsonb not null default '{}'::jsonb,
  target_win_rate numeric not null default 75,
  target_avg_time_to_decision int not null default 14,
  target_sold_price_per_litre numeric not null default 2.50,
  target_trials_per_month int not null default 12
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
  last_active date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  last_tpm_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 7. trials (references venues, oil_types, trial_reasons)
-- ============================================================

create table trials (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid not null references venues(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'in-progress', 'completed', 'accepted', 'won', 'lost')),
  start_date date,
  end_date date,
  trial_oil_id uuid references oil_types(id) on delete set null,
  notes text,
  current_weekly_avg numeric,
  current_price_per_litre numeric,
  offered_price_per_litre numeric,
  outcome_date date,
  trial_reason text references trial_reasons(key),
  sold_price_per_litre numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 8. tpm_readings (references venues, trials, profiles)
-- ============================================================

create table tpm_readings (
  id uuid primary key default uuid_generate_v4(),
  venue_id uuid not null references venues(id) on delete cascade,
  trial_id uuid references trials(id) on delete set null,
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
  created_at timestamptz not null default now(),

  constraint tpm_readings_venue_fryer_date_num_unique
    unique (venue_id, fryer_number, reading_date, reading_number)
);

-- ============================================================
-- 9. Add deferred FK from profiles back to venues and groups
-- ============================================================

alter table profiles
  add constraint profiles_venue_id_fk
  foreign key (venue_id) references venues(id) on delete set null;

alter table profiles
  add constraint profiles_group_id_fk
  foreign key (group_id) references groups(id) on delete set null;

-- ============================================================
-- 10. Auto-update updated_at on competitors, venues & trials
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

create trigger venues_updated_at
  before update on venues
  for each row execute function update_updated_at();

create trigger trials_updated_at
  before update on trials
  for each row execute function update_updated_at();

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

create trigger groups_updated_at
  before update on groups
  for each row execute function update_updated_at();

-- ============================================================
-- 11. Indexes for query performance
-- ============================================================

-- trials: venue lookups, status filtering, date queries
create index idx_trials_venue_id on trials(venue_id);
create index idx_trials_status on trials(status);
create index idx_trials_outcome_date on trials(outcome_date);

-- tpm_readings: venue/trial lookups, date queries
create index idx_tpm_readings_venue_id on tpm_readings(venue_id);
create index idx_tpm_readings_trial_id on tpm_readings(trial_id);
create index idx_tpm_readings_reading_date on tpm_readings(reading_date);

-- venues: group/bdm lookups, status filtering
create index idx_venues_group_id on venues(group_id);
create index idx_venues_bdm_id on venues(bdm_id);
create index idx_venues_status on venues(status);

-- profiles: role-based queries
create index idx_profiles_role on profiles(role);

-- oil_types: competitor lookups
create index idx_oil_types_competitor_id on oil_types(competitor_id);

-- ============================================================
-- 12. Seed config tables
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
-- 13. Enable Row Level Security on all tables
-- ============================================================

alter table competitors enable row level security;
alter table oil_types enable row level security;
alter table profiles enable row level security;
alter table groups enable row level security;
alter table venues enable row level security;
alter table trials enable row level security;
alter table tpm_readings enable row level security;
alter table trial_reasons enable row level security;
alter table volume_brackets enable row level security;
alter table system_settings enable row level security;

-- ============================================================
-- 14. user_roles — shadow table (NO RLS) to break circular dependency
--
--     Helper functions need to know the caller's role, but querying
--     'profiles' from within profiles' own RLS policies creates an
--     infinite loop. This table mirrors id/role/region from profiles,
--     has NO RLS enabled, and is kept in sync via trigger.
-- ============================================================

create table user_roles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null,
  region text
);

-- No RLS on user_roles — this is intentional.
-- Only authenticated users can SELECT (granted below), and writes
-- happen exclusively via the sync trigger (SECURITY DEFINER).

grant select on user_roles to authenticated;

-- Sync trigger: keeps user_roles in sync with profiles
create or replace function sync_user_roles()
returns trigger language plpgsql security definer as $$
begin
  if (tg_op = 'DELETE') then
    delete from user_roles where id = old.id;
    return old;
  end if;
  insert into user_roles (id, role, region)
    values (new.id, new.role, new.region)
    on conflict (id) do update set role = excluded.role, region = excluded.region;
  return new;
end;
$$;

create trigger trg_sync_user_roles
  after insert or update of role, region or delete on profiles
  for each row execute function sync_user_roles();

-- Backfill existing profiles into user_roles
insert into user_roles (id, role, region)
  select id, role, region from profiles
  on conflict (id) do update set role = excluded.role, region = excluded.region;

-- ============================================================
-- 15. RLS helper functions
--     STABLE SECURITY DEFINER — cached per-statement.
--     All role lookups query user_roles (no RLS) to avoid circular deps.
-- ============================================================

create or replace function auth_email_prefix()
returns text language sql stable security definer as $$
  select split_part(auth.jwt() ->> 'email', '@', 1);
$$;

create or replace function get_my_role()
returns text language sql stable security definer as $$
  select coalesce(
    (select role from user_roles where id = auth.uid()),
    (select 'venue_staff' from venues where customer_code = upper(auth_email_prefix()) limit 1),
    (select 'group_viewer' from groups where lower(username) = lower(auth_email_prefix()) limit 1),
    'none'
  );
$$;

create or replace function get_my_region()
returns text language sql stable security definer as $$
  select region from user_roles where id = auth.uid();
$$;

create or replace function get_my_profile_id()
returns uuid language sql stable security definer as $$
  select id from user_roles where id = auth.uid();
$$;

create or replace function get_my_venue_id()
returns uuid language sql stable security definer as $$
  select id from venues where customer_code = upper(auth_email_prefix()) limit 1;
$$;

create or replace function get_my_group_id()
returns uuid language sql stable security definer as $$
  select id from groups where lower(username) = lower(auth_email_prefix()) limit 1;
$$;

create or replace function is_admin_or_mgt()
returns boolean language sql stable security definer as $$
  select exists (select 1 from user_roles where id = auth.uid() and role in ('admin', 'mgt'));
$$;

create or replace function is_admin()
returns boolean language sql stable security definer as $$
  select exists (select 1 from user_roles where id = auth.uid() and role = 'admin');
$$;

-- ============================================================
-- 16. RLS indexes (support helper function & policy performance)
-- ============================================================

create index if not exists idx_venues_customer_code on venues(customer_code);
create index if not exists idx_groups_username_lower on groups(lower(username));
create index if not exists idx_venues_state on venues(state);
create index if not exists idx_groups_nam_id on groups(nam_id);

-- ============================================================
-- 17. RLS policies — role-based access control
--
-- Access matrix:
--   admin/mgt:       full CRUD on all tables
--   state_manager:   SELECT on data in their region
--   nam:             SELECT on their assigned groups + child data
--   bdm:             CRUD on their assigned venues + trials + readings
--   venue_staff:     SELECT/INSERT/UPDATE on own venue + readings
--   group_viewer:    SELECT on own group + venues + readings
-- ============================================================

-- ── config tables (read-only for all, write for admin) ──

create policy "trial_reasons_select" on trial_reasons
  for select to authenticated using (true);

create policy "volume_brackets_select" on volume_brackets
  for select to authenticated using (true);

create policy "system_settings_select" on system_settings
  for select to authenticated using (true);

create policy "system_settings_update_admin" on system_settings
  for update to authenticated using (is_admin()) with check (is_admin());

-- ── competitors (read all, write admin/mgt) ──

create policy "competitors_select" on competitors
  for select to authenticated using (true);

create policy "competitors_insert_admin" on competitors
  for insert to authenticated with check (is_admin_or_mgt());

create policy "competitors_update_admin" on competitors
  for update to authenticated using (is_admin_or_mgt()) with check (is_admin_or_mgt());

create policy "competitors_delete_admin" on competitors
  for delete to authenticated using (is_admin_or_mgt());

-- ── oil_types (read all, write admin/mgt) ──

create policy "oil_types_select" on oil_types
  for select to authenticated using (true);

create policy "oil_types_insert_admin" on oil_types
  for insert to authenticated with check (is_admin_or_mgt());

create policy "oil_types_update_admin" on oil_types
  for update to authenticated using (is_admin_or_mgt()) with check (is_admin_or_mgt());

create policy "oil_types_delete_admin" on oil_types
  for delete to authenticated using (is_admin_or_mgt());

-- ── profiles ──
--     SELECT: any user with a row in user_roles can see all profiles
--     (no circular reference — uses user_roles, not profiles itself)

create policy "profiles_select" on profiles
  for select to authenticated
  using (exists (select 1 from user_roles ur where ur.id = auth.uid()));

create policy "profiles_insert_admin" on profiles
  for insert to authenticated with check (is_admin_or_mgt());

create policy "profiles_update" on profiles
  for update to authenticated
  using (is_admin_or_mgt() or id = auth.uid())
  with check (is_admin_or_mgt() or id = auth.uid());

create policy "profiles_delete_admin" on profiles
  for delete to authenticated using (is_admin_or_mgt());

-- ── groups ──

create policy "groups_select" on groups
  for select to authenticated using (
    is_admin_or_mgt()
    or (get_my_role() = 'state_manager'
        and exists (select 1 from venues v where v.group_id = groups.id and v.state = get_my_region()))
    or (get_my_role() = 'nam' and nam_id = get_my_profile_id())
    or (get_my_role() = 'bdm'
        and exists (select 1 from venues v where v.group_id = groups.id and v.bdm_id = get_my_profile_id()))
    or (get_my_role() = 'group_viewer' and id = get_my_group_id())
  );

create policy "groups_insert_admin" on groups
  for insert to authenticated with check (is_admin_or_mgt());

create policy "groups_update_admin" on groups
  for update to authenticated using (is_admin_or_mgt()) with check (is_admin_or_mgt());

create policy "groups_delete_admin" on groups
  for delete to authenticated using (is_admin_or_mgt());

-- ── venues ──

create policy "venues_select" on venues
  for select to authenticated using (
    is_admin_or_mgt()
    or (get_my_role() = 'state_manager' and state = get_my_region())
    or (get_my_role() = 'nam'
        and exists (select 1 from groups g where g.id = venues.group_id and g.nam_id = get_my_profile_id()))
    or (get_my_role() = 'bdm' and bdm_id = get_my_profile_id())
    or (get_my_role() = 'venue_staff' and id = get_my_venue_id())
    or (get_my_role() = 'group_viewer' and group_id = get_my_group_id())
  );

create policy "venues_insert" on venues
  for insert to authenticated with check (
    is_admin_or_mgt()
    or (get_my_role() = 'bdm' and bdm_id = get_my_profile_id())
  );

create policy "venues_update" on venues
  for update to authenticated
  using (
    is_admin_or_mgt()
    or (get_my_role() = 'bdm' and bdm_id = get_my_profile_id())
    or (get_my_role() = 'venue_staff' and id = get_my_venue_id())
  )
  with check (
    is_admin_or_mgt()
    or (get_my_role() = 'bdm' and bdm_id = get_my_profile_id())
    or (get_my_role() = 'venue_staff' and id = get_my_venue_id())
  );

create policy "venues_delete_admin" on venues
  for delete to authenticated using (is_admin_or_mgt());

-- ── trials ──

create policy "trials_select" on trials
  for select to authenticated using (
    is_admin_or_mgt()
    or (get_my_role() = 'state_manager'
        and exists (select 1 from venues v where v.id = trials.venue_id and v.state = get_my_region()))
    or (get_my_role() = 'nam'
        and exists (select 1 from venues v join groups g on g.id = v.group_id
                    where v.id = trials.venue_id and g.nam_id = get_my_profile_id()))
    or (get_my_role() = 'bdm'
        and exists (select 1 from venues v where v.id = trials.venue_id and v.bdm_id = get_my_profile_id()))
  );

create policy "trials_insert" on trials
  for insert to authenticated with check (
    is_admin_or_mgt()
    or (get_my_role() = 'bdm'
        and exists (select 1 from venues v where v.id = venue_id and v.bdm_id = get_my_profile_id()))
  );

create policy "trials_update" on trials
  for update to authenticated
  using (
    is_admin_or_mgt()
    or (get_my_role() = 'bdm'
        and exists (select 1 from venues v where v.id = trials.venue_id and v.bdm_id = get_my_profile_id()))
  )
  with check (
    is_admin_or_mgt()
    or (get_my_role() = 'bdm'
        and exists (select 1 from venues v where v.id = venue_id and v.bdm_id = get_my_profile_id()))
  );

create policy "trials_delete_admin" on trials
  for delete to authenticated using (is_admin_or_mgt());

-- ── tpm_readings ──

create policy "tpm_readings_select" on tpm_readings
  for select to authenticated using (
    is_admin_or_mgt()
    or (get_my_role() = 'state_manager'
        and exists (select 1 from venues v where v.id = tpm_readings.venue_id and v.state = get_my_region()))
    or (get_my_role() = 'nam'
        and exists (select 1 from venues v join groups g on g.id = v.group_id
                    where v.id = tpm_readings.venue_id and g.nam_id = get_my_profile_id()))
    or (get_my_role() = 'bdm'
        and exists (select 1 from venues v where v.id = tpm_readings.venue_id and v.bdm_id = get_my_profile_id()))
    or (get_my_role() = 'venue_staff' and venue_id = get_my_venue_id())
    or (get_my_role() = 'group_viewer'
        and exists (select 1 from venues v where v.id = tpm_readings.venue_id and v.group_id = get_my_group_id()))
  );

create policy "tpm_readings_insert" on tpm_readings
  for insert to authenticated with check (
    is_admin_or_mgt()
    or (get_my_role() = 'bdm'
        and exists (select 1 from venues v where v.id = venue_id and v.bdm_id = get_my_profile_id()))
    or (get_my_role() = 'venue_staff' and venue_id = get_my_venue_id())
  );

create policy "tpm_readings_update" on tpm_readings
  for update to authenticated
  using (
    is_admin_or_mgt()
    or (get_my_role() = 'bdm'
        and exists (select 1 from venues v where v.id = tpm_readings.venue_id and v.bdm_id = get_my_profile_id()))
    or (get_my_role() = 'venue_staff' and venue_id = get_my_venue_id())
  )
  with check (
    is_admin_or_mgt()
    or (get_my_role() = 'bdm'
        and exists (select 1 from venues v where v.id = venue_id and v.bdm_id = get_my_profile_id()))
    or (get_my_role() = 'venue_staff' and venue_id = get_my_venue_id())
  );

create policy "tpm_readings_delete_admin" on tpm_readings
  for delete to authenticated using (is_admin_or_mgt());

-- ============================================================
-- Done! All tables, constraints, indexes, seeds, user_roles & RLS.
-- ============================================================
