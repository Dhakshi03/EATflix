import { NutrientValues, ReferenceServingType, ServingUnit } from "./types";
import { STARTER_FOODS } from "./starter-db";
import { scaleNutrientValues } from "./calculator";

export interface NutritionEstimateRequest {
  foodName?: string;
  quantity?: number;
  unit?: ServingUnit;
  referenceType?: ReferenceServingType;
  imageBase64?: string;
}

export interface NutritionEstimateResult {
  foodName: string;
  category: string;
  suggestedQuantity: number;
  suggestedUnit: ServingUnit;
  nutrients: NutrientValues;
  source: "ai" | "smart_estimator";
}

const UNIT_GRAM_APPROX: Record<ServingUnit, number> = {
  g: 1,
  ml: 1,
  piece: 85,
  cup: 200,
  tbsp: 15,
  scoop: 30,
};

interface DishArchetype {
  keywords: string[];
  category: string;
  defaultUnit: ServingUnit;
  gramsPerPiece: number;
  per100g: NutrientValues;
}

const DISH_ARCHETYPES: DishArchetype[] = [
  {
    keywords: ["masala dosa", "dosa", "rava dosa", "set dosa", "uthappam", "uttapam", "pesarattu", "appam"],
    category: "Grains & Cereals",
    defaultUnit: "piece",
    gramsPerPiece: 130,
    per100g: {
      protein: 5.8,
      calories: 215,
      carbohydrates: 33,
      totalFat: 6.5,
      saturatedFat: 2.1,
      fibre: 2.4,
      sugar: 1.2,
      sodium: 310,
      iron: 1.6,
      calcium: 32,
      zinc: 0.7,
      vitB12: 0.05,
      vitD: 0,
      folate: 24,
      healthyFats: 3.1,
    },
  },
  {
    keywords: ["idli", "idly", "rava idli", "thatte idli"],
    category: "Grains & Cereals",
    defaultUnit: "piece",
    gramsPerPiece: 50,
    per100g: {
      protein: 4.5,
      calories: 146,
      carbohydrates: 30,
      totalFat: 0.7,
      saturatedFat: 0.2,
      fibre: 1.8,
      sugar: 0.5,
      sodium: 220,
      iron: 1.1,
      calcium: 20,
      zinc: 0.5,
      vitB12: 0,
      vitD: 0,
      folate: 18,
      healthyFats: 0.3,
    },
  },
  {
    keywords: ["vada", "medu vada", "masala vada", "samosa", "bajji", "pakora", "pakoda", "bonda", "kachori"],
    category: "Snacks",
    defaultUnit: "piece",
    gramsPerPiece: 65,
    per100g: {
      protein: 7.2,
      calories: 295,
      carbohydrates: 31,
      totalFat: 15.8,
      saturatedFat: 3.9,
      fibre: 3.5,
      sugar: 1.5,
      sodium: 380,
      iron: 2.0,
      calcium: 38,
      zinc: 0.9,
      vitB12: 0,
      vitD: 0,
      folate: 35,
      healthyFats: 8.5,
    },
  },
  {
    keywords: ["sambar", "rasam", "dal", "daal", "kootu", "kadhi", "chole", "rajma", "chana", "kurma", "gravy", "curry"],
    category: "Legumes & Pulses",
    defaultUnit: "cup",
    gramsPerPiece: 200,
    per100g: {
      protein: 5.4,
      calories: 118,
      carbohydrates: 15.5,
      totalFat: 3.8,
      saturatedFat: 0.9,
      fibre: 4.1,
      sugar: 2.2,
      sodium: 290,
      iron: 1.9,
      calcium: 42,
      zinc: 0.8,
      vitB12: 0.05,
      vitD: 0,
      folate: 52,
      healthyFats: 2.2,
    },
  },
  {
    keywords: ["biryani", "pulao", "pulav", "fried rice", "lemon rice", "curd rice", "pongal", "khichdi", "bisibelebath"],
    category: "Grains & Cereals",
    defaultUnit: "cup",
    gramsPerPiece: 220,
    per100g: {
      protein: 7.8,
      calories: 185,
      carbohydrates: 24.5,
      totalFat: 6.2,
      saturatedFat: 1.9,
      fibre: 2.1,
      sugar: 1.4,
      sodium: 340,
      iron: 1.4,
      calcium: 36,
      zinc: 1.1,
      vitB12: 0.25,
      vitD: 2,
      folate: 22,
      healthyFats: 3.4,
    },
  },
  {
    keywords: ["chicken", "mutton", "lamb", "fish", "prawn", "shrimp", "tandoori", "kebab", "kabab", "shawarma", "tikka"],
    category: "Meat & Poultry",
    defaultUnit: "g",
    gramsPerPiece: 120,
    per100g: {
      protein: 23.5,
      calories: 195,
      carbohydrates: 3.2,
      totalFat: 9.5,
      saturatedFat: 2.8,
      fibre: 0.4,
      sugar: 0.8,
      sodium: 360,
      iron: 1.7,
      calcium: 24,
      zinc: 2.1,
      vitB12: 0.65,
      vitD: 8,
      folate: 12,
      healthyFats: 5.2,
    },
  },
  {
    keywords: ["paneer", "tofu", "palak paneer", "paneer butter", "kadai paneer", "shahi paneer", "cheese"],
    category: "Dairy & Alternatives",
    defaultUnit: "g",
    gramsPerPiece: 100,
    per100g: {
      protein: 15.5,
      calories: 245,
      carbohydrates: 6.5,
      totalFat: 17.5,
      saturatedFat: 9.8,
      fibre: 1.2,
      sugar: 2.4,
      sodium: 330,
      iron: 1.5,
      calcium: 380,
      zinc: 1.8,
      vitB12: 0.7,
      vitD: 12,
      folate: 25,
      healthyFats: 5.5,
    },
  },
  {
    keywords: ["egg", "omelette", "omelet", "bhurji", "scrambled", "boiled egg", "poached"],
    category: "Eggs",
    defaultUnit: "piece",
    gramsPerPiece: 55,
    per100g: {
      protein: 12.6,
      calories: 162,
      carbohydrates: 1.4,
      totalFat: 11.5,
      saturatedFat: 3.4,
      fibre: 0.2,
      sugar: 0.8,
      sodium: 190,
      iron: 1.8,
      calcium: 54,
      zinc: 1.3,
      vitB12: 1.1,
      vitD: 82,
      folate: 44,
      healthyFats: 6.2,
    },
  },
  {
    keywords: ["roti", "chapati", "chapathi", "phulka", "paratha", "naan", "kulcha", "poori", "puri", "thepla", "bhakri"],
    category: "Grains & Cereals",
    defaultUnit: "piece",
    gramsPerPiece: 45,
    per100g: {
      protein: 8.8,
      calories: 265,
      carbohydrates: 46,
      totalFat: 5.2,
      saturatedFat: 1.6,
      fibre: 6.5,
      sugar: 1.8,
      sodium: 210,
      iron: 2.7,
      calcium: 35,
      zinc: 1.6,
      vitB12: 0,
      vitD: 0,
      folate: 38,
      healthyFats: 2.8,
    },
  },
  {
    keywords: ["upma", "poha", "aval", "vermicelli", "semiya", "oats", "porridge", "muesli", "cereal", "granola"],
    category: "Grains & Cereals",
    defaultUnit: "cup",
    gramsPerPiece: 180,
    per100g: {
      protein: 5.2,
      calories: 155,
      carbohydrates: 26.5,
      totalFat: 3.4,
      saturatedFat: 0.7,
      fibre: 3.2,
      sugar: 2.1,
      sodium: 240,
      iron: 1.8,
      calcium: 28,
      zinc: 0.9,
      vitB12: 0,
      vitD: 0,
      folate: 26,
      healthyFats: 2.1,
    },
  },
  {
    keywords: ["sandwich", "burger", "wrap", "roll", "frankie", "pizza", "pasta", "macaroni", "noodles", "maggi", "chowmein"],
    category: "Prepared Meals",
    defaultUnit: "piece",
    gramsPerPiece: 160,
    per100g: {
      protein: 9.2,
      calories: 235,
      carbohydrates: 29.5,
      totalFat: 8.8,
      saturatedFat: 3.1,
      fibre: 2.6,
      sugar: 3.5,
      sodium: 460,
      iron: 1.8,
      calcium: 85,
      zinc: 1.1,
      vitB12: 0.3,
      vitD: 4,
      folate: 42,
      healthyFats: 4.2,
    },
  },
  {
    keywords: ["shake", "smoothie", "lassi", "buttermilk", "chaas", "milk", "coffee", "tea", "chai", "latte", "juice"],
    category: "Beverages",
    defaultUnit: "ml",
    gramsPerPiece: 250,
    per100g: {
      protein: 3.6,
      calories: 78,
      carbohydrates: 9.5,
      totalFat: 2.8,
      saturatedFat: 1.6,
      fibre: 0.5,
      sugar: 7.8,
      sodium: 48,
      iron: 0.2,
      calcium: 115,
      zinc: 0.4,
      vitB12: 0.4,
      vitD: 24,
      folate: 8,
      healthyFats: 0.9,
    },
  },
  {
    keywords: ["whey", "protein powder", "protein bar", "isolate", "creatine", "mass gainer"],
    category: "Supplements",
    defaultUnit: "scoop",
    gramsPerPiece: 32,
    per100g: {
      protein: 76.0,
      calories: 380,
      carbohydrates: 8.5,
      totalFat: 4.5,
      saturatedFat: 2.2,
      fibre: 1.0,
      sugar: 4.0,
      sodium: 180,
      iron: 1.2,
      calcium: 350,
      zinc: 1.5,
      vitB12: 1.2,
      vitD: 15,
      folate: 20,
      healthyFats: 1.5,
    },
  },
  {
    keywords: ["peanut butter", "almond", "cashew", "walnut", "pistachio", "peanuts", "nuts", "chia", "flax", "seeds"],
    category: "Nuts & Seeds",
    defaultUnit: "tbsp",
    gramsPerPiece: 16,
    per100g: {
      protein: 24.0,
      calories: 588,
      carbohydrates: 20.0,
      totalFat: 50.0,
      saturatedFat: 9.5,
      fibre: 6.5,
      sugar: 6.0,
      sodium: 140,
      iron: 2.2,
      calcium: 55,
      zinc: 2.8,
      vitB12: 0,
      vitD: 0,
      folate: 74,
      healthyFats: 38.0,
    },
  },
  {
    keywords: ["salad", "sabzi", "poriyal", "avial", "subzi", "bhindi", "gobi", "aloo", "vegetable", "veggies", "palak", "broccoli"],
    category: "Vegetables",
    defaultUnit: "cup",
    gramsPerPiece: 150,
    per100g: {
      protein: 2.8,
      calories: 92,
      carbohydrates: 11.5,
      totalFat: 4.1,
      saturatedFat: 0.8,
      fibre: 3.8,
      sugar: 2.6,
      sodium: 210,
      iron: 1.4,
      calcium: 48,
      zinc: 0.5,
      vitB12: 0,
      vitD: 0,
      folate: 46,
      healthyFats: 2.6,
    },
  },
  {
    keywords: ["banana", "apple", "mango", "papaya", "orange", "guava", "pomegranate", "watermelon", "berries", "grapes", "fruit"],
    category: "Fruits",
    defaultUnit: "piece",
    gramsPerPiece: 120,
    per100g: {
      protein: 1.1,
      calories: 68,
      carbohydrates: 16.5,
      totalFat: 0.3,
      saturatedFat: 0.1,
      fibre: 2.6,
      sugar: 11.5,
      sodium: 2,
      iron: 0.3,
      calcium: 12,
      zinc: 0.15,
      vitB12: 0,
      vitD: 0,
      folate: 20,
      healthyFats: 0.1,
    },
  },
  {
    keywords: ["cake", "brownie", "cookie", "biscuit", "ice cream", "gulab jamun", "jalebi", "laddu", "ladoo", "halwa", "payasam", "kheer", "chocolate", "sweet", "mithai", "pastry"],
    category: "Sweets & Desserts",
    defaultUnit: "piece",
    gramsPerPiece: 60,
    per100g: {
      protein: 4.8,
      calories: 365,
      carbohydrates: 52.0,
      totalFat: 15.5,
      saturatedFat: 7.8,
      fibre: 1.2,
      sugar: 34.0,
      sodium: 160,
      iron: 0.9,
      calcium: 75,
      zinc: 0.6,
      vitB12: 0.2,
      vitD: 4,
      folate: 14,
      healthyFats: 5.5,
    },
  },
];

