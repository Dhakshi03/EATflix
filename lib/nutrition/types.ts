export type ServingUnit = "g" | "ml" | "piece" | "cup" | "tbsp" | "scoop";

export type ReferenceServingType = "per_100g" | "per_100ml" | "per_serving";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type DietaryPreference = "vegetarian" | "eggitarian" | "non_vegetarian";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";

export type BiologicalSex =
  | "female"
  | "male"
  | "non_binary"
  | "transgender_female"
  | "transgender_male"
  | "genderqueer"
  | "agender"
  | "intersex"
  | "other"
  | "prefer_not_to_say";

export type FitnessGoal =
  | "fat_loss"
  | "maintain"
  | "muscle_gain"
  | "athletic_performance"
  | "wellness_vitality";

export interface WeightLogEntry {
  date: string; // YYYY-MM-DD
  weightKg: number;
  note?: string;
}

export interface DailyHabitCheckIn {
  waterLitres?: number;
  workoutDone?: boolean;
}

export type VerificationStatus = "verified" | "unverified" | "ai_estimated";

export type PreparationEffort = "low" | "medium" | "high";

export interface NutrientValues {
  protein: number | null;        // g
  calories: number | null;       // kcal
  carbohydrates: number | null; // g
  totalFat: number | null;      // g
  saturatedFat: number | null;  // g
  fibre: number | null;         // g
  sugar: number | null;         // g
  sodium: number | null;        // mg
  iron: number | null;          // mg
  calcium: number | null;       // mg
  zinc: number | null;          // mg
  vitB12: number | null;        // mcg
  vitD: number | null;          // IU
  folate: number | null;        // mcg
  healthyFats: number | null;   // g
}

export interface DensityConversion {
  mlToGramsRatio?: number;    // e.g., 1.03 for milk, 0.92 for oil
  gramsPerUnit?: number;      // e.g., 50g per 1 egg, 30g per 1 scoop
}

export interface Food {
  id: string;
  ownerUserId: string | null;
  name: string;
  brand: string | null;
  category: string;
  referenceType: ReferenceServingType;
  defaultServingQuantity: number;
  defaultServingUnit: ServingUnit;
  referenceQuantity: number;
  referenceUnit: ServingUnit;
  nutrientValues: NutrientValues;
  densityConversion?: DensityConversion;
  dataSource: "user_created" | "starter_verified" | "usda" | "ai_vision";
  verificationStatus: VerificationStatus;
  pricePerServing?: number | null;
  preparationEffort?: PreparationEffort;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FoodLogEntry {
  id: string;
  userId: string;
  foodId: string | null;
  foodNameSnapshot: string;
  servingQuantity: number;
  servingUnit: ServingUnit;
  nutritionSnapshot: NutrientValues;
  mealType: MealType;
  entrySource: "manual" | "saved_food" | "combination" | "photo" | "recommendation";
  confidence?: number | null;
  loggedAt: string; // ISO Date YYYY-MM-DD
  createdAt: string;
  updatedAt?: string;
}

export type SyncCollection = "foods" | "combinations" | "logs" | "profile" | "goals";

export interface SyncTombstone {
  key: string; // `${collection}:${id}`
  collection: SyncCollection;
  id: string;
  updatedAt: string;
}

export interface CombinationItem {
  foodId: string;
  foodName: string;
  servingQuantity: number;
  servingUnit: ServingUnit;
}

export interface FoodCombination {
  id: string;
  userId: string;
  name: string;
  description?: string;
  items: CombinationItem[];
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  displayName: string;
  age?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  startingWeightKg?: number | null;
  targetWeightKg?: number | null;
  weeklyPaceKg?: number | null;
  workoutDaysPerWeek?: number | null;
  waterGoalLitres?: number | null;
  focusAreas?: string[];
  weightHistory?: WeightLogEntry[];
  dailyCheckIns?: Record<string, DailyHabitCheckIn>;
  biologicalSex?: BiologicalSex | null;
  fitnessGoal?: FitnessGoal | null;
  fitnessGoals?: FitnessGoal[];
  customGoal?: string | null;
  dietaryPreference: DietaryPreference;
  allergiesAndExclusions: string[];
  activityLevel?: ActivityLevel;
  createdAt: string;
  updatedAt: string;
}

export interface NutritionGoal {
  protein: number;       // g
  calories: number;      // kcal
  carbohydrates: number; // g
  totalFat: number;      // g
  fibre: number;         // g
  iron?: number | null;
  calcium?: number | null;
  zinc?: number | null;
  vitB12?: number | null;
  vitD?: number | null;
  folate?: number | null;
}

export interface DetectedFoodItem {
  foodName: string;
  estimatedQuantity: number;
  estimatedUnit: ServingUnit;
  confidence: number;
  suggestedNutrients: NutrientValues;
}

export interface PhotoAnalysis {
  id: string;
  userId: string;
  imageReference: string;
  detectedFoods: DetectedFoodItem[];
  confidence: number;
  status: "pending" | "reviewed" | "discarded";
  createdAt: string;
}
