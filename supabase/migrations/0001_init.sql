-- NutriTrack optional cloud schema (Supabase / PostgreSQL).
-- The app is local-first (IndexedDB) and does NOT require this. It is provided as the
-- migration for multi-device sync, which is not wired into the UI yet.

create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Friend',
  age int check (age is null or age > 0),
  height_cm numeric check (height_cm is null or height_cm > 0),
  weight_kg numeric check (weight_kg is null or weight_kg > 0),
  dietary_preference text not null default 'eggitarian'
    check (dietary_preference in ('vegetarian','eggitarian','non_vegetarian')),
  allergies_and_exclusions text[] not null default '{}',
  activity_level text check (activity_level in ('sedentary','light','moderate','active','very_active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nutrient_key text not null,
  target_value numeric not null check (target_value >= 0),
  unit text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, nutrient_key)
);

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade, -- null = shared database food
  name text not null,
  brand text,
  category text not null default 'Custom',
  default_serving_quantity numeric not null check (default_serving_quantity > 0),
  default_serving_unit text not null check (default_serving_unit in ('g','ml','piece','cup','tbsp','scoop')),
  reference_type text not null check (reference_type in ('per_100g','per_100ml','per_serving')),
  reference_quantity numeric not null check (reference_quantity > 0),
  reference_unit text not null,
  -- Missing nutrients are absent/null in the JSON, never 0.
  nutrient_values jsonb not null,
  density_conversion jsonb,
  data_source text not null,
  verification_status text not null check (verification_status in ('verified','unverified','ai_estimated')),
  price_per_serving numeric check (price_per_serving is null or price_per_serving >= 0),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.food_log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid references public.foods(id) on delete set null, -- snapshot survives food deletion
  food_name_snapshot text not null,
  serving_quantity numeric not null check (serving_quantity > 0),
  serving_unit text not null,
  nutrition_snapshot jsonb not null, -- frozen at log time; never recomputed from foods
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  entry_source text not null check (entry_source in ('manual','saved_food','combination','photo','recommendation')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  logged_at date not null, -- user's local calendar date
  created_at timestamptz not null default now()
);
create index on public.food_log_entries (user_id, logged_at);

create table public.food_combinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.food_combination_items (
  id uuid primary key default gen_random_uuid(),
  combination_id uuid not null references public.food_combinations(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  serving_quantity numeric not null check (serving_quantity > 0),
  serving_unit text not null
);

create table public.photo_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_reference text, -- path in private 'food-photos' bucket; null if user declined storage
  analysis_result jsonb not null,
  user_corrections jsonb,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null check (status in ('pending','reviewed','discarded')),
  created_at timestamptz not null default now()
);

-- ---------- Row-level security ----------
alter table public.profiles enable row level security;
alter table public.nutrition_goals enable row level security;
alter table public.foods enable row level security;
alter table public.food_log_entries enable row level security;
alter table public.food_combinations enable row level security;
alter table public.food_combination_items enable row level security;
alter table public.photo_analyses enable row level security;

create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own goals" on public.nutrition_goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own or shared foods readable" on public.foods for select using (owner_user_id is null or owner_user_id = auth.uid());
create policy "own foods writable" on public.foods for insert with check (owner_user_id = auth.uid());
create policy "own foods updatable" on public.foods for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "own foods deletable" on public.foods for delete using (owner_user_id = auth.uid());
create policy "own logs" on public.food_log_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own combinations" on public.food_combinations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own combination items" on public.food_combination_items for all
  using (exists (select 1 from public.food_combinations c where c.id = combination_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.food_combinations c where c.id = combination_id and c.user_id = auth.uid()));
create policy "own photo analyses" on public.photo_analyses for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Private photo storage ----------
insert into storage.buckets (id, name, public) values ('food-photos', 'food-photos', false)
  on conflict (id) do nothing;
-- Objects must be stored under "<user_id>/<file>".
create policy "own photos read" on storage.objects for select
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos write" on storage.objects for insert
  with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos delete" on storage.objects for delete
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Multi-device Cloud Sync table (used by lib/sync/sync-engine.ts) ----------
create table if not exists public.sync_records (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  collection text not null check (collection in ('foods','combinations','logs','profile','goals')),
  id         text not null,
  data       jsonb,
  deleted    boolean not null default false,
  updated_at timestamptz not null,
  primary key (user_id, collection, id)
);
alter table public.sync_records enable row level security;
drop policy if exists "own rows" on public.sync_records;
create policy "own rows" on public.sync_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