const DEFAULT_ARCHETYPE: DishArchetype = {
  keywords: [],
  category: "Prepared Meals",
  defaultUnit: "piece",
  gramsPerPiece: 120,
  per100g: {
    protein: 7.5,
    calories: 180,
    carbohydrates: 22.0,
    totalFat: 6.8,
    saturatedFat: 2.1,
    fibre: 2.5,
    sugar: 2.0,
    sodium: 280,
    iron: 1.4,
    calcium: 45,
    zinc: 0.9,
    vitB12: 0.2,
    vitD: 2,
    folate: 28,
    healthyFats: 3.5,
  },
};

function round1(val: number | null): number | null {
  if (val === null || !Number.isFinite(val)) return null;
  return Math.round(val * 10) / 10;
}

function scalePer100g(per100g: NutrientValues, grams: number): NutrientValues {
  const ratio = Math.max(0.05, grams / 100);
  return {
    protein: round1((per100g.protein ?? 0) * ratio),
    calories: Math.round((per100g.calories ?? 0) * ratio),
    carbohydrates: round1((per100g.carbohydrates ?? 0) * ratio),
    totalFat: round1((per100g.totalFat ?? 0) * ratio),
    saturatedFat: round1((per100g.saturatedFat ?? 0) * ratio),
    fibre: round1((per100g.fibre ?? 0) * ratio),
    sugar: round1((per100g.sugar ?? 0) * ratio),
    sodium: Math.round((per100g.sodium ?? 0) * ratio),
    iron: round1((per100g.iron ?? 0) * ratio),
    calcium: Math.round((per100g.calcium ?? 0) * ratio),
    zinc: round1((per100g.zinc ?? 0) * ratio),
    vitB12: round1((per100g.vitB12 ?? 0) * ratio),
    vitD: Math.round((per100g.vitD ?? 0) * ratio),
    folate: Math.round((per100g.folate ?? 0) * ratio),
    healthyFats: round1((per100g.healthyFats ?? 0) * ratio),
  };
}

