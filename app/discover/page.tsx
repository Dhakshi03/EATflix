"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navigation/Navbar";
import { Food, FoodLogEntry, MealType, NutritionGoal, ServingUnit, UserProfile } from "@/lib/nutrition/types";
import { aggregateDailyNutrients, scaleNutrientValues } from "@/lib/nutrition/calculator";
import { calculateNutrientGaps, isFoodDietaryCompliant } from "@/lib/nutrition/recommender";
import { estimateNutritionByName } from "@/lib/nutrition/estimator";
import { getFoodPosterUrl } from "@/lib/nutrition/media";
import { localDateIso } from "@/lib/nutrition/combination";
import {
  getAllFoods,
  getFoodLogsByDate,
  getNutritionGoals,
  getUserProfile,
  mergeSavedAndCommonFoods,
  saveFood,
  saveFoodLogEntry,
  seedStarterDataIfEmpty,
} from "@/lib/storage/indexed-db";
import {
  Sparkles,
  Zap,
  Flame,
  CheckCircle2,
  Info,
  Plus,
  Minus,
  Heart,
  Search,
  Clock,
  Star,
  ShoppingBag,
  LayoutGrid,
  List,
  HelpCircle,
  X,
} from "lucide-react";

// Extra curated Swiggy + Insta trending dishes to make the feed rich with 45+ varied options
const TRENDING_FEED_FOODS: Food[] = [
  {
    id: "feed_paneer_tikka_bowl",
    ownerUserId: null,
    name: "Tandoori Paneer Tikka (6 pcs)",
    brand: "High-Protein Bowl",
    category: "North Indian",
    referenceType: "per_serving",
    defaultServingQuantity: 1,
    defaultServingUnit: "piece",
    referenceQuantity: 1,
    referenceUnit: "piece",
    nutrientValues: {
      protein: 22.5,
      calories: 310,
      carbohydrates: 8.5,
      totalFat: 20.0,
      saturatedFat: 10.5,
      fibre: 2.2,
      sugar: 3.0,
      sodium: 440,
      iron: 2.1,
      calcium: 480,
      zinc: 2.2,
      vitB12: 0.8,
      vitD: 12,
      folate: 30,
      healthyFats: 6.5,
    },
    dataSource: "starter_verified",
    verificationStatus: "verified",
    pricePerServing: 65,
    preparationEffort: "medium",
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "feed_moong_dal_chilla",
    ownerUserId: null,
    name: "Moong Dal Paneer Chilla (2 pcs)",
    brand: "Home Tiffin",
    category: "North Indian",
    referenceType: "per_serving",
    defaultServingQuantity: 2,
    defaultServingUnit: "piece",
    referenceQuantity: 2,
    referenceUnit: "piece",
    nutrientValues: {
      protein: 16.8,
      calories: 265,
      carbohydrates: 31.0,
      totalFat: 8.2,
      saturatedFat: 2.8,
      fibre: 6.4,
      sugar: 2.1,
      sodium: 310,
      iron: 3.2,
      calcium: 165,
      zinc: 1.9,
      vitB12: 0.3,
      vitD: 0,
      folate: 95,
      healthyFats: 4.5,
    },
    dataSource: "starter_verified",
    verificationStatus: "verified",
    pricePerServing: 30,
    preparationEffort: "low",
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "feed_masala_dosa_sambar",
    ownerUserId: null,
    name: "Crispy Masala Dosa + Sambar",
    brand: "South Indian Tiffin",
    category: "South Indian",
    referenceType: "per_serving",
    defaultServingQuantity: 1,
    defaultServingUnit: "piece",
    referenceQuantity: 1,
    referenceUnit: "piece",
    nutrientValues: {
      protein: 10.4,
      calories: 335,
      carbohydrates: 49.0,
      totalFat: 10.2,
      saturatedFat: 3.1,
      fibre: 4.8,
      sugar: 2.5,
      sodium: 460,
      iron: 2.4,
      calcium: 62,
      zinc: 1.2,
      vitB12: 0.05,
      vitD: 0,
      folate: 48,
      healthyFats: 5.2,
    },
    dataSource: "starter_verified",
    verificationStatus: "verified",
    pricePerServing: 45,
    preparationEffort: "medium",
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "feed_idli_sambar_combo",
    ownerUserId: null,
    name: "Steamed Idli (3 pcs) + Hot Sambar",
    brand: "South Indian Tiffin",
    category: "South Indian",
    referenceType: "per_serving",
    defaultServingQuantity: 3,
    defaultServingUnit: "piece",
    referenceQuantity: 3,
    referenceUnit: "piece",
    nutrientValues: {
      protein: 11.2,
      calories: 255,
      carbohydrates: 46.0,
      totalFat: 3.1,
      saturatedFat: 0.7,
      fibre: 5.2,
      sugar: 2.0,
      sodium: 380,
      iron: 2.3,
      calcium: 58,
      zinc: 1.1,
      vitB12: 0,
      vitD: 0,
      folate: 54,
      healthyFats: 1.8,
    },
    dataSource: "starter_verified",
    verificationStatus: "verified",
    pricePerServing: 30,
    preparationEffort: "low",
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "feed_egg_bhurji",
    ownerUserId: null,
    name: "Masala Egg Bhurji (3 Eggs)",
    brand: "Street Style",
    category: "Dairy & Eggs",
    referenceType: "per_serving",
    defaultServingQuantity: 1,
    defaultServingUnit: "cup",
    referenceQuantity: 1,
    referenceUnit: "cup",
    nutrientValues: {
      protein: 19.2,
      calories: 260,
      carbohydrates: 4.5,
      totalFat: 18.0,
      saturatedFat: 5.2,
      fibre: 1.2,
      sugar: 2.0,
      sodium: 340,
      iron: 2.8,
      calcium: 85,
      zinc: 1.8,
      vitB12: 1.6,
      vitD: 120,
      folate: 68,
      healthyFats: 9.5,
    },
    dataSource: "starter_verified",
    verificationStatus: "verified",
    pricePerServing: 30,
    preparationEffort: "low",
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "feed_sprouted_moong_chaat",
    ownerUserId: null,
    name: "Crunchy Sprouted Moong Bhel Chaat",
    brand: "Fresh Chaat",
    category: "Chaat & Snacks",
    referenceType: "per_serving",
    defaultServingQuantity: 1,
    defaultServingUnit: "cup",
    referenceQuantity: 1,
    referenceUnit: "cup",
    nutrientValues: {
      protein: 11.5,
      calories: 165,
      carbohydrates: 26.0,
      totalFat: 2.2,
      saturatedFat: 0.4,
      fibre: 7.4,
      sugar: 3.2,
      sodium: 240,
      iron: 3.1,
      calcium: 52,
      zinc: 1.6,
      vitB12: 0,
      vitD: 0,
      folate: 110,
      healthyFats: 1.4,
    },
    dataSource: "starter_verified",
    verificationStatus: "verified",
    pricePerServing: 20,
    preparationEffort: "low",
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "feed_peanut_butter_banana_toast",
    ownerUserId: null,
    name: "Peanut Butter & Banana Multigrain Toast",
    brand: "Quick Fuel",
    category: "Chaat & Snacks",
    referenceType: "per_serving",
    defaultServingQuantity: 2,
    defaultServingUnit: "piece",
    referenceQuantity: 2,
    referenceUnit: "piece",
    nutrientValues: {
      protein: 13.8,
      calories: 340,
      carbohydrates: 42.0,
      totalFat: 14.5,
      saturatedFat: 2.8,
      fibre: 6.2,
      sugar: 11.0,
      sodium: 210,
      iron: 1.9,
      calcium: 48,
      zinc: 1.5,
      vitB12: 0,
      vitD: 0,
      folate: 52,
      healthyFats: 10.5,
    },
    dataSource: "starter_verified",
    verificationStatus: "verified",
    pricePerServing: 22,
    preparationEffort: "low",
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "feed_cold_coffee_whey_shake",
    ownerUserId: null,
    name: "Iced Cold Coffee Protein Smoothie",
    brand: "Cafe Protein",
    category: "Shakes & Bowls",
    referenceType: "per_serving",
    defaultServingQuantity: 350,
    defaultServingUnit: "ml",
    referenceQuantity: 350,
    referenceUnit: "ml",
    nutrientValues: {
      protein: 27.5,
      calories: 215,
      carbohydrates: 14.0,
      totalFat: 4.5,
      saturatedFat: 2.4,
      fibre: 1.2,
      sugar: 9.0,
      sodium: 140,
      iron: 1.1,
      calcium: 290,
      zinc: 1.4,
      vitB12: 1.1,
      vitD: 40,
      folate: 18,
      healthyFats: 1.8,
    },
    dataSource: "starter_verified",
    verificationStatus: "verified",
    pricePerServing: 55,
    preparationEffort: "low",
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "feed_chicken_shawarma_plate",
    ownerUserId: null,
    name: "Grilled Chicken Shawarma Salad Bowl",
    brand: "Protein Grill",
    category: "Meat, Fish & Poultry",
    referenceType: "per_serving",
    defaultServingQuantity: 1,
    defaultServingUnit: "cup",
    referenceQuantity: 1,
    referenceUnit: "cup",
    nutrientValues: {
      protein: 32.0,
      calories: 345,
      carbohydrates: 18.0,
      totalFat: 15.5,
      saturatedFat: 3.8,
      fibre: 4.2,
      sugar: 3.5,
      sodium: 480,
      iron: 2.2,
      calcium: 65,
      zinc: 2.6,
      vitB12: 0.7,
      vitD: 8,
      folate: 36,
      healthyFats: 9.2,
    },
    dataSource: "starter_verified",
    verificationStatus: "verified",
    pricePerServing: 85,
    preparationEffort: "medium",
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "feed_roasted_makhana_peanuts",
    ownerUserId: null,
    name: "Peri-Peri Roasted Makhana & Peanuts",
    brand: "Crunch Box",
    category: "Chaat & Snacks",
    referenceType: "per_serving",
    defaultServingQuantity: 50,
    defaultServingUnit: "g",
    referenceQuantity: 50,
    referenceUnit: "g",
    nutrientValues: {
      protein: 9.4,
      calories: 210,
      carbohydrates: 24.0,
      totalFat: 8.5,
      saturatedFat: 1.5,
      fibre: 4.5,
      sugar: 1.2,
      sodium: 190,
      iron: 1.8,
      calcium: 38,
      zinc: 1.3,
      vitB12: 0,
      vitD: 0,
      folate: 34,
      healthyFats: 6.2,
    },
    dataSource: "starter_verified",
    verificationStatus: "verified",
    pricePerServing: 18,
    preparationEffort: "low",
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "feed_palak_paneer_bowl",
    ownerUserId: null,
    name: "Homestyle Palak Paneer Bowl",
    brand: "Iron & Protein Rich",
    category: "North Indian",
    referenceType: "per_serving",
    defaultServingQuantity: 1,
    defaultServingUnit: "cup",
    referenceQuantity: 1,
    referenceUnit: "cup",
    nutrientValues: {
      protein: 16.5,
      calories: 275,
      carbohydrates: 10.5,
      totalFat: 18.5,
      saturatedFat: 8.9,
      fibre: 4.8,
      sugar: 2.5,
      sodium: 360,
      iron: 4.6,
      calcium: 420,
      zinc: 1.9,
      vitB12: 0.6,
      vitD: 8,
      folate: 135,
      healthyFats: 7.2,
    },
    dataSource: "starter_verified",
    verificationStatus: "verified",
    pricePerServing: 50,
    preparationEffort: "medium",
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "feed_sundal_bowl",
    ownerUserId: null,
    name: "South Indian Kala Chana Coconut Sundal",
    brand: "Temple Style",
    category: "South Indian",
    referenceType: "per_serving",
    defaultServingQuantity: 1,
    defaultServingUnit: "cup",
    referenceQuantity: 1,
    referenceUnit: "cup",
    nutrientValues: {
      protein: 12.8,
      calories: 230,
      carbohydrates: 32.0,
      totalFat: 5.8,
      saturatedFat: 2.6,
      fibre: 8.6,
      sugar: 2.8,
      sodium: 240,
      iron: 3.4,
      calcium: 68,
      zinc: 1.8,
      vitB12: 0,
      vitD: 0,
      folate: 140,
      healthyFats: 2.5,
    },
    dataSource: "starter_verified",
    verificationStatus: "verified",
    pricePerServing: 20,
    preparationEffort: "low",
    isArchived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];

type StoryCategory =
  | "all"
  | "protein_bombs"
  | "south_indian"
  | "north_indian"
  | "snacks"
  | "shakes_dairy"
  | "eggs_grill"
  | "budget";

const STORY_CIRCLES: { id: StoryCategory; label: string; badge: string; img: string }[] = [
  {
    id: "all",
    label: "For You",
    badge: "🔥 Top",
    img: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "protein_bombs",
    label: "Protein 15g+",
    badge: "💪 Max",
    img: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "south_indian",
    label: "South Indian",
    badge: "🍛 Tiffin",
    img: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "north_indian",
    label: "North Indian",
    badge: "🥘 Bowls",
    img: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "snacks",
    label: "Quick Chaat",
    badge: "⚡ 5 Min",
    img: "https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "shakes_dairy",
    label: "Shakes & Bowls",
    badge: "🥤 Cool",
    img: "https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "eggs_grill",
    label: "Eggs & Grill",
    badge: "🍳Lean",
    img: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=300&q=80",
  },
  {
    id: "budget",
    label: "Under ₹25",
    badge: "💸 Deal",
    img: "https://images.unsplash.com/photo-1508061253366-f7da158b6d46?auto=format&fit=crop&w=300&q=80",
  },
];

function getDietDotType(food: Food): "veg" | "egg" | "non_veg" {
  const text = `${food.name} ${food.category}`.toLowerCase();
  if (
    text.includes("chicken") ||
    text.includes("fish") ||
    text.includes("meat") ||
    text.includes("mutton") ||
    text.includes("prawn") ||
    text.includes("salmon") ||
    text.includes("tuna")
  ) {
    return "non_veg";
  }
  if (text.includes("egg") || text.includes("omelette")) {
    return "egg";
  }
  return "veg";
}

export default function DiscoverPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [goals, setGoals] = useState<NutritionGoal | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [logs, setLogs] = useState<FoodLogEntry[]>([]);

  // Interactive Feed State
  const [activeStory, setActiveStory] = useState<StoryCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [quickChip, setQuickChip] = useState<"none" | "quick" | "fibre" | "light" | "iron" | "liked">("none");
  const [viewLayout, setViewLayout] = useState<"insta" | "swiggy">("insta");
  const [targetMeal, setTargetMeal] = useState<MealType>("snack");

  // Per-card portion multiplier (e.g. 1, 1.5, 2) & Swiggy Plate Cart
  const [multipliers, setMultipliers] = useState<Record<string, number>>({});
  const [plateCart, setPlateCart] = useState<Record<string, number>>({});
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [heartPopId, setHeartPopId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showExplainer, setShowExplainer] = useState(false);

  const load = async () => {
    await seedStarterDataIfEmpty();
    const p = await getUserProfile();
    const g = await getNutritionGoals();
    const f = await getAllFoods();
    const l = await getFoodLogsByDate(localDateIso());
    setProfile(p);
    setGoals(g);
    setFoods(f);
    setLogs(l);
    setLikedIds(new Set(f.map((item) => item.name.toLowerCase())));
  };

  useEffect(() => {
    load();
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const totals = useMemo(() => aggregateDailyNutrients(logs).totals, [logs]);
  const gaps = useMemo(() => (goals ? calculateNutrientGaps(totals, goals) : null), [totals, goals]);

  // Combine Saved Foods + Starter Foods + Curated Trending Swiggy/Insta Dishes
  const allFeedFoods = useMemo(() => {
    const base = mergeSavedAndCommonFoods(foods);
    const seen = new Set(base.map((f) => f.name.toLowerCase()));
    const combined = [...base];
    for (const extra of TRENDING_FEED_FOODS) {
      if (!seen.has(extra.name.toLowerCase())) {
        seen.add(extra.name.toLowerCase());
        combined.push(extra);
      }
    }
    return combined;
  }, [foods]);

  // Build full interactive feed items
  const feedItems = useMemo(() => {
    if (!profile || !goals) return [];

    const compliant = allFeedFoods.filter(
      (f) => !f.isArchived && isFoodDietaryCompliant(f, profile.dietaryPreference, profile.allergiesAndExclusions)
    );

    const mapped = compliant.map((food, index) => {
      const mult = multipliers[food.id] ?? 1;
      const baseQty = food.defaultServingQuantity || 1;
      const qty = Math.round(baseQty * mult * 10) / 10;
      const unit = food.defaultServingUnit || food.referenceUnit;
      const nutrients = scaleNutrientValues(food, qty, unit);
      const protein = nutrients.protein || 0;
      const calories = nutrients.calories || 0;
      const fibre = nutrients.fibre || 0;
      const iron = nutrients.iron || 0;
      const price = food.pricePerServing != null ? Math.round(food.pricePerServing * mult) : 25;

      const proteinGap = Math.max(1, gaps?.proteinGap || goals.protein || 80);
      const pctOfGap = Math.min(100, Math.round((protein / proteinGap) * 100));

      // Deterministic rating & prep time for Swiggy feel
      const rating = (4.5 + ((index * 7) % 5) * 0.1).toFixed(1);
      const prepMins = food.preparationEffort === "low" ? "5 mins" : food.preparationEffort === "high" ? "20 mins" : "12 mins";

      let tag = `Covers ${pctOfGap}% of protein gap`;
      if (protein >= 18) tag = `🔥 Mega Protein Boost (+${protein}g P)`;
      else if (fibre >= 6) tag = `🌿 Gut & Fibre Rich (+${fibre}g Fibre)`;
      else if (iron >= 2.5) tag = `💇‍♀️ Hair & Iron Booster (+${iron}mg Iron)`;

      return {
        food,
        qty,
        unit,
        mult,
        nutrients,
        protein,
        calories,
        fibre,
        iron,
        price,
        pctOfGap,
        rating,
        prepMins,
        tag,
        dietType: getDietDotType(food),
      };
    });

    // Filter by Story Circle
    let filtered = mapped.filter((item) => {
      const text = `${item.food.name} ${item.food.category} ${item.food.brand ?? ""}`.toLowerCase();
      if (activeStory === "protein_bombs") return item.protein >= 13;
      if (activeStory === "south_indian") {
        return (
          text.includes("south indian") ||
          text.includes("dosa") ||
          text.includes("idli") ||
          text.includes("sambar") ||
          text.includes("sundal") ||
          text.includes("curd") ||
          text.includes("buttermilk")
        );
      }
      if (activeStory === "north_indian") {
        return (
          text.includes("north indian") ||
          text.includes("paneer") ||
          text.includes("dal") ||
          text.includes("rajma") ||
          text.includes("chana") ||
          text.includes("chilla") ||
          text.includes("roti") ||
          text.includes("soya")
        );
      }
      if (activeStory === "snacks") {
        return (
          text.includes("snack") ||
          text.includes("chaat") ||
          text.includes("sprout") ||
          text.includes("peanut") ||
          text.includes("makhana") ||
          text.includes("toast") ||
          text.includes("almond") ||
          text.includes("seed")
        );
      }
      if (activeStory === "shakes_dairy") {
        return (
          text.includes("shake") ||
          text.includes("whey") ||
          text.includes("milk") ||
          text.includes("curd") ||
          text.includes("yogurt") ||
          text.includes("oat") ||
          text.includes("sattu")
        );
      }
      if (activeStory === "eggs_grill") {
        return (
          text.includes("egg") ||
          text.includes("chicken") ||
          text.includes("fish") ||
          text.includes("meat") ||
          text.includes("poultry")
        );
      }
      if (activeStory === "budget") {
        return item.price <= 25;
      }
      return true;
    });

    // Filter by Quick Chip
    if (quickChip === "quick") {
      filtered = filtered.filter((i) => i.food.preparationEffort === "low");
    } else if (quickChip === "fibre") {
      filtered = filtered.filter((i) => i.fibre >= 4);
    } else if (quickChip === "light") {
      filtered = filtered.filter((i) => i.calories > 0 && i.calories <= 200);
    } else if (quickChip === "iron") {
      filtered = filtered.filter((i) => i.iron >= 1.8);
    } else if (quickChip === "liked") {
      filtered = filtered.filter((i) => likedIds.has(i.food.name.toLowerCase()));
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((i) =>
        `${i.food.name} ${i.food.category} ${i.food.brand ?? ""}`.toLowerCase().includes(q)
      );

      // If the user typed a craving not in our 45+ catalog, dynamically synthesize a card for it!
      if (filtered.length === 0) {
        const est = estimateNutritionByName(searchQuery.trim(), 1, "piece", "per_serving");
        const synthFood: Food = {
          id: `synth_${searchQuery.trim().toLowerCase().replace(/\s+/g, "_")}`,
          ownerUserId: "default_user",
          name: est.foodName,
          brand: "Instant AI Estimate",
          category: est.category,
          referenceType: "per_serving",
          defaultServingQuantity: est.suggestedQuantity,
          defaultServingUnit: est.suggestedUnit,
          referenceQuantity: est.suggestedQuantity,
          referenceUnit: est.suggestedUnit,
          nutrientValues: est.nutrients,
          dataSource: "user_created",
          verificationStatus: "unverified",
          pricePerServing: 35,
          preparationEffort: "low",
          isArchived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const mult = multipliers[synthFood.id] ?? 1;
        const qty = Math.round(synthFood.defaultServingQuantity * mult * 10) / 10;
        const scaled = scaleNutrientValues(synthFood, qty, synthFood.defaultServingUnit);
        filtered = [
          {
            food: synthFood,
            qty,
            unit: synthFood.defaultServingUnit,
            mult,
            nutrients: scaled,
            protein: scaled.protein || 0,
            calories: scaled.calories || 0,
            fibre: scaled.fibre || 0,
            iron: scaled.iron || 0,
            price: Math.round(35 * mult),
            pctOfGap: Math.min(100, Math.round(((scaled.protein || 0) / Math.max(1, gaps?.proteinGap || 60)) * 100)),
            rating: "4.8",
            prepMins: "10 mins",
            tag: `✨ Instant Craving Match (+${scaled.protein || 0}g P)`,
            dietType: getDietDotType(synthFood),
          },
        ];
      }
    }

    // Sort by protein density + relevance
    return filtered.sort((a, b) => b.protein - a.protein);
  }, [allFeedFoods, profile, goals, gaps, multipliers, activeStory, quickChip, searchQuery, likedIds]);

  const adjustMultiplier = (foodId: string, delta: number) => {
    setMultipliers((prev) => {
      const current = prev[foodId] ?? 1;
      const next = Math.max(0.5, Math.min(5, Math.round((current + delta) * 2) / 2));
      return { ...prev, [foodId]: next };
    });
  };

  const togglePlateItem = (foodId: string, delta: number) => {
    setPlateCart((prev) => {
      const next = { ...prev };
      const updated = Math.round(((next[foodId] || 0) + delta) * 2) / 2;
      if (updated <= 0) {
        delete next[foodId];
      } else {
        next[foodId] = updated;
      }
      return next;
    });
  };

  const handleToggleLike = async (food: Food) => {
    const key = food.name.toLowerCase();
    setHeartPopId(food.id);
    setTimeout(() => setHeartPopId(null), 650);

    if (likedIds.has(key)) {
      setLikedIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      flash(`Removed "${food.name}" from Liked.`);
      return;
    }

    setLikedIds((prev) => new Set(prev).add(key));
    const savedCopy: Food = {
      ...food,
      id: food.id.startsWith("food_saved_") ? food.id : `food_saved_${food.id}`,
      ownerUserId: "default_user",
      dataSource: "user_created",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveFood(savedCopy);
    setFoods(await getAllFoods());
    flash(`❤️ Saved "${food.name}" to My List!`);
  };

  const handleQuickLogSingle = async (item: (typeof feedItems)[number]) => {
    await saveFoodLogEntry({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: "default_user",
      foodId: item.food.id,
      foodNameSnapshot: item.food.name,
      servingQuantity: item.qty,
      servingUnit: item.unit as ServingUnit,
      nutritionSnapshot: item.nutrients,
      mealType: targetMeal,
      entrySource: "recommendation",
      loggedAt: localDateIso(),
      createdAt: new Date().toISOString(),
    });
    flash(`Logged ${item.qty} ${item.unit} ${item.food.name} to ${targetMeal}!`);
    await load();
  };

  // Summary of sticky bottom Swiggy Plate Cart
  const plateSummary = useMemo(() => {
    let count = 0;
    let protein = 0;
    let calories = 0;
    const entries: { food: Food; qty: number; unit: ServingUnit; nutrients: any }[] = [];

    for (const [foodId, mult] of Object.entries(plateCart)) {
      const food = allFeedFoods.find((f) => f.id === foodId);
      if (!food || mult <= 0) continue;
      count++;
      const qty = Math.round((food.defaultServingQuantity || 1) * mult * 10) / 10;
      const unit = (food.defaultServingUnit || food.referenceUnit) as ServingUnit;
      const snap = scaleNutrientValues(food, qty, unit);
      protein += snap.protein || 0;
      calories += snap.calories || 0;
      entries.push({ food, qty, unit, nutrients: snap });
    }

    return {
      count,
      protein: Math.round(protein * 10) / 10,
      calories: Math.round(calories),
      entries,
    };
  }, [plateCart, allFeedFoods]);

  const handleLogEntirePlate = async () => {
    if (plateSummary.entries.length === 0) return;
    for (const e of plateSummary.entries) {
      await saveFoodLogEntry({
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: "default_user",
        foodId: e.food.id,
        foodNameSnapshot: e.food.name,
        servingQuantity: e.qty,
        servingUnit: e.unit,
        nutritionSnapshot: e.nutrients,
        mealType: targetMeal,
        entrySource: "recommendation",
        loggedAt: localDateIso(),
        createdAt: new Date().toISOString(),
      });
    }
    setPlateCart({});
    flash(`🎉 Logged ${plateSummary.count} items (+${plateSummary.protein}g protein) to ${targetMeal}!`);
    await load();
  };

  return (
    <div className="min-h-screen pb-32 md:pb-16 flex flex-col">
      <Navbar onOpenAddModal={() => (window.location.href = "/")} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 pt-5 space-y-5">
        {/* Top Header + Target Meal Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-[#E50914] text-white text-[10px] font-black uppercase tracking-wider">
                CRAVING FEED
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Top Picks • Insta × Swiggy Feed
              </h1>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Scroll 45+ high-protein dishes, adjust portions live, double-tap to ❤️ save, or build a multi-item plate!
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Meal Selector Pill */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs">
              <span className="text-zinc-400 text-[11px]">Logging to:</span>
              <select
                aria-label="Target meal"
                value={targetMeal}
                onChange={(e) => setTargetMeal(e.target.value as MealType)}
                className="bg-transparent text-white font-bold capitalize focus:outline-none"
              >
                {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((m) => (
                  <option key={m} value={m} className="bg-zinc-900 text-white">
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Layout Toggle (Insta Grid vs Swiggy List) */}
            <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setViewLayout("insta")}
                className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition ${
                  viewLayout === "insta" ? "bg-[#E50914] text-white font-bold" : "text-zinc-400 hover:text-white"
                }`}
                title="Insta Feed Cards"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Insta</span>
              </button>
              <button
                type="button"
                onClick={() => setViewLayout("swiggy")}
                className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition ${
                  viewLayout === "swiggy" ? "bg-[#E50914] text-white font-bold" : "text-zinc-400 hover:text-white"
                }`}
                title="Swiggy Menu View"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">Swiggy</span>
              </button>
            </div>

            <button
              onClick={() => setShowExplainer(!showExplainer)}
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
              title="How recommendations work"
            >
              <HelpCircle className="w-4 h-4 text-[#46d369]" />
            </button>
          </div>
        </div>

        {showExplainer && (
          <div className="p-4 rounded-2xl bg-zinc-900/90 border border-[#46d369]/30 text-xs text-zinc-300 space-y-1.5 animate-fadeIn">
            <p className="font-bold text-white flex items-center gap-1.5">
              <Info className="w-4 h-4 text-[#46d369]" /> How This Interactive Feed Works
            </p>
            <p>
              • Every card respects your profile dietary preference (<b className="capitalize">{profile?.dietaryPreference.replace("_", " ")}</b>) and exclusions.
            </p>
            <p>
              • Use the <b>- / +</b> buttons on any dish to scale portions live, or tap <b>ADD +</b> on several dishes to log an entire plate at once!
            </p>
          </div>
        )}

        {/* Compact Live Deficit Status Strip */}
        {gaps && goals && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#18181b] via-[#1c1c21] to-[#18181b] border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#E50914]/15 border border-[#E50914]/30 flex items-center justify-center text-[#E50914]">
                <Zap className="w-4 h-4 fill-[#E50914]" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-white">
                  {gaps.proteinGap > 0
                    ? `You need ${Math.round(gaps.proteinGap * 10) / 10}g more protein today`
                    : "🎉 Daily Protein Target Achieved!"}
                </p>
                <p className="text-[11px] text-zinc-400">
                  Logged {Math.round((totals.protein || 0) * 10) / 10}g / {goals.protein}g protein •{" "}
                  {Math.round(totals.calories || 0)} / {goals.calories} kcal
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <div className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
                Fibre left: <b className="text-[#46d369]">{Math.round(gaps.fibreGap * 10) / 10}g</b>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
                Calorie budget: <b className="text-amber-400">{Math.round(gaps.caloriesGap)} kcal</b>
              </div>
            </div>
          </div>
        )}

        {/* SWIGGY × INSTA STORY BUBBLES ("What's on your mind?") */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
              What&apos;s on your mind today?
            </span>
            <span className="text-[11px] text-zinc-500">{feedItems.length} dishes ready</span>
          </div>

          <div className="flex items-center gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar">
            {STORY_CIRCLES.map((story) => {
              const active = activeStory === story.id;
              return (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => setActiveStory(story.id)}
                  className="flex flex-col items-center gap-1.5 flex-shrink-0 group"
                >
                  <div
                    className={`relative p-[2.5px] rounded-full transition-transform duration-200 group-hover:scale-105 ${
                      active
                        ? "bg-gradient-to-tr from-[#E50914] via-amber-500 to-pink-500 shadow-[0_0_15px_rgba(229,9,20,0.45)] scale-105"
                        : "bg-zinc-700/70 hover:bg-zinc-500"
                    }`}
                  >
                    <div className="w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-full overflow-hidden border-2 border-[#101012] bg-zinc-900">
                      <img
                        src={story.img}
                        alt={story.label}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-black/90 border border-white/15 text-[9px] font-extrabold text-white whitespace-nowrap shadow">
                      {story.badge}
                    </span>
                  </div>
                  <span
                    className={`text-[11px] whitespace-nowrap mt-0.5 ${
                      active ? "font-extrabold text-white" : "font-medium text-zinc-400"
                    }`}
                  >
                    {story.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* SWIGGY SEARCH BAR + FILTER CHIPS */}
        <div className="space-y-2.5 sticky top-14 md:top-16 z-30 py-2 bg-[#101012]/95 backdrop-blur-xl border-b border-zinc-800/80">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for 'Paneer', 'Dosa', 'Eggs', 'Chaat' or type ANY dish to instant-estimate..."
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-2xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#E50914]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {[
              { id: "none", label: "✨ All Dishes" },
              { id: "quick", label: "⚡ 5-Min Ready" },
              { id: "fibre", label: "🌿 High Fibre (4g+)" },
              { id: "light", label: "🪶 Light (<200 kcal)" },
              { id: "iron", label: "💇‍♀️ Hair & Iron Boost" },
              { id: "liked", label: `❤️ Saved (${likedIds.size})` },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setQuickChip(chip.id as any)}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all flex-shrink-0 ${
                  quickChip === chip.id
                    ? "bg-white text-black font-extrabold shadow"
                    : "bg-zinc-900 text-zinc-300 border border-zinc-800 hover:border-zinc-600"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* FEED ITEMS: INSTA POST CARDS OR SWIGGY MENU LIST */}
        {viewLayout === "insta" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {feedItems.map((item, idx) => {
              const posterUrl = getFoodPosterUrl(item.food.name, item.food.category);
              const isLiked = likedIds.has(item.food.name.toLowerCase());
              const inPlateMult = plateCart[item.food.id] || 0;

              return (
                <div
                  key={item.food.id}
                  className="rounded-3xl bg-[#18181b] border border-zinc-800/90 hover:border-[#E50914]/50 overflow-hidden flex flex-col justify-between shadow-xl transition-all group"
                >
                  {/* Insta + Swiggy Visual Header */}
                  <div
                    onDoubleClick={() => handleToggleLike(item.food)}
                    className="relative h-48 w-full overflow-hidden bg-zinc-900 select-none cursor-pointer"
                  >
                    <img
                      src={posterUrl}
                      alt={item.food.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#18181b] via-black/25 to-black/30" />

                    {/* Double-tap Heart Pop Animation */}
                    {heartPopId === item.food.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 animate-fadeIn">
                        <Heart className="w-16 h-16 text-[#E50914] fill-[#E50914] drop-shadow-lg scale-110" />
                      </div>
                    )}

                    {/* Top Left: Veg/Egg/Non-Veg Indian Food Symbol + Rating + Time */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <span
                        className={`w-4 h-4 rounded-sm bg-black/85 border flex items-center justify-center ${
                          item.dietType === "veg"
                            ? "border-emerald-500"
                            : item.dietType === "egg"
                            ? "border-amber-400"
                            : "border-rose-500"
                        }`}
                        title={item.dietType === "veg" ? "Vegetarian" : item.dietType === "egg" ? "Contains Egg" : "Non-Veg"}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            item.dietType === "veg"
                              ? "bg-emerald-500"
                              : item.dietType === "egg"
                              ? "bg-amber-400"
                              : "bg-rose-500"
                          }`}
                        />
                      </span>

                      <span className="px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-extrabold text-emerald-400 flex items-center gap-0.5 border border-emerald-500/30">
                        <Star className="w-2.5 h-2.5 fill-emerald-400" /> {item.rating}
                      </span>

                      <span className="px-2 py-0.5 rounded-md bg-black/75 text-[10px] font-semibold text-zinc-200 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-zinc-400" /> {item.prepMins}
                      </span>
                    </div>

                    {/* Top Right: Insta Like / Bookmark Heart Button */}
                    <button
                      type="button"
                      aria-label={`Save ${item.food.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleLike(item.food);
                      }}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/75 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:scale-110 active:scale-90 transition"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          isLiked ? "fill-[#E50914] text-[#E50914]" : "text-white"
                        }`}
                      />
                    </button>

                    {/* Bottom Overlay: Dish Title & Price */}
                    <div className="absolute bottom-2.5 left-3.5 right-3.5 flex items-end justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#46d369] block">
                          {item.tag}
                        </span>
                        <h3 className="font-black text-base text-white leading-snug drop-shadow">
                          {item.food.name}
                        </h3>
                      </div>
                      <span className="px-2 py-0.5 rounded-lg bg-black/80 border border-zinc-700 text-xs font-extrabold text-amber-300 flex-shrink-0">
                        ~₹{item.price}
                      </span>
                    </div>
                  </div>

                  {/* Card Body: Live Macros & Interactive Portion Stepper */}
                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-2.5">
                      {/* Interactive Portion Stepper */}
                      <div className="flex items-center justify-between bg-zinc-900/90 border border-zinc-800 rounded-xl px-3 py-1.5">
                        <span className="text-xs text-zinc-300 font-semibold">
                          Portion: <b className="text-white">{item.qty} {item.unit}</b>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => adjustMultiplier(item.food.id, -0.5)}
                            className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center"
                            aria-label="Decrease portion"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-extrabold text-[#E50914] min-w-[28px] text-center">
                            {item.mult}×
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustMultiplier(item.food.id, 0.5)}
                            className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center"
                            aria-label="Increase portion"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* 4-Pillar Macro Strip */}
                      <div className="grid grid-cols-4 gap-1.5 text-center">
                        <div className="p-1.5 rounded-xl bg-[#E50914]/10 border border-[#E50914]/25">
                          <span className="block text-xs font-black text-white">{item.protein}g</span>
                          <span className="text-[9px] text-zinc-400">Protein</span>
                        </div>
                        <div className="p-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
                          <span className="block text-xs font-black text-amber-300">{item.calories}</span>
                          <span className="text-[9px] text-zinc-400">kcal</span>
                        </div>
                        <div className="p-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                          <span className="block text-xs font-black text-emerald-300">{item.fibre}g</span>
                          <span className="text-[9px] text-zinc-400">Fibre</span>
                        </div>
                        <div className="p-1.5 rounded-xl bg-sky-500/10 border border-sky-500/25">
                          <span className="block text-xs font-black text-sky-300">
                            {item.nutrients.carbohydrates ?? 0}g
                          </span>
                          <span className="text-[9px] text-zinc-400">Carbs</span>
                        </div>
                      </div>
                    </div>

                    {/* Swiggy ADD + Plate Button & Instant Log Button */}
                    <div className="pt-2 border-t border-zinc-800/80 flex items-center gap-2">
                      {inPlateMult > 0 ? (
                        <div className="flex-1 flex items-center justify-between bg-emerald-500/15 border border-emerald-500/40 rounded-xl px-2.5 py-1.5">
                          <button
                            type="button"
                            onClick={() => togglePlateItem(item.food.id, -0.5)}
                            className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-xs font-extrabold text-emerald-300">
                            {inPlateMult}× in Plate
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePlateItem(item.food.id, 0.5)}
                            className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => togglePlateItem(item.food.id, item.mult)}
                          className="flex-1 py-2 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-emerald-500/40 text-emerald-400 font-extrabold text-xs flex items-center justify-center gap-1 transition active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>ADD TO PLATE</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleQuickLogSingle(item)}
                        className="py-2 px-3.5 rounded-xl bg-[#E50914] hover:bg-[#f40612] text-white font-extrabold text-xs shadow-md shadow-[#E50914]/25 transition active:scale-95"
                      >
                        Log {idx === 0 ? "Now" : ""}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* SWIGGY MENU LIST VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {feedItems.map((item) => {
              const posterUrl = getFoodPosterUrl(item.food.name, item.food.category);
              const inPlateMult = plateCart[item.food.id] || 0;
              return (
                <div
                  key={item.food.id}
                  className="p-4 rounded-3xl bg-[#18181b] border border-zinc-800 flex items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${
                          item.dietType === "veg"
                            ? "border-emerald-500"
                            : item.dietType === "egg"
                            ? "border-amber-400"
                            : "border-rose-500"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.dietType === "veg"
                              ? "bg-emerald-500"
                              : item.dietType === "egg"
                              ? "bg-amber-400"
                              : "bg-rose-500"
                          }`}
                        />
                      </span>
                      <span className="text-[10px] font-extrabold text-amber-400">★ {item.rating}</span>
                      <span className="text-[10px] text-zinc-400">• {item.prepMins}</span>
                    </div>

                    <h3 className="font-extrabold text-sm sm:text-base text-white truncate">{item.food.name}</h3>
                    <p className="text-xs font-bold text-zinc-200">
                      ~₹{item.price} • <span className="text-[#46d369]">{item.protein}g Protein</span> • {item.calories} kcal
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Serving: {item.qty} {item.unit} • Fibre {item.fibre}g • {item.tag}
                    </p>
                  </div>

                  {/* Right Swiggy Image + Overlapping ADD Stepper */}
                  <div className="relative w-28 h-28 flex-shrink-0 mb-2">
                    <img
                      src={posterUrl}
                      alt={item.food.name}
                      className="w-28 h-24 rounded-2xl object-cover border border-white/10"
                    />
                    <div className="absolute -bottom-1 left-2 right-2">
                      {inPlateMult > 0 ? (
                        <div className="bg-emerald-600 text-white rounded-xl py-1 px-2 flex items-center justify-between shadow-lg">
                          <button
                            type="button"
                            onClick={() => togglePlateItem(item.food.id, -0.5)}
                            className="font-black text-xs px-1"
                          >
                            -
                          </button>
                          <span className="text-[11px] font-black">{inPlateMult}×</span>
                          <button
                            type="button"
                            onClick={() => togglePlateItem(item.food.id, 0.5)}
                            className="font-black text-xs px-1"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => togglePlateItem(item.food.id, 1)}
                          className="w-full bg-white hover:bg-zinc-100 text-emerald-700 font-black text-xs py-1.5 rounded-xl shadow-lg border border-emerald-500/30 uppercase tracking-wider"
                        >
                          ADD +
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* SWIGGY-STYLE STICKY BOTTOM PLATE / CART BAR */}
      {plateSummary.count > 0 && (
        <div className="fixed bottom-16 md:bottom-5 left-0 right-0 z-40 px-4 animate-fadeIn">
          <div className="max-w-xl mx-auto p-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 text-white shadow-2xl flex items-center justify-between gap-3 border border-white/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-black/25 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wider">
                  {plateSummary.count} {plateSummary.count === 1 ? "Dish" : "Dishes"} in Your Plate
                </p>
                <p className="text-xs font-semibold text-emerald-50">
                  +{plateSummary.protein}g Protein • {plateSummary.calories} kcal
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPlateCart({})}
                className="px-2.5 py-1.5 rounded-xl bg-black/20 hover:bg-black/30 text-[11px] font-semibold"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleLogEntirePlate}
                className="px-4 py-2 rounded-xl bg-white text-emerald-900 font-black text-xs shadow-lg hover:bg-zinc-100 active:scale-95 transition"
              >
                Log Plate to {targetMeal} →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-28 md:bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-700 text-xs text-white shadow-2xl flex items-center gap-2 animate-fadeIn"
        >
          <CheckCircle2 className="w-4 h-4 text-[#46d369]" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
