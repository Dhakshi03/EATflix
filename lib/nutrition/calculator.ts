import {
  Food,
  FoodLogEntry,
  NutrientValues,
  ServingUnit,
  DensityConversion,
  UserProfile,
  NutritionGoal,
  ActivityLevel,
} from "./types";

export class IncompatibleUnitError extends Error {
  constructor(public foodName: string, public fromUnit: ServingUnit, public toUnit: ServingUnit) {
    super(`Cannot convert unit '${fromUnit}' to '${toUnit}' for food '${foodName}' without valid conversion metadata.`);
    this.name = "IncompatibleUnitError";
  }
}

/**
 * Creates an empty NutrientValues object with all fields initialized to null.
 */
export function createEmptyNutrients(): NutrientValues {
  return {
    protein: null,
    calories: null,
    carbohydrates: null,
    totalFat: null,
    saturatedFat: null,
    fibre: null,
    sugar: null,
    sodium: null,
    iron: null,
    calcium: null,
    zinc: null,
    vitB12: null,
    vitD: null,
    folate: null,
    healthyFats: null,
  };
}

/**
 * Converts quantity from targetUnit to the referenceUnit of a food item.
 * Uses density or unit weight conversions if available.
 */
export function convertQuantity(
  quantity: number,
  targetUnit: ServingUnit,
  referenceUnit: ServingUnit,
  foodName: string,
  density?: DensityConversion
): number {
  if (targetUnit === referenceUnit) {
    return quantity;
  }

  // Weight <-> Volume conversions (e.g. ml to g)
  if (targetUnit === "ml" && referenceUnit === "g") {
    const ratio = density?.mlToGramsRatio ?? 1.0; // Default 1.0 for liquids like water unless specified
    return quantity * ratio;
  }

  if (targetUnit === "g" && referenceUnit === "ml") {
    const ratio = density?.mlToGramsRatio ?? 1.0;
    return quantity / ratio;
  }

  // Pieces / Scoops / Cups <-> Grams
  if ((targetUnit === "piece" || targetUnit === "scoop" || targetUnit === "cup" || targetUnit === "tbsp") && referenceUnit === "g") {
    if (density?.gramsPerUnit) {
      const multiplier = targetUnit === "piece" || targetUnit === "scoop" ? 1 : (targetUnit === "cup" ? 16 : 1);
      return quantity * density.gramsPerUnit * multiplier;
    }
  }

  if (targetUnit === "g" && (referenceUnit === "piece" || referenceUnit === "scoop")) {
    if (density?.gramsPerUnit && density.gramsPerUnit > 0) {
      return quantity / density.gramsPerUnit;
    }
  }

  throw new IncompatibleUnitError(foodName, targetUnit, referenceUnit);
}

/**
 * Returns the list of serving units that can be converted cleanly for a given food item.
 */
export function getAllowedUnitsForFood(
  food: Pick<Food, "referenceUnit" | "defaultServingUnit" | "densityConversion">
): ServingUnit[] {
  const units = new Set<ServingUnit>([food.referenceUnit, food.defaultServingUnit]);
  if (food.referenceUnit === "g" || food.referenceUnit === "ml") {
    units.add("g");
    units.add("ml");
  }
  if (food.referenceUnit === "g" && food.densityConversion?.gramsPerUnit) {
    units.add("piece");
    units.add("scoop");
    units.add("cup");
    units.add("tbsp");
  }
  if (
    (food.referenceUnit === "piece" || food.referenceUnit === "scoop") &&
    food.densityConversion?.gramsPerUnit &&
    food.densityConversion.gramsPerUnit > 0
  ) {
    units.add("g");
  }
  return Array.from(units);
}

/**
 * Scales a single nutrient value by scale factor, preserving null for missing values.
 */
export function scaleNutrient(value: number | null, scaleFactor: number): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const scaled = value * scaleFactor;
  // Round to 2 decimal places to avoid floating point weirdness
  return Math.round(scaled * 100) / 100;
}

/**
 * Scales an entire NutrientValues object according to serving quantity and food reference details.
 */
