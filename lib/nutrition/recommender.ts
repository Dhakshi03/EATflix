import { Food, NutrientValues, NutritionGoal, UserProfile, DietaryPreference } from "./types";
import { scaleNutrientValues } from "./calculator";

export interface FoodSuggestion {
  food: Food;
  suggestedQuantity: number;
  suggestedUnit: string;
  contributedNutrients: NutrientValues;
  proteinContributionGrams: number;
  percentageOfProteinGap: number;
  priceEstimate?: number | null;
  matchReason: string;
}

export interface GapAnalysis {
  proteinGap: number;
  caloriesGap: number;
  carbsGap: number;
  fatGap: number;
  fibreGap: number;
  ironGap: number;
  calciumGap: number;
}

export function calculateNutrientGaps(currentTotals: NutrientValues, goals: NutritionGoal): GapAnalysis {
  return {
    proteinGap: Math.max(0, goals.protein - (currentTotals.protein || 0)),
    caloriesGap: Math.max(0, goals.calories - (currentTotals.calories || 0)),
    carbsGap: Math.max(0, goals.carbohydrates - (currentTotals.carbohydrates || 0)),
    fatGap: Math.max(0, goals.totalFat - (currentTotals.totalFat || 0)),
    fibreGap: Math.max(0, goals.fibre - (currentTotals.fibre || 0)),
    ironGap: goals.iron ? Math.max(0, goals.iron - (currentTotals.iron || 0)) : 0,
    calciumGap: goals.calcium ? Math.max(0, goals.calcium - (currentTotals.calcium || 0)) : 0,
  };
}

export function isFoodDietaryCompliant(food: Food, preference: DietaryPreference, exclusions: string[]): boolean {
  const foodNameLower = food.name.toLowerCase();
  const categoryLower = food.category.toLowerCase();

  // Check dietary exclusions & allergies
  for (const exclusion of exclusions) {
    const excLower = exclusion.trim().toLowerCase();
    if (excLower && (foodNameLower.includes(excLower) || categoryLower.includes(excLower))) {
      return false;
    }
  }

  // Dietary preference check
  if (preference === "vegetarian") {
    if (foodNameLower.includes("chicken") || foodNameLower.includes("meat") || foodNameLower.includes("fish") || foodNameLower.includes("egg")) {
      return false;
    }
  } else if (preference === "eggitarian") {
    if (foodNameLower.includes("chicken") || foodNameLower.includes("meat") || foodNameLower.includes("fish")) {
      return false;
    }
  }

  return true;
}

export function generateFoodSuggestions(
  currentTotals: NutrientValues,
  goals: NutritionGoal,
  userProfile: UserProfile,
  foodLibrary: Food[],
  options?: { limit?: number; includeWhenGoalMet?: boolean }
): FoodSuggestion[] {
  const gaps = calculateNutrientGaps(currentTotals, goals);
  const limit = options?.limit ?? 10;

  if (!options?.includeWhenGoalMet && gaps.proteinGap <= 0 && gaps.fibreGap <= 0) {
    return [];
  }

  const suggestions: FoodSuggestion[] = [];

  for (const food of foodLibrary) {
    if (food.isArchived) continue;
    if (!isFoodDietaryCompliant(food, userProfile.dietaryPreference, userProfile.allergiesAndExclusions)) {
      continue;
    }

    const qty = food.defaultServingQuantity || 1;
    const unit = food.defaultServingUnit || food.referenceUnit;
    const nutrients = scaleNutrientValues(food, qty, unit);

    const proteinGrams = nutrients.protein || 0;
    const fibreGrams = nutrients.fibre || 0;

    if (proteinGrams < 2 && fibreGrams < 2) continue;

    const percentGap = gaps.proteinGap > 0 ? Math.min(100, Math.round((proteinGrams / gaps.proteinGap) * 100)) : 0;

    let matchReason = "";
    if (proteinGrams >= 10) {
      matchReason = `High protein boost (+${proteinGrams}g protein)`;
    } else if (fibreGrams >= 5) {
      matchReason = `Rich in dietary fibre (+${fibreGrams}g fibre)`;
    } else {
      matchReason = `Nutrient-dense snack (+${proteinGrams}g protein)`;
    }

    suggestions.push({
      food,
      suggestedQuantity: qty,
      suggestedUnit: unit,
      contributedNutrients: nutrients,
      proteinContributionGrams: proteinGrams,
      percentageOfProteinGap: percentGap,
      priceEstimate: food.pricePerServing ?? null,
      matchReason,
    });
  }

  // Sort by highest protein contribution & percentage of gap filled
  suggestions.sort((a, b) => b.proteinContributionGrams - a.proteinContributionGrams);

  return suggestions.slice(0, limit);
}
