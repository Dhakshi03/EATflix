import {
  Food,
  FoodCombination,
  FoodLogEntry,
  NutritionGoal,
  UserProfile,
  PhotoAnalysis,
  SyncTombstone,
  SyncCollection,
} from "../nutrition/types";
import { STARTER_FOODS } from "../nutrition/starter-db";

const DB_NAME = "NutriTrackDB";
const DB_VERSION = 2;

export interface StorageData {
  profile: UserProfile;
  goals: NutritionGoal;
  goalsUpdatedAt?: string;
  foods: Food[];
  combinations: FoodCombination[];
  logs: FoodLogEntry[];
  photos: PhotoAnalysis[];
  tombstones: SyncTombstone[];
  meta: Record<string, string>;
}

export const DEFAULT_PROFILE: UserProfile = {
  id: "default_user",
  displayName: "",
  age: null,
  biologicalSex: null,
  heightCm: null,
  weightKg: null,
  dietaryPreference: "eggitarian",
  allergiesAndExclusions: [],
  activityLevel: undefined,
  fitnessGoal: "maintain",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const DEFAULT_GOALS: NutritionGoal = {
  protein: 80,
  calories: 2000,
  carbohydrates: 220,
  totalFat: 65,
  fibre: 30,
  iron: 18,
  calcium: 1000,
  zinc: 11,
  vitB12: 2.4,
  vitD: 600,
  folate: 400,
};

let memoryFallbackStore: StorageData | null = null;

function getMemoryStore(): StorageData {
  if (!memoryFallbackStore) {
    memoryFallbackStore = {
      profile: { ...DEFAULT_PROFILE },
      goals: { ...DEFAULT_GOALS },
      goalsUpdatedAt: new Date().toISOString(),
      foods: [],
      combinations: [],
      logs: [],
      photos: [],
      tombstones: [],
      meta: {},
    };
  }
  return memoryFallbackStore;
}

/**
 * Combines the user's personal saved foods with the built-in common foods catalog (`STARTER_FOODS`),
 * giving precedence to user-saved items if an ID matches.
 */
export function mergeSavedAndCommonFoods(savedFoods: Food[]): Food[] {
  const savedIds = new Set(savedFoods.map((f) => f.id));
  return [...savedFoods, ...STARTER_FOODS.filter((f) => !savedIds.has(f.id))];
}

function emitLocalChange(fromSync?: boolean) {
  if (fromSync) return;
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("nutritrack:local-change"));
  }
}

