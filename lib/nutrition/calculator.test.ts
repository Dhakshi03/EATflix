import { describe, it, expect } from "vitest";
import {
  scaleNutrientValues,
  createNutritionSnapshot,
  aggregateDailyNutrients,
  convertQuantity,
  IncompatibleUnitError,
  calculateRecommendedGoals,
} from "./calculator";
import { Food, FoodLogEntry, NutrientValues } from "./types";

describe("NutriTrack Calculation Engine Tests", () => {
  it("AC 1: scales a food containing 25g protein per 100g logged as a 50g portion to 12.5g protein", () => {
    const customFood: Food = {
      id: "food_test_custom",
      ownerUserId: "user_1",
      name: "High Protein Mix",
      brand: null,
      category: "Proteins",
      referenceType: "per_100g",
      defaultServingQuantity: 100,
      defaultServingUnit: "g",
      referenceQuantity: 100,
      referenceUnit: "g",
      nutrientValues: {
        protein: 25,
        calories: 300,
        carbohydrates: 20,
        totalFat: 10,
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
      },
      dataSource: "user_created",
      verificationStatus: "unverified",
      isArchived: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    const snapshot = createNutritionSnapshot(customFood, 50, "g");
    expect(snapshot.protein).toBe(12.5);
    expect(snapshot.calories).toBe(150);
    expect(snapshot.carbohydrates).toBe(10);
    expect(snapshot.totalFat).toBe(5);
  });

  it("AC 2: scales a 300ml milk serving accurately from a per_100ml reference", () => {
    const milkFood: Food = {
      id: "food_milk",
      ownerUserId: null,
      name: "Whole Milk",
      brand: "Amul",
      category: "Dairy & Eggs",
      referenceType: "per_100ml",
      defaultServingQuantity: 300,
      defaultServingUnit: "ml",
      referenceQuantity: 100,
      referenceUnit: "ml",
      nutrientValues: {
        protein: 3.2,
        calories: 62,
        carbohydrates: 4.7,
        totalFat: 3.5,
        saturatedFat: 2.2,
        fibre: 0,
        sugar: 4.7,
        sodium: 43,
        iron: null,
        calcium: 120,
        zinc: null,
        vitB12: null,
        vitD: null,
        folate: null,
        healthyFats: null,
      },
      dataSource: "starter_verified",
      verificationStatus: "verified",
      isArchived: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    const snapshot = scaleNutrientValues(milkFood, 300, "ml");
    expect(snapshot.protein).toBe(9.6);
    expect(snapshot.calories).toBe(186);
    expect(snapshot.calcium).toBe(360);
  });

  it("AC 6 & Rule 5: preserves unknown (null) nutrient values without replacing them with zero", () => {
    const incompleteFood: Food = {
      id: "food_incomplete",
      ownerUserId: "user_1",
      name: "Mystery Snack",
      brand: null,
      category: "Snacks & Supplements",
      referenceType: "per_100g",
      defaultServingQuantity: 100,
      defaultServingUnit: "g",
      referenceQuantity: 100,
      referenceUnit: "g",
      nutrientValues: {
        protein: 15,
        calories: 200,
        carbohydrates: null, // Unknown!
        totalFat: null,      // Unknown!
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
      },
      dataSource: "user_created",
      verificationStatus: "unverified",
      isArchived: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    const snapshot = scaleNutrientValues(incompleteFood, 200, "g");
    expect(snapshot.protein).toBe(30);
    expect(snapshot.calories).toBe(400);
    expect(snapshot.carbohydrates).toBeNull();
    expect(snapshot.totalFat).toBeNull();
  });

  it("AC 12 & Rule 4: snapshot immutability - editing template food later does NOT change past food log snapshots", () => {
    const mutableFood: Food = {
      id: "food_mutable",
      ownerUserId: "user_1",
      name: "Original Protein Bar",
      brand: "Brand A",
      category: "Snacks & Supplements",
      referenceType: "per_serving",
      defaultServingQuantity: 1,
      defaultServingUnit: "piece",
      referenceQuantity: 1,
      referenceUnit: "piece",
      nutrientValues: {
        protein: 20,
        calories: 220,
        carbohydrates: 25,
        totalFat: 6,
        saturatedFat: 2,
        fibre: 5,
        sugar: 2,
        sodium: 150,
        iron: 1,
        calcium: 100,
        zinc: 1,
        vitB12: null,
        vitD: null,
        folate: null,
        healthyFats: null,
      },
      dataSource: "user_created",
      verificationStatus: "verified",
      isArchived: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    // 1. Log the food on Jan 1
    const snapshotJan1 = createNutritionSnapshot(mutableFood, 1, "piece");
    const logEntry: FoodLogEntry = {
      id: "log_jan_1",
      userId: "user_1",
      foodId: mutableFood.id,
      foodNameSnapshot: mutableFood.name,
      servingQuantity: 1,
      servingUnit: "piece",
      nutritionSnapshot: snapshotJan1,
      mealType: "snack",
      entrySource: "saved_food",
      loggedAt: "2026-01-01",
      createdAt: "2026-01-01T10:00:00Z",
    };

    // 2. Later, manufacturer updates the formula on Jan 5 (e.g. protein drops to 15g)
    mutableFood.nutrientValues.protein = 15;
    mutableFood.nutrientValues.calories = 190;

    // 3. Past log entry snapshot must remain frozen at 20g protein
    expect(logEntry.nutritionSnapshot.protein).toBe(20);
    expect(logEntry.nutritionSnapshot.calories).toBe(220);
  });

  it("AC 5: aggregateDailyNutrients correctly aggregates nutrients across multiple meals without double counting", () => {
    const entry1: FoodLogEntry = {
      id: "log_1",
      userId: "user_1",
      foodId: "food_1",
      foodNameSnapshot: "2 Eggs",
      servingQuantity: 1,
      servingUnit: "piece",
      nutritionSnapshot: {
        protein: 12.6,
        calories: 155,
        carbohydrates: 1.1,
        totalFat: 10.6,
        saturatedFat: 3.3,
        fibre: 0,
        sugar: 1.1,
        sodium: 124,
        iron: 1.8,
        calcium: 50,
        zinc: 1.1,
        vitB12: 1.1,
        vitD: 82,
        folate: 44,
        healthyFats: 3.8,
      },
      mealType: "breakfast",
      entrySource: "saved_food",
      loggedAt: "2026-10-09",
      createdAt: "2026-10-09T08:00:00Z",
    };

    const entry2: FoodLogEntry = {
      id: "log_2",
      userId: "user_1",
      foodId: "food_2",
      foodNameSnapshot: "Paneer 100g",
      servingQuantity: 100,
      servingUnit: "g",
      nutritionSnapshot: {
        protein: 18.3,
        calories: 265,
        carbohydrates: 3.1,
        totalFat: 20.8,
        saturatedFat: 13.0,
        fibre: 0,
        sugar: 2.5,
        sodium: 18,
        iron: 0.4,
        calcium: 480,
        zinc: null, // missing zinc in entry2
        vitB12: null,
        vitD: null,
        folate: null,
        healthyFats: null,
      },
      mealType: "lunch",
      entrySource: "saved_food",
      loggedAt: "2026-10-09",
      createdAt: "2026-10-09T13:00:00Z",
    };

    const aggregated = aggregateDailyNutrients([entry1, entry2]);
    expect(aggregated.totals.protein).toBe(30.9);
    expect(aggregated.totals.calories).toBe(420);
    expect(aggregated.totals.zinc).toBe(1.1); // Sums 1.1 + null = 1.1
    expect(aggregated.incompleteNutrients).toContain("zinc");
  });

  it("Rule 7: throws IncompatibleUnitError when converting between incompatible units without conversion ratio", () => {
    expect(() => {
      convertQuantity(1, "cup", "g", "Random Food");
    }).toThrow(IncompatibleUnitError);
  });

  it("calculates personalized daily targets dynamically based on body metrics and activity level", () => {
    const lightProfile = calculateRecommendedGoals({
      weightKg: 55,
      heightCm: 162,
      age: 24,
      biologicalSex: "female",
      activityLevel: "light",
      fitnessGoal: "maintain",
      dietaryPreference: "eggitarian",
    });

    const activeProfile = calculateRecommendedGoals({
      weightKg: 80,
      heightCm: 180,
      age: 26,
      biologicalSex: "male",
      activityLevel: "active",
      fitnessGoal: "muscle_gain",
      dietaryPreference: "non_vegetarian",
    });

    expect(activeProfile.goals.calories).toBeGreaterThan(lightProfile.goals.calories);
    expect(activeProfile.goals.protein).toBeGreaterThan(lightProfile.goals.protein);
    expect(lightProfile.goals.protein).toBe(78); // 55 * 1.4 = 77 -> rounded to even 78
    expect(activeProfile.goals.protein).toBe(144); // 80 * 1.8 = 144
  });
});