export function scaleNutrientValues(
  food: Pick<Food, "name" | "referenceType" | "referenceQuantity" | "referenceUnit" | "nutrientValues" | "densityConversion">,
  targetQuantity: number,
  targetUnit: ServingUnit
): NutrientValues {
  let scaleFactor = 1;

  if (food.referenceType === "per_100g") {
    const convertedQtyInGrams = convertQuantity(targetQuantity, targetUnit, "g", food.name, food.densityConversion);
    scaleFactor = convertedQtyInGrams / 100;
  } else if (food.referenceType === "per_100ml") {
    const convertedQtyInMl = convertQuantity(targetQuantity, targetUnit, "ml", food.name, food.densityConversion);
    scaleFactor = convertedQtyInMl / 100;
  } else {
    // per_serving
    const convertedQty = convertQuantity(targetQuantity, targetUnit, food.referenceUnit, food.name, food.densityConversion);
    scaleFactor = convertedQty / (food.referenceQuantity || 1);
  }

  const result: NutrientValues = createEmptyNutrients();
  const keys = Object.keys(food.nutrientValues) as (keyof NutrientValues)[];

  for (const key of keys) {
    result[key] = scaleNutrient(food.nutrientValues[key], scaleFactor);
  }

  return result;
}

/**
 * Creates a frozen nutrition snapshot for a food log entry.
 */
export function createNutritionSnapshot(food: Food, quantity: number, unit: ServingUnit): NutrientValues {
  return scaleNutrientValues(food, quantity, unit);
}

export interface AggregatedNutrientsResult {
  totals: NutrientValues;
  incompleteNutrients: (keyof NutrientValues)[];
  totalLogEntriesCount: number;
}

/**
 * Sums nutrient values across multiple food log entries.
 * Preserves null when all entries are missing data for a specific nutrient.
 * Identifies partial missing data coverage.
 */
export function aggregateDailyNutrients(entries: FoodLogEntry[]): AggregatedNutrientsResult {
  const totals = createEmptyNutrients();
  const incompleteNutrients: Set<keyof NutrientValues> = new Set();
  const keys = Object.keys(totals) as (keyof NutrientValues)[];

  if (entries.length === 0) {
    return {
      totals,
      incompleteNutrients: [],
      totalLogEntriesCount: 0,
    };
  }

  for (const key of keys) {
    let sum = 0;
    let hasKnownValue = false;
    let hasUnknownValue = false;

    for (const entry of entries) {
      const val = entry.nutritionSnapshot[key];
      if (val !== null && val !== undefined) {
        sum += val;
        hasKnownValue = true;
      } else {
        hasUnknownValue = true;
      }
    }

    if (hasKnownValue) {
      totals[key] = Math.round(sum * 100) / 100;
    } else {
      totals[key] = null;
    }

    if (hasUnknownValue) {
      incompleteNutrients.add(key);
    }
  }

  return {
    totals,
    incompleteNutrients: Array.from(incompleteNutrients),
    totalLogEntriesCount: entries.length,
  };
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const ACTIVITY_PROTEIN_PER_KG: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.4,
  moderate: 1.6,
  active: 1.8,
  very_active: 2.0,
};

export interface BmiInfo {
  bmi: number;
  category: "Underweight" | "Healthy" | "Overweight" | "Obese";
  colorClass: string;
  badgeClass: string;
  markerPercent: number; // 0..100 position along 14..36 scale
  healthyMinKg: number;
  healthyMaxKg: number;
}

/**
 * Calculates Body Mass Index (BMI), WHO category, healthy weight range for height,
 * and a 0-100% position for a visual BMI spectrum bar.
 */
export function calculateBmiInfo(
  heightCm?: number | null,
  weightKg?: number | null
): BmiInfo | null {
  if (
    typeof heightCm !== "number" ||
    typeof weightKg !== "number" ||
    heightCm < 50 ||
    weightKg < 20
  ) {
    return null;
  }

  const heightM = heightCm / 100;
  const rawBmi = weightKg / (heightM * heightM);
  const bmi = Math.round(rawBmi * 10) / 10;

  const healthyMinKg = Math.round(18.5 * heightM * heightM * 10) / 10;
  const healthyMaxKg = Math.round(24.9 * heightM * heightM * 10) / 10;

  // Map BMI [14 .. 36] -> [0% .. 100%]
  const markerPercent = Math.min(98, Math.max(2, Math.round(((bmi - 14) / (36 - 14)) * 100)));

  if (bmi < 18.5) {
    return {
      bmi,
      category: "Underweight",
      colorClass: "text-sky-400",
      badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/30",
      markerPercent,
      healthyMinKg,
      healthyMaxKg,
    };
  }
  if (bmi < 25) {
    return {
      bmi,
      category: "Healthy",
      colorClass: "text-emerald-400",
      badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      markerPercent,
      healthyMinKg,
      healthyMaxKg,
    };
  }
  if (bmi < 30) {
    return {
      bmi,
      category: "Overweight",
      colorClass: "text-amber-400",
      badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
      markerPercent,
      healthyMinKg,
      healthyMaxKg,
    };
  }
  return {
    bmi,
    category: "Obese",
    colorClass: "text-rose-400",
    badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    markerPercent,
    healthyMinKg,
    healthyMaxKg,
  };
}