export async function openNutriDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof globalThis === "undefined" || !globalThis.indexedDB) {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }

    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("profile")) {
        db.createObjectStore("profile", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("goals")) {
        db.createObjectStore("goals", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("foods")) {
        const foodStore = db.createObjectStore("foods", { keyPath: "id" });
        foodStore.createIndex("category", "category", { unique: false });
        foodStore.createIndex("isArchived", "isArchived", { unique: false });
      }
      if (!db.objectStoreNames.contains("combinations")) {
        db.createObjectStore("combinations", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("logs")) {
        const logStore = db.createObjectStore("logs", { keyPath: "id" });
        logStore.createIndex("loggedAt", "loggedAt", { unique: false });
        logStore.createIndex("mealType", "mealType", { unique: false });
      }
      if (!db.objectStoreNames.contains("photos")) {
        db.createObjectStore("photos", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("tombstones")) {
        db.createObjectStore("tombstones", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Initialize default profile/goals and clean out any legacy auto-seeded starter foods
// so the user's Saved Foods list only contains foods they explicitly saved.
export async function seedStarterDataIfEmpty(): Promise<void> {
  try {
    const cleanedFlag = await getSyncMeta("cleanedAutoSeededStarterFoods");
    if (!cleanedFlag) {
      const foods = await getAllFoods();
      const db = await openNutriDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("foods", "readwrite");
        const store = tx.objectStore("foods");
        for (const f of foods) {
          if (f.dataSource === "starter_verified" && f.ownerUserId === null) {
            store.delete(f.id);
          }
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      await setSyncMeta("cleanedAutoSeededStarterFoods", "true");
    }

    const profile = await getUserProfile();
    if (!profile) {
      await saveUserProfile(DEFAULT_PROFILE, true);
    } else {
      const cleanedProfileFlag = await getSyncMeta("cleanedAutoSeededProfile");
      if (
        !cleanedProfileFlag &&
        profile.displayName === "Fitness Tracker" &&
        profile.age === 26 &&
        profile.heightCm === 175 &&
        profile.weightKg === 70 &&
        !profile.biologicalSex
      ) {
        await saveUserProfile({ ...DEFAULT_PROFILE, id: profile.id }, true);
      }
      if (!cleanedProfileFlag) {
        await setSyncMeta("cleanedAutoSeededProfile", "true");
      }
    }

    const goals = await getNutritionGoals();
    if (!goals) {
      await saveNutritionGoals(DEFAULT_GOALS, true);
    }
  } catch (err) {
    console.warn("Using memory fallback store for seed data:", err);
    getMemoryStore();
  }
}

export async function getAllTombstones(): Promise<SyncTombstone[]> {
  try {
    const db = await openNutriDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tombstones", "readonly");
      const store = tx.objectStore("tombstones");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return getMemoryStore().tombstones;
  }
}

export async function saveTombstone(tombstone: SyncTombstone): Promise<void> {
  try {
    const db = await openNutriDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("tombstones", "readwrite");
      const store = tx.objectStore("tombstones");
      const req = store.put(tombstone);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    const store = getMemoryStore();
    const idx = store.tombstones.findIndex((t) => t.key === tombstone.key);
    if (idx >= 0) store.tombstones[idx] = tombstone;
    else store.tombstones.push(tombstone);
  }
}

export async function removeTombstone(collection: SyncCollection, id: string): Promise<void> {
  const key = `${collection}:${id}`;
  try {
    const db = await openNutriDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("tombstones", "readwrite");
      const store = tx.objectStore("tombstones");
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    const store = getMemoryStore();
    store.tombstones = store.tombstones.filter((t) => t.key !== key);
  }
}

export async function getSyncMeta(key: string): Promise<string | null> {
  try {
    const db = await openNutriDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("meta", "readonly");
      const store = tx.objectStore("meta");
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return getMemoryStore().meta[key] ?? null;
  }
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  try {
    const db = await openNutriDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("meta", "readwrite");
      const store = tx.objectStore("meta");
      const req = store.put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    getMemoryStore().meta[key] = value;
  }
}

export async function getUserProfile(): Promise<UserProfile> {
  try {
    const db = await openNutriDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("profile", "readonly");
      const store = tx.objectStore("profile");
      const req = store.get("default_user");
      req.onsuccess = () => resolve(req.result || DEFAULT_PROFILE);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return getMemoryStore().profile;
  }
}

export async function saveUserProfile(profile: UserProfile, fromSync = false): Promise<UserProfile> {
  const updated: UserProfile = {
    ...profile,
    id: "default_user",
    updatedAt: fromSync && profile.updatedAt ? profile.updatedAt : new Date().toISOString(),
  };
  try {
    const db = await openNutriDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("profile", "readwrite");
      const store = tx.objectStore("profile");
      const req = store.put(updated);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    emitLocalChange(fromSync);
    return updated;
  } catch {
    const store = getMemoryStore();
    store.profile = updated;
    emitLocalChange(fromSync);
    return store.profile;
  }
}

export async function getNutritionGoalsWithMeta(): Promise<{ goals: NutritionGoal; updatedAt: string }> {
  try {
    const db = await openNutriDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("goals", "readonly");
      const store = tx.objectStore("goals");
      const req = store.get("default_goals");
      req.onsuccess = () => {
        if (req.result && req.result.goals) {
          resolve({
            goals: req.result.goals,
            updatedAt: req.result.updatedAt || "1970-01-01T00:00:00.000Z",
          });
        } else {
          resolve({ goals: DEFAULT_GOALS, updatedAt: "1970-01-01T00:00:00.000Z" });
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    const store = getMemoryStore();
    return { goals: store.goals, updatedAt: store.goalsUpdatedAt || "1970-01-01T00:00:00.000Z" };
  }
}

export async function getNutritionGoals(): Promise<NutritionGoal> {
  const res = await getNutritionGoalsWithMeta();
  return res.goals;
}

export async function saveNutritionGoals(
  goals: NutritionGoal,
  fromSync = false,
  customUpdatedAt?: string
): Promise<NutritionGoal> {
  const updatedAt = fromSync && customUpdatedAt ? customUpdatedAt : new Date().toISOString();
  try {
    const db = await openNutriDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("goals", "readwrite");
      const store = tx.objectStore("goals");
      const req = store.put({ id: "default_goals", goals, updatedAt });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    emitLocalChange(fromSync);
    return goals;
  } catch {
    const store = getMemoryStore();
    store.goals = { ...goals };
    store.goalsUpdatedAt = updatedAt;
    emitLocalChange(fromSync);
    return store.goals;
  }
}

export async function getAllFoods(): Promise<Food[]> {
  try {
    const db = await openNutriDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("foods", "readonly");
      const store = tx.objectStore("foods");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return getMemoryStore().foods;
  }
}

export async function saveFood(food: Food, fromSync = false): Promise<Food> {
  const updated: Food = {
    ...food,
    updatedAt: fromSync && food.updatedAt ? food.updatedAt : new Date().toISOString(),
  };
  await removeTombstone("foods", updated.id);
  try {
    const db = await openNutriDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("foods", "readwrite");
      const store = tx.objectStore("foods");
      const req = store.put(updated);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    emitLocalChange(fromSync);
    return updated;
  } catch {
    const store = getMemoryStore();
    const idx = store.foods.findIndex((f) => f.id === updated.id);
    if (idx >= 0) store.foods[idx] = updated;
    else store.foods.push(updated);
    emitLocalChange(fromSync);
    return updated;
  }
}

export async function deleteFood(foodId: string, fromSync = false, deletedAt?: string): Promise<void> {
  await saveTombstone({
    key: `foods:${foodId}`,
    collection: "foods",
    id: foodId,
    updatedAt: deletedAt || new Date().toISOString(),
  });
  try {
    const db = await openNutriDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("foods", "readwrite");
      const store = tx.objectStore("foods");
      const req = store.delete(foodId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    emitLocalChange(fromSync);
  } catch {
    const store = getMemoryStore();
    store.foods = store.foods.filter((f) => f.id !== foodId);
    emitLocalChange(fromSync);
  }
}

export async function getFoodLogsByDate(dateIso: string): Promise<FoodLogEntry[]> {
  try {
    const db = await openNutriDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("logs", "readonly");
      const store = tx.objectStore("logs");
      const index = store.index("loggedAt");
      const req = index.getAll(dateIso);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return getMemoryStore().logs.filter((l) => l.loggedAt === dateIso);
  }
}

export async function getAllFoodLogs(): Promise<FoodLogEntry[]> {
  try {
    const db = await openNutriDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("logs", "readonly");
      const store = tx.objectStore("logs");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return getMemoryStore().logs;
  }
}

export async function saveFoodLogEntry(entry: FoodLogEntry, fromSync = false): Promise<FoodLogEntry> {
  const updated: FoodLogEntry = {
    ...entry,
    updatedAt: fromSync && entry.updatedAt ? entry.updatedAt : new Date().toISOString(),
  };
  await removeTombstone("logs", updated.id);
  try {
    const db = await openNutriDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("logs", "readwrite");
      const store = tx.objectStore("logs");
      const req = store.put(updated);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    emitLocalChange(fromSync);
    return updated;
  } catch {
    const store = getMemoryStore();
    const idx = store.logs.findIndex((l) => l.id === updated.id);
    if (idx >= 0) store.logs[idx] = updated;
    else store.logs.push(updated);
    emitLocalChange(fromSync);
    return updated;
  }
}

export async function deleteFoodLogEntry(entryId: string, fromSync = false, deletedAt?: string): Promise<void> {
  await saveTombstone({
    key: `logs:${entryId}`,
    collection: "logs",
    id: entryId,
    updatedAt: deletedAt || new Date().toISOString(),
  });
  try {
    const db = await openNutriDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("logs", "readwrite");
      const store = tx.objectStore("logs");
      const req = store.delete(entryId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    emitLocalChange(fromSync);
  } catch {
    const store = getMemoryStore();
    store.logs = store.logs.filter((l) => l.id !== entryId);
    emitLocalChange(fromSync);
  }
}

export async function getAllCombinations(): Promise<FoodCombination[]> {
  try {
    const db = await openNutriDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("combinations", "readonly");
      const store = tx.objectStore("combinations");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return getMemoryStore().combinations;
  }
}

export async function saveCombination(combo: FoodCombination, fromSync = false): Promise<FoodCombination> {
  const updated: FoodCombination = {
    ...combo,
    updatedAt: fromSync && combo.updatedAt ? combo.updatedAt : new Date().toISOString(),
  };
  await removeTombstone("combinations", updated.id);
  try {
    const db = await openNutriDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("combinations", "readwrite");
      const store = tx.objectStore("combinations");
      const req = store.put(updated);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    emitLocalChange(fromSync);
    return updated;
  } catch {
    const store = getMemoryStore();
    const idx = store.combinations.findIndex((c) => c.id === updated.id);
    if (idx >= 0) store.combinations[idx] = updated;
    else store.combinations.push(updated);
    emitLocalChange(fromSync);
    return updated;
  }
}

export async function deleteCombination(comboId: string, fromSync = false, deletedAt?: string): Promise<void> {
  await saveTombstone({
    key: `combinations:${comboId}`,
    collection: "combinations",
    id: comboId,
    updatedAt: deletedAt || new Date().toISOString(),
  });
  try {
    const db = await openNutriDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("combinations", "readwrite");
      const store = tx.objectStore("combinations");
      const req = store.delete(comboId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    emitLocalChange(fromSync);
  } catch {
    const store = getMemoryStore();
    store.combinations = store.combinations.filter((c) => c.id !== comboId);
    emitLocalChange(fromSync);
  }
}
