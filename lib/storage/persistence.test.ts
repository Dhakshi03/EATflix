import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteFood,
  getAllCombinations,
  getAllFoodLogs,
  getAllFoods,
  getFoodLogsByDate,
  saveCombination,
  saveFood,
  saveFoodLogEntry,
  saveNutritionGoals,
  getNutritionGoals,
  DEFAULT_GOALS,
} from "./indexed-db";
import { exportUserDataJSON, importUserDataJSON } from "./export-import";
import { clearEverything } from "./maintenance";
import { STARTER_FOODS } from "../nutrition/starter-db";
import { createNutritionSnapshot } from "../nutrition/calculator";
import { FoodLogEntry } from "../nutrition/types";

const oats = STARTER_FOODS.find((f) => f.id === "food_rolled_oats")!;

const logFor = (date: string, id: string): FoodLogEntry => ({
  id,
  userId: "default_user",
  foodId: oats.id,
  foodNameSnapshot: oats.name,
  servingQuantity: 50,
  servingUnit: "g",
  nutritionSnapshot: createNutritionSnapshot(oats, 50, "g"),
  mealType: "breakfast",
  entrySource: "saved_food",
  loggedAt: date,
  createdAt: new Date().toISOString(),
});

beforeEach(async () => {
  await clearEverything();
});

describe("IndexedDB persistence", () => {
  it("persists and retrieves foods, and deletes them", async () => {
    await saveFood(oats);
    expect((await getAllFoods()).map((f) => f.id)).toEqual([oats.id]);
    await deleteFood(oats.id);
    expect(await getAllFoods()).toEqual([]);
  });

  it("queries logs by calendar date with exact boundaries", async () => {
    await saveFoodLogEntry(logFor("2026-10-08", "a"));
    await saveFoodLogEntry(logFor("2026-10-09", "b"));
    await saveFoodLogEntry(logFor("2026-10-10", "c"));
    expect((await getFoodLogsByDate("2026-10-09")).map((l) => l.id)).toEqual(["b"]);
    expect(await getFoodLogsByDate("2026-10-11")).toEqual([]);
    expect(await getAllFoodLogs()).toHaveLength(3);
  });

  it("keeps the logged snapshot after the food is edited or deleted", async () => {
    await saveFood(oats);
    await saveFoodLogEntry(logFor("2026-10-09", "snap"));
    await saveFood({ ...oats, nutrientValues: { ...oats.nutrientValues, protein: 1 } });
    await deleteFood(oats.id);
    const [entry] = await getFoodLogsByDate("2026-10-09");
    expect(entry.nutritionSnapshot.protein).toBe(6.75); // 13.5 g per 100 g * 50 g
  });

  it("overwrites an entry with the same id instead of duplicating it", async () => {
    await saveFoodLogEntry(logFor("2026-10-09", "same"));
    await saveFoodLogEntry({ ...logFor("2026-10-09", "same"), servingQuantity: 80 });
    const all = await getAllFoodLogs();
    expect(all).toHaveLength(1);
    expect(all[0].servingQuantity).toBe(80);
  });

  it("persists goals", async () => {
    await saveNutritionGoals({ ...DEFAULT_GOALS, protein: 95 });
    expect((await getNutritionGoals()).protein).toBe(95);
  });
});

describe("export / import round-trip", () => {
  it("restores foods, combinations and logs after a wipe", async () => {
    await saveFood(oats);
    await saveCombination({
      id: "c1", userId: "default_user", name: "Breakfast",
      items: [{ foodId: oats.id, foodName: oats.name, servingQuantity: 50, servingUnit: "g" }],
      createdAt: "", updatedAt: "",
    });
    await saveFoodLogEntry(logFor("2026-10-09", "keep"));
    const json = await exportUserDataJSON();

    await clearEverything();
    expect(await getAllFoodLogs()).toEqual([]);

    const result = await importUserDataJSON(json);
    expect(result).toEqual({ importedFoods: 1, importedLogs: 1 });
    expect((await getAllCombinations())[0].name).toBe("Breakfast");
    expect((await getAllFoodLogs())[0].nutritionSnapshot.protein).toBe(6.75);
  });

  it("rejects invalid data without writing anything", async () => {
    await expect(importUserDataJSON("{}")).rejects.toThrow();
    expect(await getAllFoodLogs()).toEqual([]);
  });

  it("rejects negative nutrient values and non-positive quantities", async () => {
    await saveFood(oats);
    const good = JSON.parse(await exportUserDataJSON());

    const negNutrient = structuredClone(good);
    negNutrient.foods[0].nutrientValues.protein = -5;
    await expect(importUserDataJSON(JSON.stringify(negNutrient))).rejects.toThrow(/negative|invalid/i);

    const badLog = structuredClone(good);
    badLog.logs = [{ ...logFor("2026-10-09", "x"), servingQuantity: 0 }];
    await expect(importUserDataJSON(JSON.stringify(badLog))).rejects.toThrow(/quantity|invalid/i);

    const badDate = structuredClone(good);
    badDate.logs = [{ ...logFor("09/10/2026", "y") }];
    await expect(importUserDataJSON(JSON.stringify(badDate))).rejects.toThrow(/date|invalid/i);
  });
});