/**
 * Deterministic culinary nutrition estimator for any food name + serving size.
 * Checks STARTER_FOODS first for close matches, then culinary dish archetypes.
 */
export function estimateNutritionByName(
  rawName: string,
  quantity?: number,
  unit?: ServingUnit,
  referenceType: ReferenceServingType = "per_serving"
): NutritionEstimateResult {
  const cleanName = (rawName || "").trim() || "Home Cooked Dish";
  const lower = cleanName.toLowerCase();

  // 1. Check if starter DB has a matching food
  const starterMatch = STARTER_FOODS.find(
    (f) => f.name.toLowerCase() === lower || lower.includes(f.name.toLowerCase()) || f.name.toLowerCase().includes(lower)
  );

  if (starterMatch) {
    const targetUnit: ServingUnit =
      referenceType === "per_100g"
        ? "g"
        : referenceType === "per_100ml"
        ? "ml"
        : unit || starterMatch.defaultServingUnit;
    const targetQty =
      referenceType === "per_100g" || referenceType === "per_100ml"
        ? 100
        : quantity && quantity > 0
        ? quantity
        : starterMatch.defaultServingQuantity;

    try {
      const scaled = scaleNutrientValues(starterMatch, targetQty, targetUnit);
      return {
        foodName: cleanName,
        category: starterMatch.category,
        suggestedQuantity: targetQty,
        suggestedUnit: targetUnit,
        nutrients: scaled,
        source: "smart_estimator",
      };
    } catch {
      // Fall through to archetype scaling if unit conversion differs
    }
  }

  // 2. Match culinary archetype
  const archetype =
    DISH_ARCHETYPES.find((a) => a.keywords.some((kw) => lower.includes(kw))) || DEFAULT_ARCHETYPE;

  const finalUnit: ServingUnit =
    referenceType === "per_100g"
      ? "g"
      : referenceType === "per_100ml"
      ? "ml"
      : unit || archetype.defaultUnit;

  const finalQty =
    referenceType === "per_100g" || referenceType === "per_100ml"
      ? 100
      : quantity && quantity > 0
      ? quantity
      : finalUnit === "g" || finalUnit === "ml"
      ? 100
      : 1;

  let estimatedGrams = 100;
  if (referenceType === "per_100g" || referenceType === "per_100ml") {
    estimatedGrams = 100;
  } else if (finalUnit === "g" || finalUnit === "ml") {
    estimatedGrams = finalQty;
  } else if (finalUnit === "piece") {
    estimatedGrams = finalQty * archetype.gramsPerPiece;
  } else {
    estimatedGrams = finalQty * (UNIT_GRAM_APPROX[finalUnit] || 100);
  }

  return {
    foodName: cleanName,
    category: archetype.category,
    suggestedQuantity: finalQty,
    suggestedUnit: finalUnit,
    nutrients: scalePer100g(archetype.per100g, estimatedGrams),
    source: "smart_estimator",
  };
}

