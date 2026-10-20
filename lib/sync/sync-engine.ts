import {
  Food,
  FoodCombination,
  FoodLogEntry,
  NutritionGoal,
  SyncCollection,
  SyncTombstone,
  UserProfile,
} from "../nutrition/types";
import { STARTER_FOODS } from "../nutrition/starter-db";
import {
  deleteCombination,
  deleteFood,
  deleteFoodLogEntry,
  getAllCombinations,
  getAllFoodLogs,
  getAllFoods,
  getAllTombstones,
  getNutritionGoalsWithMeta,
  getSyncMeta,
  getUserProfile,
  saveCombination,
  saveFood,
  saveFoodLogEntry,
  saveNutritionGoals,
  saveUserProfile,
  seedStarterDataIfEmpty,
  setSyncMeta,
} from "../storage/indexed-db";
import { exportUserDataJSON, importUserDataJSON } from "../storage/export-import";
import { clearEverything } from "../storage/maintenance";
import { getSupabaseClient } from "./supabase-client";

const SIGNED_OUT_BACKUP_KEY = "eatflix_signed_out_backup_v1";
export const GUEST_PROFILE_ACTIVE_KEY = "eatflix_guest_profile_active";

export interface SyncRecordRow {
  collection: SyncCollection;
  id: string;
  data: any | null;
  deleted: boolean;
  updated_at: string;
}

const STARTER_MAP = new Map<string, string>(
  STARTER_FOODS.map((f) => [f.id, JSON.stringify({ ...f, createdAt: "", updatedAt: "" })])
);

export function isUnmodifiedStarterFood(food: Food): boolean {
  const baseline = STARTER_MAP.get(food.id);
  if (!baseline) return false;
  const normalized = JSON.stringify({ ...food, createdAt: "", updatedAt: "" });
  return baseline === normalized;
}

/**
 * Pure merge function: compares local records against remote records by `(collection, id)`.
 * Most recent `updated_at` wins. Equal timestamps favour remote (already in cloud).
 */
export function mergeRecords(
  localRows: SyncRecordRow[],
  remoteRows: SyncRecordRow[]
): {
  toUpload: SyncRecordRow[];
  toApplyLocally: SyncRecordRow[];
} {
  const localMap = new Map<string, SyncRecordRow>();
  for (const r of localRows) {
    localMap.set(`${r.collection}:${r.id}`, r);
  }

  const remoteMap = new Map<string, SyncRecordRow>();
  for (const r of remoteRows) {
    remoteMap.set(`${r.collection}:${r.id}`, r);
  }

  const allKeys = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);
  const toUpload: SyncRecordRow[] = [];
  const toApplyLocally: SyncRecordRow[] = [];

  for (const key of allKeys) {
    const loc = localMap.get(key);
    const rem = remoteMap.get(key);

    if (loc && !rem) {
      toUpload.push(loc);
    } else if (!loc && rem) {
      toApplyLocally.push(rem);
    } else if (loc && rem) {
      const locTime = Date.parse(loc.updated_at) || 0;
      const remTime = Date.parse(rem.updated_at) || 0;
      if (locTime > remTime) {
        toUpload.push(loc);
      } else if (remTime > locTime) {
        toApplyLocally.push(rem);
      } else if (loc.deleted !== rem.deleted) {
        // Tie-breaker: deletion wins if timestamps are identical
        if (loc.deleted) toUpload.push(loc);
        else toApplyLocally.push(rem);
      }
    }
  }

  return { toUpload, toApplyLocally };
}

