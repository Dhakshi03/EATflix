import { describe, it, expect } from "vitest";
import { expandCombinationToEntries, localDateIso, shiftDateIso } from "./combination";
import { aggregateDailyNutrients } from "./calculator";
import { STARTER_FOODS } from "./starter-db";
import { FoodCombination } from "./types";

describe("combinations", () => {
  const combo: FoodCombination = {
    id: "c1",
    userId: "u",
    name: "My usual breakfast",
    items: [
      { foodId: "food_rolled_oats", foodName: "Oats", servingQuantity: 100, servingUnit: "g" },
      { foodId: "food_milk_full_fat", foodName: "Milk", servingQuantity: 300, servingUnit: "ml" },
    ],
    createdAt: "",
    updatedAt: "",
  };

  it("logs each item with its own nutrition (oats 13.5 + milk 9.6 protein)", () => {
    const { entries, missingFoods } = expandCombinationToEntries(combo, STARTER_FOODS, "breakfast", "2026-10-09");
    expect(missingFoods).toEqual([]);
    expect(entries).toHaveLength(2);
    expect(entries[0].nutritionSnapshot.protein).toBe(13.5);
    expect(entries[1].nutritionSnapshot.protein).toBe(9.6);
    expect(aggregateDailyNutrients(entries).totals.protein).toBe(23.1);
  });

  it("skips deleted foods instead of inventing values", () => {
    const { entries, missingFoods } = expandCombinationToEntries(combo, [STARTER_FOODS.find((f) => f.id === "food_rolled_oats")!], "breakfast", "2026-10-09");
    expect(entries).toHaveLength(1);
    expect(missingFoods).toEqual(["Milk"]);
  });
});

describe("date boundaries", () => {
  it("uses local calendar date, not UTC", () => {
    expect(localDateIso(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
    expect(localDateIso(new Date(2026, 0, 1, 23, 59))).toBe("2026-01-01");
  });
  it("shifts across month and year boundaries", () => {
    expect(shiftDateIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDateIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDateIso("2028-02-28", 1)).toBe("2028-02-29");
  });
});