/**
 * Computes personalized daily macro and micronutrient targets from the user's body metrics,
 * activity level, biological sex, and fitness goal using the Mifflin-St Jeor equation.
 */
export function calculateRecommendedGoals(profile: Partial<UserProfile>): {
  goals: NutritionGoal;
  summary: string;
  hasMetrics: boolean;
} {
  const hasWeight = typeof profile.weightKg === "number" && profile.weightKg > 0;
  const hasHeight = typeof profile.heightCm === "number" && profile.heightCm > 0;
  const hasAge = typeof profile.age === "number" && profile.age > 0;
  const hasMetrics = Boolean(hasWeight || hasHeight || hasAge || profile.activityLevel || profile.fitnessGoal);

  const weight = hasWeight ? profile.weightKg! : 65;
  const height = hasHeight ? profile.heightCm! : 168;
  const age = hasAge ? profile.age! : 25;
  const activity: ActivityLevel = profile.activityLevel || "moderate";
  const sexOffset =
    profile.biologicalSex === "male" || profile.biologicalSex === "transgender_male"
      ? 5
      : profile.biologicalSex === "female" || profile.biologicalSex === "transgender_female"
      ? -161
      : -78;

  // Mifflin-St Jeor BMR
  const bmr = 10 * weight + 6.25 * height - 5 * age + sexOffset;
  const tdee = bmr * ACTIVITY_MULTIPLIERS[activity];

  let goalAdjustment = 0;
  if (profile.fitnessGoal === "fat_loss") {
    const pace = profile.weeklyPaceKg ?? 0.35;
    goalAdjustment = pace >= 0.7 ? -550 : pace <= 0.25 ? -250 : -350;
  } else if (profile.fitnessGoal === "muscle_gain") {
    const pace = profile.weeklyPaceKg ?? 0.25;
    goalAdjustment = pace >= 0.5 ? 350 : pace <= 0.2 ? 200 : 250;
  } else if (profile.fitnessGoal === "athletic_performance") {
    goalAdjustment = 150;
  }

  const targetCalories = Math.max(1200, Math.round((tdee + goalAdjustment) / 50) * 50);

  let proteinPerKg = ACTIVITY_PROTEIN_PER_KG[activity];
  if (profile.fitnessGoal === "muscle_gain") proteinPerKg = Math.max(proteinPerKg, 1.8);
  if (profile.fitnessGoal === "fat_loss") proteinPerKg = Math.max(proteinPerKg, 1.7);
  if (profile.fitnessGoal === "athletic_performance") proteinPerKg = Math.max(proteinPerKg, 1.75);
  if (profile.fitnessGoal === "wellness_vitality") proteinPerKg = Math.max(proteinPerKg, 1.5);

  const focus = profile.focusAreas || [];
  if (focus.some((f) => f.toLowerCase().includes("protein"))) {
    proteinPerKg = Math.max(proteinPerKg, 1.85);
  }

  const protein = Math.max(45, Math.round((weight * proteinPerKg) / 2) * 2);
  const totalFat = Math.max(35, Math.round(((targetCalories * 0.27) / 9) / 2) * 2);
  const remainingCalForCarbs = Math.max(400, targetCalories - protein * 4 - totalFat * 9);
  const carbohydrates = Math.round(remainingCalForCarbs / 4 / 5) * 5;
  let fibre = Math.max(22, Math.min(40, Math.round((targetCalories / 1000) * 14)));
  if (
    profile.fitnessGoal === "wellness_vitality" ||
    focus.some((f) => f.toLowerCase().includes("gut") || f.toLowerCase().includes("fibre"))
  ) {
    fibre = Math.max(fibre, 30);
  }

  const isVeg = profile.dietaryPreference === "vegetarian" || profile.dietaryPreference === "eggitarian";
  let iron = profile.biologicalSex === "male" && !isVeg ? 11 : 18;
  let zinc = profile.biologicalSex === "female" && !isVeg ? 9 : 11;
  let calcium = 1000;
  let vitD = 600;
  let folate = 400;

  if (focus.some((f) => f.toLowerCase().includes("hair") || f.toLowerCase().includes("iron"))) {
    iron = Math.max(iron, 20);
    zinc = Math.max(zinc, 12);
    folate = Math.max(folate, 450);
  }
  if (focus.some((f) => f.toLowerCase().includes("bone") || f.toLowerCase().includes("calcium"))) {
    calcium = 1200;
    vitD = 800;
  }

  const parts: string[] = [];
  if (hasWeight) parts.push(`${weight} kg`);
  if (hasHeight) parts.push(`${height} cm`);
  if (hasAge) parts.push(`age ${age}`);
  parts.push(activity.replace("_", " "));
  if (profile.fitnessGoal === "fat_loss") parts.push(`weight loss (${goalAdjustment} kcal)`);
  else if (profile.fitnessGoal === "muscle_gain") parts.push(`muscle & weight gain (+${goalAdjustment} kcal)`);
  else if (profile.fitnessGoal === "athletic_performance") parts.push("athletic stamina (+150 kcal)");
  else if (profile.fitnessGoal === "wellness_vitality") parts.push("gut, hair & micronutrient vitality");
  else parts.push("maintenance");

  return {
    goals: {
      protein,
      calories: targetCalories,
      carbohydrates,
      totalFat,
      fibre,
      iron,
      calcium,
      zinc,
      vitB12: 2.4,
      vitD,
      folate,
    },
    summary: `Tailored for ${parts.join(" · ")}`,
    hasMetrics,
  };
}