export async function buildLocalSyncRows(): Promise<SyncRecordRow[]> {
  const rows: SyncRecordRow[] = [];
  const tombstones: SyncTombstone[] = await getAllTombstones();
  const tombstoneKeys = new Set<string>();

  for (const t of tombstones) {
    tombstoneKeys.add(t.key);
    rows.push({
      collection: t.collection,
      id: t.id,
      data: null,
      deleted: true,
      updated_at: t.updatedAt || new Date().toISOString(),
    });
  }

  const foods = await getAllFoods();
  for (const f of foods) {
    if (tombstoneKeys.has(`foods:${f.id}`)) continue;
    if (isUnmodifiedStarterFood(f)) continue;
    rows.push({
      collection: "foods",
      id: f.id,
      data: f,
      deleted: false,
      updated_at: f.updatedAt || f.createdAt || "1970-01-01T00:00:00.000Z",
    });
  }

  const combos = await getAllCombinations();
  for (const c of combos) {
    if (tombstoneKeys.has(`combinations:${c.id}`)) continue;
    rows.push({
      collection: "combinations",
      id: c.id,
      data: c,
      deleted: false,
      updated_at: c.updatedAt || c.createdAt || "1970-01-01T00:00:00.000Z",
    });
  }

  const logs = await getAllFoodLogs();
  for (const l of logs) {
    if (tombstoneKeys.has(`logs:${l.id}`)) continue;
    rows.push({
      collection: "logs",
      id: l.id,
      data: l,
      deleted: false,
      updated_at: l.updatedAt || l.createdAt || "1970-01-01T00:00:00.000Z",
    });
  }

  const profile = await getUserProfile();
  if (profile) {
    const isConfigured = Boolean(profile.displayName && profile.displayName.trim().length > 0 && profile.age != null);
    rows.push({
      collection: "profile",
      id: "default_user",
      data: profile,
      deleted: false,
      updated_at: isConfigured ? profile.updatedAt || profile.createdAt || "1970-01-01T00:00:00.000Z" : "1970-01-01T00:00:00.000Z",
    });
  }

  const goalsMeta = await getNutritionGoalsWithMeta();
  if (goalsMeta?.goals) {
    rows.push({
      collection: "goals",
      id: "default_goals",
      data: goalsMeta.goals,
      deleted: false,
      updated_at: goalsMeta.updatedAt || "1970-01-01T00:00:00.000Z",
    });
  }

  return rows;
}

export async function applyRemoteRowsToIndexedDB(rows: SyncRecordRow[]): Promise<void> {
  for (const r of rows) {
    if (r.collection === "foods") {
      if (r.deleted) {
        await deleteFood(r.id, true, r.updated_at);
      } else if (r.data) {
        await saveFood({ ...(r.data as Food), updatedAt: r.updated_at }, true);
      }
    } else if (r.collection === "combinations") {
      if (r.deleted) {
        await deleteCombination(r.id, true, r.updated_at);
      } else if (r.data) {
        await saveCombination({ ...(r.data as FoodCombination), updatedAt: r.updated_at }, true);
      }
    } else if (r.collection === "logs") {
      if (r.deleted) {
        await deleteFoodLogEntry(r.id, true, r.updated_at);
      } else if (r.data) {
        await saveFoodLogEntry({ ...(r.data as FoodLogEntry), updatedAt: r.updated_at }, true);
      }
    } else if (r.collection === "profile" && !r.deleted && r.data) {
      const localProfile = await getUserProfile();
      const remoteProfile = r.data as UserProfile;
      const mergedProfile: UserProfile = {
        ...localProfile,
        ...remoteProfile,
        displayName:
          remoteProfile.displayName && remoteProfile.displayName !== "Fitness Tracker"
            ? remoteProfile.displayName
            : localProfile.displayName || remoteProfile.displayName || "",
        age: remoteProfile.age ?? localProfile.age ?? null,
        biologicalSex: remoteProfile.biologicalSex ?? localProfile.biologicalSex ?? null,
        heightCm: remoteProfile.heightCm ?? localProfile.heightCm ?? null,
        weightKg: remoteProfile.weightKg ?? localProfile.weightKg ?? null,
        activityLevel: remoteProfile.activityLevel ?? localProfile.activityLevel,
        fitnessGoal: remoteProfile.fitnessGoal ?? localProfile.fitnessGoal ?? "maintain",
        updatedAt: r.updated_at,
      };
      await saveUserProfile(mergedProfile, true);
    } else if (r.collection === "goals" && !r.deleted && r.data) {
      await saveNutritionGoals(r.data as NutritionGoal, true, r.updated_at);
    }
  }
}

export async function restoreSignedOutBackupIfPresent(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(SIGNED_OUT_BACKUP_KEY);
  if (!raw) return false;
  try {
    const currentProfile = await getUserProfile();
    const isCurrentEmpty = !currentProfile.displayName || !currentProfile.displayName.trim();
    if (isCurrentEmpty) {
      await importUserDataJSON(raw);
    }
    window.localStorage.removeItem(SIGNED_OUT_BACKUP_KEY);
    if (typeof window.dispatchEvent === "function") {
      window.dispatchEvent(
        new CustomEvent("nutritrack:sync-complete", {
          detail: { uploaded: 0, downloaded: 1, syncedAt: new Date().toISOString() },
        })
      );
    }
    return true;
  } catch {
    return false;
  }
}