/**
 * Compress an image file on the client before sending to `/api/ai/analyze-food`.
 */
export async function compressFoodPhoto(file: File, maxDimension = 512, quality = 0.65): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(dataUrl);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch {
          resolve(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Estimates nutrition for a food item using Gemini AI (via `/api/ai/analyze-food`)
 * from either its name, an uploaded photo, or both. Automatically falls back to
 * `estimateNutritionByName` if offline or if no API key is configured.
 */
export async function requestFoodNutritionEstimate(
  req: NutritionEstimateRequest
): Promise<NutritionEstimateResult> {
  const { foodName = "", quantity, unit, referenceType = "per_serving", imageBase64 } = req;

  // Instant 0ms fast-path when estimating by food name (no image upload needed)
  if (!imageBase64 && foodName.trim()) {
    return estimateNutritionByName(foodName.trim(), quantity, unit, referenceType);
  }

  const targetDesc =
    referenceType === "per_100g"
      ? `100 g of ${foodName || "this food"}`
      : referenceType === "per_100ml"
      ? `100 ml of ${foodName || "this food"}`
      : quantity && unit && foodName
      ? `${quantity} ${unit} of ${foodName}`
      : foodName || "Identify this food and estimate 1 standard serving";

  let clientApiKey = "";
  if (typeof window !== "undefined") {
    clientApiKey = localStorage.getItem("nutritrack_gemini_api_key") || "";
  }

  try {
    const res = await fetch("/api/ai/analyze-food", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: imageBase64 || "",
        description: targetDesc,
        clientApiKey: clientApiKey.trim(),
      }),
    });

    const data = await res.json();
    if (res.ok && Array.isArray(data?.items) && data.items.length > 0) {
      const first = data.items[0];
      const en = first.estimatedNutrients || {};
      const resolvedName = foodName.trim() || first.foodName || "Estimated Dish";
      const fallback = estimateNutritionByName(resolvedName, quantity, unit, referenceType);

      return {
        foodName: resolvedName,
        category: fallback.category,
        suggestedQuantity:
          referenceType === "per_100g" || referenceType === "per_100ml"
            ? 100
            : quantity && quantity > 0
            ? quantity
            : first.estimatedQuantity || fallback.suggestedQuantity,
        suggestedUnit:
          referenceType === "per_100g"
            ? "g"
            : referenceType === "per_100ml"
            ? "ml"
            : unit || first.estimatedUnit || fallback.suggestedUnit,
        nutrients: {
          protein: en.protein ?? fallback.nutrients.protein,
          calories: en.calories ?? fallback.nutrients.calories,
          carbohydrates: en.carbohydrates ?? fallback.nutrients.carbohydrates,
          totalFat: en.totalFat ?? fallback.nutrients.totalFat,
          saturatedFat: en.saturatedFat ?? fallback.nutrients.saturatedFat,
          fibre: en.fibre ?? fallback.nutrients.fibre,
          sugar: en.sugar ?? fallback.nutrients.sugar,
          sodium: en.sodium ?? fallback.nutrients.sodium,
          iron: en.iron ?? fallback.nutrients.iron,
          calcium: en.calcium ?? fallback.nutrients.calcium,
          zinc: en.zinc ?? fallback.nutrients.zinc,
          vitB12: en.vitB12 ?? fallback.nutrients.vitB12,
          vitD: en.vitD ?? fallback.nutrients.vitD,
          folate: en.folate ?? fallback.nutrients.folate,
          healthyFats: en.healthyFats ?? fallback.nutrients.healthyFats,
        },
        source: data.source === "smart_estimator" ? "smart_estimator" : "ai",
      };
    }
  } catch {
    // Fall back to deterministic estimator
  }

  return estimateNutritionByName(foodName || "Custom Meal", quantity, unit, referenceType);
}
