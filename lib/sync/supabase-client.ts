import { createClient, SupabaseClient } from "@supabase/supabase-js";

const LS_URL_KEY = "nutritrack_supabase_url";
const LS_ANON_KEY = "nutritrack_supabase_anon_key";

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = "";

export function getSupabaseConfig(): { url: string; anonKey: string; source: "env" | "local" | "none" } {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (envUrl && envKey) {
    return { url: envUrl, anonKey: envKey, source: "env" };
  }
  if (typeof window !== "undefined") {
    const localUrl = window.localStorage.getItem(LS_URL_KEY)?.trim() || "";
    const localKey = window.localStorage.getItem(LS_ANON_KEY)?.trim() || "";
    if (localUrl && localKey) {
      return { url: localUrl, anonKey: localKey, source: "local" };
    }
  }
  return { url: "", anonKey: "", source: "none" };
}

export function saveSupabaseConfigToLocal(url: string, anonKey: string) {
  if (typeof window === "undefined") return;
  const cleanUrl = url.trim().replace(/\/+$/, "");
  const cleanKey = anonKey.trim();
  if (cleanUrl && cleanKey) {
    window.localStorage.setItem(LS_URL_KEY, cleanUrl);
    window.localStorage.setItem(LS_ANON_KEY, cleanKey);
  } else {
    window.localStorage.removeItem(LS_URL_KEY);
    window.localStorage.removeItem(LS_ANON_KEY);
  }
  cachedClient = null;
  cachedConfigKey = "";
}

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;

  const key = `${url}::${anonKey}`;
  if (cachedClient && cachedConfigKey === key) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    cachedConfigKey = key;
    return cachedClient;
  } catch {
    return null;
  }
}

export const SUPABASE_SETUP_SQL = `create table if not exists public.sync_records (
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
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);`;