export async function ensureCleanWhenSignedOut(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) {
    return false;
  }

  // If the user explicitly saved a guest profile while signed out, keep it
  if (window.localStorage.getItem(GUEST_PROFILE_ACTIVE_KEY) === "true") {
    return false;
  }

  const profile = await getUserProfile();
  const hasProfileData = Boolean(
    (profile.displayName && profile.displayName.trim().length > 0) ||
      profile.age != null ||
      profile.heightCm != null ||
      profile.weightKg != null
  );

  if (!hasProfileData) {
    return false;
  }

  try {
    const backupJson = await exportUserDataJSON();
    window.localStorage.setItem(SIGNED_OUT_BACKUP_KEY, backupJson);
  } catch {
    // ignore backup serialization errors
  }

  await clearEverything();
  await seedStarterDataIfEmpty();
  window.localStorage.removeItem("eatflix_profile_step");

  if (typeof window.dispatchEvent === "function") {
    window.dispatchEvent(
      new CustomEvent("nutritrack:sync-complete", {
        detail: { uploaded: 0, downloaded: 1, syncedAt: new Date().toISOString() },
      })
    );
  }
  return true;
}

export async function signOutAndClearLocalData(): Promise<void> {
  const supabase = getSupabaseClient();

  // 1. Try a final cloud sync while still authenticated so latest changes are in Supabase
  try {
    if (supabase) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        await syncNow().catch(() => {});
      }
    }
  } catch {
    // ignore sync error during sign out
  }

  // 2. Save a local recovery snapshot in case Supabase table wasn't initialized yet
  if (typeof window !== "undefined") {
    try {
      const profile = await getUserProfile();
      if (profile.displayName && profile.displayName.trim().length > 0) {
        const backupJson = await exportUserDataJSON();
        window.localStorage.setItem(SIGNED_OUT_BACKUP_KEY, backupJson);
      }
    } catch {
      // ignore
    }
    window.localStorage.removeItem(GUEST_PROFILE_ACTIVE_KEY);
    window.localStorage.removeItem("eatflix_profile_step");
    window.sessionStorage.removeItem("eatflix_auth_prompt_dismissed");
  }

  // 3. Sign out of Supabase session
  if (supabase) {
    await supabase.auth.signOut().catch(() => {});
  }

  // 4. Clear IndexedDB profile, goals, logs, and foods so personal metrics are removed when signed out
  await clearEverything();
  await seedStarterDataIfEmpty();

  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(
      new CustomEvent("nutritrack:sync-complete", {
        detail: { uploaded: 0, downloaded: 1, syncedAt: new Date().toISOString() },
      })
    );
  }
}

let syncInFlight: Promise<{ uploaded: number; downloaded: number; syncedAt: string }> | null = null;

export async function syncNow(): Promise<{ uploaded: number; downloaded: number; syncedAt: string }> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase is not configured yet.");
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      throw new Error("Not signed in to Cloud Sync.");
    }

    // Restore any pre-sign-out snapshot before merging with remote records
    await restoreSignedOutBackupIfPresent();

    const { data: remoteData, error: fetchErr } = await supabase
      .from("sync_records")
      .select("collection, id, data, deleted, updated_at");

    if (fetchErr) {
      throw new Error(
        fetchErr.message.includes("sync_records")
          ? "Table 'sync_records' was not found in your Supabase project. Run the SQL setup snippet in Supabase SQL Editor first."
          : fetchErr.message
      );
    }

    const remoteRows: SyncRecordRow[] = (remoteData || []).map((r: any) => ({
      collection: r.collection as SyncCollection,
      id: String(r.id),
      data: r.data ?? null,
      deleted: Boolean(r.deleted),
      updated_at: String(r.updated_at),
    }));

    const localRows = await buildLocalSyncRows();
    const { toUpload, toApplyLocally } = mergeRecords(localRows, remoteRows);

    if (toApplyLocally.length > 0) {
      await applyRemoteRowsToIndexedDB(toApplyLocally);
    }

    if (toUpload.length > 0) {
      const payload = toUpload.map((r) => ({
        user_id: session.user.id,
        collection: r.collection,
        id: r.id,
        data: r.deleted ? null : r.data,
        deleted: r.deleted,
        updated_at: r.updated_at,
      }));

      const { error: upsertErr } = await supabase
        .from("sync_records")
        .upsert(payload, { onConflict: "user_id,collection,id" });

      if (upsertErr) {
        throw new Error(upsertErr.message);
      }
    }

    const syncedAt = new Date().toISOString();
    await setSyncMeta("lastSyncAt", syncedAt);

    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(
        new CustomEvent("nutritrack:sync-complete", {
          detail: { uploaded: toUpload.length, downloaded: toApplyLocally.length, syncedAt },
        })
      );
    }

    return { uploaded: toUpload.length, downloaded: toApplyLocally.length, syncedAt };
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

export async function getLastSyncTime(): Promise<string | null> {
  return getSyncMeta("lastSyncAt");
}
