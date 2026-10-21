import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyRemoteRowsToIndexedDB,
  buildLocalSyncRows,
  mergeRecords,
  SyncRecordRow,
} from "./sync-engine";
import {
  deleteFoodLogEntry,
  getAllFoodLogs,
  getAllFoods,
  getAllTombstones,
  getUserProfile,
  saveFood,
  saveFoodLogEntry,
  saveUserProfile,
} from "../storage/indexed-db";
import { clearEverything } from "../storage/maintenance";
import { STARTER_FOODS } from "../nutrition/starter-db";
import { createEmptyNutrients } from "../nutrition/calculator";
import { Food, FoodLogEntry } from "../nutrition/types";

beforeEach(async () => {
  await clearEverything();
});

describe("Cloud Sync Engine — mergeRecords & tombstones", () => {
  it("picks the newer record when both local and remote have edits (last-write-wins)", () => {
    const local: SyncRecordRow[] = [
      {
        collection: "logs",
        id: "log_1",
        data: { servingQuantity: 150 },
        deleted: false,
        updated_at: "2026-10-18T12:00:00.000Z",
      },
      {
        collection: "logs",
        id: "log_2",
        data: { servingQuantity: 100 },
        deleted: false,
        updated_at: "2026-10-18T10:00:00.000Z",
      },
    ];

    const remote: SyncRecordRow[] = [
      {
        collection: "logs",
        id: "log_1",
        data: { servingQuantity: 100 },
        deleted: false,
        updated_at: "2026-10-18T11:00:00.000Z",
      },
      {
        collection: "logs",
        id: "log_2",
        data: { servingQuantity: 200 },
        deleted: false,
        updated_at: "2026-10-18T13:00:00.000Z",
      },
    ];

    const { toUpload, toApplyLocally } = mergeRecords(local, remote);
    expect(toUpload).toHaveLength(1);
    expect(toUpload[0].id).toBe("log_1");
    expect(toUpload[0].data.servingQuantity).toBe(150);

    expect(toApplyLocally).toHaveLength(1);
    expect(toApplyLocally[0].id).toBe("log_2");
    expect(toApplyLocally[0].data.servingQuantity).toBe(200);
  });

  it("propagates local deletes via tombstones and remote deletes to local IndexedDB", async () => {
    const logEntry: FoodLogEntry = {
      id: "log_del_test",
      userId: "default_user",
      foodId: "food_custom",
      foodNameSnapshot: "Paneer Tikka",
      servingQuantity: 100,
      servingUnit: "g",
      nutritionSnapshot: { ...createEmptyNutrients(), protein: 18, calories: 260 },
      mealType: "dinner",
      entrySource: "manual",
      loggedAt: "2026-10-18",
      createdAt: "2026-10-18T10:00:00.000Z",
    };

    await saveFoodLogEntry(logEntry);
    expect(await getAllFoodLogs()).toHaveLength(1);

    await deleteFoodLogEntry("log_del_test");
    expect(await getAllFoodLogs()).toHaveLength(0);

    const tombstones = await getAllTombstones();
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0].key).toBe("logs:log_del_test");

    const localRows = await buildLocalSyncRows();
    const deletedRow = localRows.find((r) => r.collection === "logs" && r.id === "log_del_test");
    expect(deletedRow).toBeDefined();
    expect(deletedRow?.deleted).toBe(true);
    expect(deletedRow?.data).toBeNull();
  });

  it("preserves null unknown nutrients across sync without replacing with 0", async () => {
    const customFood: Food = {
      id: "food_custom_nulls",
      ownerUserId: "default_user",
      name: "Homemade Dal",
      brand: null,
      category: "Lentils",
      referenceType: "per_100g",
      defaultServingQuantity: 150,
      defaultServingUnit: "g",
      referenceQuantity: 100,
      referenceUnit: "g",
      nutrientValues: {
        ...createEmptyNutrients(),
        protein: 9,
        calories: 140,
        vitB12: null, // explicitly unknown
      },
      dataSource: "user_created",
      verificationStatus: "unverified",
      isArchived: false,
      createdAt: "2026-10-18T10:00:00.000Z",
      updatedAt: "2026-10-18T10:00:00.000Z",
    };

    await applyRemoteRowsToIndexedDB([
      {
        collection: "foods",
        id: customFood.id,
        data: customFood,
        deleted: false,
        updated_at: "2026-10-18T12:00:00.000Z",
      },
    ]);

    const foods = await getAllFoods();
    const synced = foods.find((f) => f.id === "food_custom_nulls");
    expect(synced).toBeDefined();
    expect(synced?.nutrientValues.protein).toBe(9);
    expect(synced?.nutrientValues.vitB12).toBeNull();
  });

  it("skips unmodified starter foods when building upload payload, but includes modified ones", async () => {
    const starter = STARTER_FOODS[0];
    await saveFood(starter, true);

    let rows = await buildLocalSyncRows();
    expect(rows.find((r) => r.collection === "foods" && r.id === starter.id)).toBeUndefined();

    // Now archive/modify the starter food
    await saveFood({ ...starter, pricePerServing: 25 });
    rows = await buildLocalSyncRows();
    expect(rows.find((r) => r.collection === "foods" && r.id === starter.id)).toBeDefined();
  });

  it("prioritizes remote profile when logging in on a new device with unconfigured local profile", () => {
    const localProfileRow: SyncRecordRow = {
      collection: "profile",
      id: "default_user",
      data: { displayName: "", age: null },
      deleted: false,
      updated_at: "1970-01-01T00:00:00.000Z",
    };

    const remoteProfileRow: SyncRecordRow = {
      collection: "profile",
      id: "default_user",
      data: {
        displayName: "Dhakshi",
        age: 21,
        weightKg: 58,
        fitnessGoals: ["fat_loss", "muscle_gain"],
        customGoal: "Tone arms",
      },
      deleted: false,
      updated_at: "2026-10-20T10:00:00.000Z",
    };

    const { toUpload, toApplyLocally } = mergeRecords([localProfileRow], [remoteProfileRow]);
    expect(toUpload).toHaveLength(0);
    expect(toApplyLocally).toHaveLength(1);
    expect(toApplyLocally[0].data.displayName).toBe("Dhakshi");
    expect(toApplyLocally[0].data.fitnessGoals).toContain("fat_loss");
  });

  it("applies remote profile to IndexedDB restoring all metrics and multi-goal preferences", async () => {
    const remoteProfile = {
      id: "default_user",
      displayName: "Dhakshitha",
      age: 21,
      biologicalSex: "female" as const,
      heightCm: 165,
      weightKg: 58,
      fitnessGoal: "fat_loss" as const,
      fitnessGoals: ["fat_loss", "muscle_gain"] as any,
      customGoal: "Tone core",
      targetWeightKg: 54,
      startingWeightKg: 62,
      weeklyPaceKg: 0.5,
      workoutDaysPerWeek: 4,
      waterGoalLitres: 3,
      weightHistory: [{ date: "2026-10-20", weightKg: 58 }],
      dietaryPreference: "vegetarian" as const,
      allergiesAndExclusions: ["peanuts"],
      createdAt: "2026-10-18T10:00:00.000Z",
      updatedAt: "2026-10-20T12:00:00.000Z",
    };

    await applyRemoteRowsToIndexedDB([
      {
        collection: "profile",
        id: "default_user",
        data: remoteProfile,
        deleted: false,
        updated_at: "2026-10-20T12:00:00.000Z",
      },
    ]);

    const saved = await getUserProfile();
    expect(saved.displayName).toBe("Dhakshitha");
    expect(saved.age).toBe(21);
    expect(saved.heightCm).toBe(165);
    expect(saved.weightKg).toBe(58);
    expect(saved.fitnessGoals).toEqual(["fat_loss", "muscle_gain"]);
    expect(saved.customGoal).toBe("Tone core");
    expect(saved.targetWeightKg).toBe(54);
    expect(saved.workoutDaysPerWeek).toBe(4);
    expect(saved.waterGoalLitres).toBe(3);
    expect(saved.dietaryPreference).toBe("vegetarian");
    expect(saved.allergiesAndExclusions).toEqual(["peanuts"]);
  });
});
