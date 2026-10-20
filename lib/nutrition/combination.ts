import { Food, FoodCombination, FoodLogEntry, MealType } from "./types";
import { createNutritionSnapshot } from "./calculator";

export interface CombinationExpansion {
  entries: FoodLogEntry[];
  /** Names of items whose source food no longer exists (skipped, never zero-filled). */
  missingFoods: string[];
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now()}_${counter}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Expands a combination into individual log entries. Each entry carries a
 * snapshot computed from its own food. Items whose food was deleted are
 * reported rather than logged with invented values.
 */
export function expandCombinationToEntries(
  combo: FoodCombination,
  foods: Food[],
  mealType: MealType,
  dateIso: string,
  userId = "default_user"
): CombinationExpansion {
  const entries: FoodLogEntry[] = [];
  const missingFoods: string[] = [];

  for (const item of combo.items) {
    const food = foods.find((f) => f.id === item.foodId);
    if (!food) {
      missingFoods.push(item.foodName);
      continue;
    }
    entries.push({
      id: uid("log_combo"),
      userId,
      foodId: food.id,
      foodNameSnapshot: food.name,
      servingQuantity: item.servingQuantity,
      servingUnit: item.servingUnit,
      nutritionSnapshot: createNutritionSnapshot(food, item.servingQuantity, item.servingUnit),
      mealType,
      entrySource: "combination",
      loggedAt: dateIso,
      createdAt: new Date().toISOString(),
    });
  }
  return { entries, missingFoods };
}

/** Local calendar date (YYYY-MM-DD), avoiding the UTC off-by-one of toISOString(). */
export function localDateIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shiftDateIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return localDateIso(new Date(y, m - 1, d + days));
}