export interface WeightGoalRoadmap {
  startKg: number;
  currentKg: number;
  targetKg: number;
  totalToChangeKg: number;
  changedSoFarKg: number;
  remainingKg: number;
  progressPercent: number;
  estimatedWeeks: number | null;
  direction: "lose" | "gain" | "maintain";
}

export function calculateWeightGoalRoadmap(profile?: Partial<UserProfile> | null): WeightGoalRoadmap | null {
  if (!profile || typeof profile.weightKg !== "number" || profile.weightKg <= 0) {
    return null;
  }
  const currentKg = profile.weightKg;
  const history = profile.weightHistory || [];
  const startKg =
    typeof profile.startingWeightKg === "number" && profile.startingWeightKg > 0
      ? profile.startingWeightKg
      : history.length > 0
      ? history[0].weightKg
      : currentKg;

  const defaultTarget =
    profile.fitnessGoal === "fat_loss"
      ? Math.max(40, Math.round((currentKg - 4) * 10) / 10)
      : profile.fitnessGoal === "muscle_gain"
      ? Math.round((currentKg + 4) * 10) / 10
      : currentKg;

  const targetKg =
    typeof profile.targetWeightKg === "number" && profile.targetWeightKg > 0
      ? profile.targetWeightKg
      : defaultTarget;

  const diffFromCurrent = Math.round((targetKg - currentKg) * 10) / 10;
  const direction: "lose" | "gain" | "maintain" =
    Math.abs(targetKg - startKg) < 0.3 && Math.abs(diffFromCurrent) < 0.3
      ? "maintain"
      : targetKg < currentKg || (targetKg < startKg && profile.fitnessGoal === "fat_loss")
      ? "lose"
      : "gain";

  if (direction === "maintain") {
    const drift = Math.abs(Math.round((currentKg - targetKg) * 10) / 10);
    return {
      startKg,
      currentKg,
      targetKg,
      totalToChangeKg: 0,
      changedSoFarKg: Math.round((currentKg - startKg) * 10) / 10,
      remainingKg: drift,
      progressPercent: drift <= 1.5 ? 100 : Math.max(25, Math.round(100 - drift * 15)),
      estimatedWeeks: 0,
      direction: "maintain",
    };
  }

  const totalSpan = Math.max(0.5, Math.abs(targetKg - startKg));
  const remainingKg = Math.max(0, Math.round(Math.abs(targetKg - currentKg) * 10) / 10);
  const changedSoFarKg = Math.round((currentKg - startKg) * 10) / 10;

  let progressPercent = 0;
  if (direction === "lose") {
    if (currentKg <= targetKg) progressPercent = 100;
    else if (startKg > targetKg) {
      progressPercent = Math.min(100, Math.max(5, Math.round(((startKg - currentKg) / totalSpan) * 100)));
    } else {
      progressPercent = 10;
    }
  } else {
    if (currentKg >= targetKg) progressPercent = 100;
    else if (targetKg > startKg) {
      progressPercent = Math.min(100, Math.max(5, Math.round(((currentKg - startKg) / totalSpan) * 100)));
    } else {
      progressPercent = 10;
    }
  }

  const pace = profile.weeklyPaceKg && profile.weeklyPaceKg > 0 ? profile.weeklyPaceKg : 0.5;
  const estimatedWeeks = remainingKg > 0 ? Math.max(1, Math.ceil(remainingKg / pace)) : 0;

  return {
    startKg,
    currentKg,
    targetKg,
    totalToChangeKg: Math.round(totalSpan * 10) / 10,
    changedSoFarKg,
    remainingKg,
    progressPercent,
    estimatedWeeks,
    direction,
  };
}

