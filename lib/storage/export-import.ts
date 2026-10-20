import {
  getAllCombinations,
  getAllFoodLogs,
  getAllFoods,
  getNutritionGoals,
  getUserProfile,
  saveCombination,
  saveFood,
  saveFoodLogEntry,
  saveNutritionGoals,
  saveUserProfile,
} from "./indexed-db";
import { Food, FoodCombination, FoodLogEntry, NutrientValues, NutritionGoal, UserProfile } from "../nutrition/types";

export interface ExportBackupData {
  version: string;
  exportedAt: string;
  profile: UserProfile;
  goals: NutritionGoal;
  foods: Food[];
  combinations: FoodCombination[];
  logs: FoodLogEntry[];
}

const UNITS = ["g", "ml", "piece", "cup", "tbsp", "scoop"];
const MEALS = ["breakfast", "lunch", "dinner", "snack"];
const REF_TYPES = ["per_100g", "per_100ml", "per_serving"];
const NUTRIENT_KEYS: (keyof NutrientValues)[] = [
  "protein", "calories", "carbohydrates", "totalFat", "saturatedFat", "fibre", "sugar",
  "sodium", "iron", "calcium", "zinc", "vitB12", "vitD", "folate", "healthyFats",
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function exportUserDataJSON(): Promise<string> {
  const backup: ExportBackupData = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    profile: await getUserProfile(),
    goals: await getNutritionGoals(),
    foods: await getAllFoods(),
    combinations: await getAllCombinations(),
    logs: await getAllFoodLogs(),
  };
  return JSON.stringify(backup, null, 2);
}

function checkNutrients(nv: any, where: string) {
  if (!nv || typeof nv !== "object") throw new Error(`Invalid nutrient data for ${where}.`);
  for (const k of NUTRIENT_KEYS) {
    const v = nv[k];
    // Missing keys and null both mean "unknown". Only real numbers are checked.
    if (v === undefined || v === null) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Invalid ${k} value for ${where}.`);
    if (v < 0) throw new Error(`Negative ${k} value for ${where}.`);
  }
}

function checkQtyUnit(q: any, u: any, where: string) {
  if (typeof q !== "number" || !Number.isFinite(q) || q <= 0) throw new Error(`Invalid quantity for ${where}: must be greater than 0.`);
  if (!UNITS.includes(u)) throw new Error(`Invalid unit for ${where}.`);
}

/** Fully validates a backup. Throws on the first problem; nothing is written by this function. */
export function validateBackupJSON(jsonString: string): ExportBackupData {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error("Invalid JSON format.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Backup file must be a valid JSON object.");
  if (!parsed.profile || typeof parsed.profile !== "object") throw new Error("Missing or invalid 'profile' section in backup.");
  if (!parsed.goals || typeof parsed.goals !== "object") throw new Error("Missing or invalid 'goals' section in backup.");
  for (const k of ["foods", "combinations", "logs"] as const) {
    if (!Array.isArray(parsed[k])) throw new Error(`Missing or invalid '${k}' array in backup.`);
  }

  for (const [k, v] of Object.entries(parsed.goals)) {
    if (v !== null && v !== undefined && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      throw new Error(`Invalid goal value for ${k}.`);
    }
  }

  const foodIds = new Set<string>();
  for (const food of parsed.foods) {
    if (!food || typeof food.id !== "string" || typeof food.name !== "string" || !food.nutrientValues) {
      throw new Error(`Invalid food item structure in backup: ${food?.name || "unknown"}`);
    }
    if (foodIds.has(food.id)) throw new Error(`Duplicate food id in backup: ${food.id}`);
    foodIds.add(food.id);
    if (!REF_TYPES.includes(food.referenceType)) throw new Error(`Invalid reference type for ${food.name}.`);
    checkQtyUnit(food.defaultServingQuantity, food.defaultServingUnit, `food "${food.name}"`);
    checkNutrients(food.nutrientValues, `food "${food.name}"`);
  }

  for (const c of parsed.combinations) {
    if (!c || typeof c.id !== "string" || typeof c.name !== "string" || !Array.isArray(c.items)) {
      throw new Error("Invalid combination structure in backup.");
    }
    for (const it of c.items) checkQtyUnit(it?.servingQuantity, it?.servingUnit, `combination "${c.name}"`);
  }

  const logIds = new Set<string>();
  for (const l of parsed.logs) {
    if (!l || typeof l.id !== "string" || typeof l.foodNameSnapshot !== "string") throw new Error("Invalid log entry structure in backup.");
    if (logIds.has(l.id)) throw new Error(`Duplicate log id in backup: ${l.id}`);
    logIds.add(l.id);
    if (typeof l.loggedAt !== "string" || !DATE_RE.test(l.loggedAt)) throw new Error(`Invalid date on log entry "${l.foodNameSnapshot}": expected YYYY-MM-DD.`);
    if (!MEALS.includes(l.mealType)) throw new Error(`Invalid meal type on log entry "${l.foodNameSnapshot}".`);
    checkQtyUnit(l.servingQuantity, l.servingUnit, `log entry "${l.foodNameSnapshot}"`);
    checkNutrients(l.nutritionSnapshot, `log entry "${l.foodNameSnapshot}"`);
  }

  return parsed as ExportBackupData;
}

/**
 * Validates first, then writes. Entries are upserted by id, so re-importing the same
 * file never double-counts.
 */
export async function importUserDataJSON(jsonString: string): Promise<{ importedFoods: number; importedLogs: number }> {
  const data = validateBackupJSON(jsonString);

  await saveUserProfile(data.profile);
  await saveNutritionGoals(data.goals);
  for (const food of data.foods) await saveFood(food);
  for (const combo of data.combinations) await saveCombination(combo);
  for (const log of data.logs) await saveFoodLogEntry(log);

  return { importedFoods: data.foods.length, importedLogs: data.logs.length };
}
