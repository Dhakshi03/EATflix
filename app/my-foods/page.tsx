"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Navbar } from "@/components/navigation/Navbar";
import { AddFoodModal } from "@/components/dashboard/AddFoodModal";
import { PhotoScannerModal } from "@/components/ai/PhotoScannerModal";
import {
  Food,
  FoodCombination,
  FoodLogEntry,
  NutrientValues,
  ReferenceServingType,
  ServingUnit,
} from "@/lib/nutrition/types";
import {
  createEmptyNutrients,
  createNutritionSnapshot,
  getAllowedUnitsForFood,
} from "@/lib/nutrition/calculator";
import { expandCombinationToEntries, localDateIso } from "@/lib/nutrition/combination";
import {
  deleteCombination,
  deleteFood,
  getAllCombinations,
  getAllFoods,
  mergeSavedAndCommonFoods,
  saveCombination,
  saveFood,
  saveFoodLogEntry,
  seedStarterDataIfEmpty,
} from "@/lib/storage/indexed-db";
import { STARTER_FOODS } from "@/lib/nutrition/starter-db";
import { getFoodPosterUrl } from "@/lib/nutrition/media";
import { compressFoodPhoto, requestFoodNutritionEstimate } from "@/lib/nutrition/estimator";
import { Archive, ArchiveRestore, BookmarkPlus, Camera, Copy, Layers, Loader2, Pencil, Plus, Search, Sparkles, Trash2, X } from "lucide-react";

const UNITS: ServingUnit[] = ["g", "ml", "piece", "cup", "tbsp", "scoop"];

type NutrientField = { key: keyof NutrientValues; label: string; unit: string };
const NUTRIENT_FIELDS: NutrientField[] = [
  { key: "protein", label: "Protein", unit: "g" },
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "carbohydrates", label: "Carbs", unit: "g" },
  { key: "totalFat", label: "Total fat", unit: "g" },
  { key: "saturatedFat", label: "Saturated fat", unit: "g" },
  { key: "fibre", label: "Fibre", unit: "g" },
  { key: "sugar", label: "Sugar", unit: "g" },
  { key: "sodium", label: "Sodium", unit: "mg" },
  { key: "iron", label: "Iron", unit: "mg" },
  { key: "calcium", label: "Calcium", unit: "mg" },
  { key: "zinc", label: "Zinc", unit: "mg" },
  { key: "vitB12", label: "Vitamin B12", unit: "mcg" },
  { key: "vitD", label: "Vitamin D", unit: "IU" },
  { key: "folate", label: "Folate", unit: "mcg" },
  { key: "healthyFats", label: "Essential fats", unit: "g" },
];

interface FormState {
  id: string | null;
  name: string;
  brand: string;
  category: string;
  referenceType: ReferenceServingType;
  servingQty: string;
  servingUnit: ServingUnit;
  refQty: string; // only for per_serving
  nutrients: Record<string, string>; // "" = unknown
  gramsPerUnit: string;
  mlToGrams: string;
  price: string;
  dataSource: Food["dataSource"];
  verification: Food["verificationStatus"];
}

function blankForm(): FormState {
  return {
    id: null,
    name: "",
    brand: "",
    category: "Custom",
    referenceType: "per_100g",
    servingQty: "100",
    servingUnit: "g",
    refQty: "1",
    nutrients: {},
    gramsPerUnit: "",
    mlToGrams: "",
    price: "",
    dataSource: "user_created",
    verification: "unverified",
  };
}

function formFromFood(f: Food, duplicate = false): FormState {
  const nutrients: Record<string, string> = {};
  for (const k of Object.keys(f.nutrientValues) as (keyof NutrientValues)[]) {
    const v = f.nutrientValues[k];
    nutrients[k] = v === null ? "" : String(v);
  }
  return {
    id: duplicate ? null : f.id,
    name: duplicate ? `${f.name} (copy)` : f.name,
    brand: f.brand ?? "",
    category: f.category,
    referenceType: f.referenceType,
    servingQty: String(f.defaultServingQuantity),
    servingUnit: f.defaultServingUnit,
    refQty: String(f.referenceQuantity),
    nutrients,
    gramsPerUnit: f.densityConversion?.gramsPerUnit ? String(f.densityConversion.gramsPerUnit) : "",
    mlToGrams: f.densityConversion?.mlToGramsRatio ? String(f.densityConversion.mlToGramsRatio) : "",
    price: f.pricePerServing != null ? String(f.pricePerServing) : "",
    // Editing a user food keeps its provenance; duplicating a shared/starter food makes it the user's own.
    dataSource: duplicate && f.dataSource === "starter_verified" ? "user_created" : f.dataSource,
    verification: duplicate && f.dataSource === "starter_verified" ? "unverified" : f.verificationStatus,
  };
}

/** Returns an error message or a Food. Blank nutrient fields stay null (unknown), never 0. */
function buildFood(form: FormState, existing?: Food): Food | string {
  if (!form.name.trim()) return "Name is required.";
  const servingQty = Number(form.servingQty);
  if (!(servingQty > 0)) return "Serving size must be greater than 0.";

  const nutrients = createEmptyNutrients();
  for (const f of NUTRIENT_FIELDS) {
    const raw = (form.nutrients[f.key] ?? "").trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return `${f.label} must be a number, 0 or greater.`;
    nutrients[f.key] = n;
  }

  const refQty = form.referenceType === "per_serving" ? Number(form.refQty) : 100;
  if (!(refQty > 0)) return "Reference quantity must be greater than 0.";
  const refUnit: ServingUnit =
    form.referenceType === "per_100g" ? "g" : form.referenceType === "per_100ml" ? "ml" : form.servingUnit;

  const gpu = form.gramsPerUnit.trim() === "" ? undefined : Number(form.gramsPerUnit);
  const mlg = form.mlToGrams.trim() === "" ? undefined : Number(form.mlToGrams);
  if ((gpu !== undefined && !(gpu > 0)) || (mlg !== undefined && !(mlg > 0))) return "Conversion values must be greater than 0.";
  const price = form.price.trim() === "" ? null : Number(form.price);
  if (price !== null && !(price >= 0)) return "Price cannot be negative.";

  const now = new Date().toISOString();
  return {
    id: existing?.id ?? `food_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ownerUserId: existing?.ownerUserId ?? "default_user",
    name: form.name.trim(),
    brand: form.brand.trim() || null,
    category: form.category.trim() || "Custom",
    referenceType: form.referenceType,
    defaultServingQuantity: servingQty,
    defaultServingUnit: form.servingUnit,
    referenceQuantity: refQty,
    referenceUnit: refUnit,
    nutrientValues: nutrients,
    densityConversion: gpu || mlg ? { gramsPerUnit: gpu, mlToGramsRatio: mlg } : undefined,
    dataSource: form.dataSource,
    verificationStatus: form.verification,
    pricePerServing: price,
    preparationEffort: existing?.preparationEffort,
    isArchived: existing?.isArchived ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export default function MyFoodsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [combos, setCombos] = useState<FoodCombination[]>([]);
  const [viewMode, setViewMode] = useState<"saved" | "common">("saved");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [comboDraft, setComboDraft] = useState<{
    id: string | null;
    name: string;
    search: string;
    items: Record<string, { selected: boolean; qty: string; unit: ServingUnit }>;
    showAddNewFood: boolean;
    newFoodName: string;
    newFoodQty: string;
    newFoodUnit: ServingUnit;
    newFoodProtein: string;
    newFoodCalories: string;
  } | null>(null);
  const [comboError, setComboError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [isEstimatingForm, setIsEstimatingForm] = useState(false);
  const [formEstimateNotice, setFormEstimateNotice] = useState<string | null>(null);
  const [isEstimatingCombo, setIsEstimatingCombo] = useState(false);
  const formPhotoRef = useRef<HTMLInputElement>(null);
  const comboPhotoRef = useRef<HTMLInputElement>(null);

  const handleEstimateForForm = async (imageBase64?: string, fileHintName?: string) => {
    if (!form) return;
    const rawName = form.name.trim() || fileHintName || "";
    if (!rawName && !imageBase64) {
      setFormError("Enter a food name above or select a photo to estimate nutrition.");
      return;
    }
    setIsEstimatingForm(true);
    setFormError(null);
    setFormEstimateNotice(null);
    try {
      const qtyNum = Math.max(0.1, Number(form.servingQty) || 100);
      const est = await requestFoodNutritionEstimate({
        foodName: rawName,
        quantity: qtyNum,
        unit: form.servingUnit,
        referenceType: form.referenceType,
        imageBase64,
      });

      const nextNutrients: Record<string, string> = { ...form.nutrients };
      for (const k of Object.keys(est.nutrients) as (keyof NutrientValues)[]) {
        const val = est.nutrients[k];
        if (val !== null && val !== undefined) {
          nextNutrients[k] = String(val);
        }
      }

      setForm((prev) =>
        prev
          ? {
              ...prev,
              name: prev.name.trim() || est.foodName,
              category: prev.category === "Custom" && est.category ? est.category : prev.category,
              nutrients: nextNutrients,
            }
          : prev
      );
      setFormEstimateNotice(
        `✨ Estimated values filled for ${est.foodName} (${est.nutrients.protein ?? 0}g protein · ${est.nutrients.calories ?? 0} kcal)`
      );
    } finally {
      setIsEstimatingForm(false);
    }
  };

  const handleEstimateForCombo = async (imageBase64?: string, fileHintName?: string) => {
    if (!comboDraft) return;
    const rawName = (comboDraft.newFoodName || comboDraft.search || fileHintName || "").trim();
    if (!rawName && !imageBase64) {
      setComboError("Enter a food name or choose a photo first to estimate.");
      return;
    }
    setIsEstimatingCombo(true);
    setComboError(null);
    try {
      const qtyNum = Math.max(0.1, Number(comboDraft.newFoodQty) || 1);
      const est = await requestFoodNutritionEstimate({
        foodName: rawName,
        quantity: qtyNum,
        unit: comboDraft.newFoodUnit,
        referenceType: "per_serving",
        imageBase64,
      });

      setComboDraft((d) =>
        d
          ? {
              ...d,
              newFoodName: d.newFoodName.trim() || est.foodName,
              newFoodProtein: est.nutrients.protein !== null ? String(est.nutrients.protein) : "",
              newFoodCalories: est.nutrients.calories !== null ? String(est.nutrients.calories) : "",
            }
          : d
      );
      flash(`✨ Estimated ${est.foodName}: ${est.nutrients.protein ?? 0}g protein, ${est.nutrients.calories ?? 0} kcal`);
    } finally {
      setIsEstimatingCombo(false);
    }
  };

  const load = async () => {
    await seedStarterDataIfEmpty();
    const f = await getAllFoods();
    const c = await getAllCombinations();
    setFoods(f);
    setCombos(c);
    if (typeof window !== "undefined" && window.location.search.includes("newCombo=1")) {
      const merged = mergeSavedAndCommonFoods(f);
      const items: Record<string, { selected: boolean; qty: string; unit: ServingUnit }> = {};
      for (const food of merged.filter((x) => !x.isArchived)) {
        items[food.id] = {
          selected: false,
          qty: String(food.defaultServingQuantity),
          unit: food.defaultServingUnit,
        };
      }
      setComboDraft({
        id: null,
        name: "",
        search: "",
        items,
        showAddNewFood: false,
        newFoodName: "",
        newFoodQty: "1",
        newFoodUnit: "piece",
        newFoodProtein: "",
        newFoodCalories: "",
      });
      window.history.replaceState({}, "", "/my-foods");
    }
  };
  useEffect(() => {
    load();
  }, []);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  const allCatalogFoods = useMemo(() => mergeSavedAndCommonFoods(foods), [foods]);
  const savedFoodNames = useMemo(() => new Set(foods.map((f) => f.name.toLowerCase())), [foods]);

  const visible = useMemo(
    () =>
      foods
        .filter((f) => f.isArchived === showArchived)
        .filter((f) => `${f.name} ${f.brand ?? ""} ${f.category}`.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [foods, query, showArchived]
  );

  const visibleCommon = useMemo(
    () =>
      STARTER_FOODS.filter((f) =>
        `${f.name} ${f.brand ?? ""} ${f.category}`.toLowerCase().includes(query.toLowerCase())
      ).sort((a, b) => a.name.localeCompare(b.name)),
    [query]
  );

  const saveCommonFoodToSaved = async (f: Food) => {
    const copy: Food = {
      ...f,
      id: `food_saved_${f.id}`,
      ownerUserId: "default_user",
      dataSource: "user_created",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveFood(copy);
    await load();
    flash(`Saved "${f.name}" to your Saved Foods.`);
  };

  const comboTotals = useMemo(() => {
    if (!comboDraft) return { protein: 0, calories: 0, count: 0 };
    let protein = 0;
    let calories = 0;
    let count = 0;
    for (const [foodId, v] of Object.entries(comboDraft.items)) {
      if (!v.selected) continue;
      const food = allCatalogFoods.find((f) => f.id === foodId);
      if (!food) continue;
      count++;
      const qty = Number(v.qty);
      if (qty > 0) {
        try {
          const snap = createNutritionSnapshot(food, qty, v.unit);
          if (snap.protein !== null) protein += snap.protein;
          if (snap.calories !== null) calories += snap.calories;
        } catch {
          // ignore conversion errors for live summary
        }
      }
    }
    return {
      protein: Math.round(protein * 10) / 10,
      calories: Math.round(calories),
      count,
    };
  }, [comboDraft, allCatalogFoods]);

  const submitForm = async () => {
    if (!form) return;
    const existing = form.id ? foods.find((f) => f.id === form.id) : undefined;
    const result = buildFood(form, existing);
    if (typeof result === "string") {
      setFormError(result);
      return;
    }
    await saveFood(result);
    setForm(null);
    setFormError(null);
    await load();
    flash(existing ? "Food updated. Past log entries are unchanged." : "Food saved.");
  };

  const toggleArchive = async (f: Food) => {
    await saveFood({ ...f, isArchived: !f.isArchived, updatedAt: new Date().toISOString() });
    await load();
  };

  const removeFood = async (f: Food) => {
    const usedIn = combos.filter((c) => c.items.some((i) => i.foodId === f.id));
    const msg = usedIn.length
      ? `"${f.name}" is used in: ${usedIn.map((c) => c.name).join(", ")}. Deleting it will make those combinations skip this item. Past log entries keep their nutrition. Delete anyway?`
      : `Delete "${f.name}"? Past log entries keep their nutrition.`;
    if (!window.confirm(msg)) return;
    await deleteFood(f.id);
    await load();
  };

  const quickLog = async (f: Food) => {
    const entry: FoodLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: "default_user",
      foodId: f.id,
      foodNameSnapshot: f.name,
      servingQuantity: f.defaultServingQuantity,
      servingUnit: f.defaultServingUnit,
      nutritionSnapshot: createNutritionSnapshot(f, f.defaultServingQuantity, f.defaultServingUnit),
      mealType: "snack",
      entrySource: "saved_food",
      loggedAt: localDateIso(),
      createdAt: new Date().toISOString(),
    };
    try {
      await saveFoodLogEntry(entry);
      flash(`Logged ${f.name} as a snack.`);
    } catch {
      flash("Could not log this food.");
    }
  };

  const openComboEditor = (c?: FoodCombination) => {
    const items: Record<string, { selected: boolean; qty: string; unit: ServingUnit }> = {};
    for (const f of allCatalogFoods.filter((x) => !x.isArchived)) {
      const inCombo = c?.items.find((i) => i.foodId === f.id);
      items[f.id] = {
        selected: !!inCombo,
        qty: String(inCombo?.servingQuantity ?? f.defaultServingQuantity),
        unit: inCombo?.servingUnit ?? f.defaultServingUnit,
      };
    }
    setComboDraft({
      id: c?.id ?? null,
      name: c?.name ?? "",
      search: "",
      items,
      showAddNewFood: false,
      newFoodName: "",
      newFoodQty: "100",
      newFoodUnit: "g",
      newFoodProtein: "",
      newFoodCalories: "",
    });
    setComboError(null);
  };

  const handleQuickCreateFoodForCombo = async () => {
    const rawName = (comboDraft?.newFoodName || comboDraft?.search || "").trim();
    if (!comboDraft || !rawName) {
      setComboError("Enter a food name to add.");
      return;
    }
    const qty = Number(comboDraft.newFoodQty);
    if (!(qty > 0)) {
      setComboError("Serving quantity must be greater than 0.");
      return;
    }

    const p = comboDraft.newFoodProtein.trim() === "" ? null : Number(comboDraft.newFoodProtein);
    const c = comboDraft.newFoodCalories.trim() === "" ? null : Number(comboDraft.newFoodCalories);

    const nutrients = createEmptyNutrients();
    nutrients.protein = p;
    nutrients.calories = c;

    const newFood: Food = {
      id: `food_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ownerUserId: "default_user",
      name: rawName,
      brand: null,
      category: "Custom",
      referenceType: "per_serving",
      defaultServingQuantity: qty,
      defaultServingUnit: comboDraft.newFoodUnit,
      referenceQuantity: qty,
      referenceUnit: comboDraft.newFoodUnit,
      nutrientValues: nutrients,
      dataSource: "user_created",
      verificationStatus: "unverified",
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveFood(newFood);
    setFoods((prev) => [...prev, newFood]);
    setComboError(null);

    setComboDraft((d) => {
      if (!d) return null;
      return {
        ...d,
        showAddNewFood: false,
        search: "",
        newFoodName: "",
        newFoodProtein: "",
        newFoodCalories: "",
        items: {
          ...d.items,
          [newFood.id]: {
            selected: true,
            qty: String(qty),
            unit: comboDraft.newFoodUnit,
          },
        },
      };
    });
    flash(`Added "${newFood.name}" to combination.`);
  };

  const submitCombo = async () => {
    if (!comboDraft) return;
    if (!comboDraft.name.trim()) return setComboError("Give the combination a name.");

    let workingItems = { ...comboDraft.items };
    let workingCatalog = [...allCatalogFoods];

    // If the user typed a new food in the inline box and clicked Save Combination directly, create & include it automatically
    if (comboDraft.newFoodName.trim()) {
      const qty = Math.max(0.1, Number(comboDraft.newFoodQty) || 1);
      const p = comboDraft.newFoodProtein.trim() === "" ? null : Number(comboDraft.newFoodProtein);
      const c = comboDraft.newFoodCalories.trim() === "" ? null : Number(comboDraft.newFoodCalories);
      const nutrients = createEmptyNutrients();
      nutrients.protein = p;
      nutrients.calories = c;

      const autoFood: Food = {
        id: `food_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ownerUserId: "default_user",
        name: comboDraft.newFoodName.trim(),
        brand: null,
        category: "Custom",
        referenceType: "per_serving",
        defaultServingQuantity: qty,
        defaultServingUnit: comboDraft.newFoodUnit,
        referenceQuantity: qty,
        referenceUnit: comboDraft.newFoodUnit,
        nutrientValues: nutrients,
        dataSource: "user_created",
        verificationStatus: "unverified",
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveFood(autoFood);
      workingCatalog.push(autoFood);
      workingItems[autoFood.id] = {
        selected: true,
        qty: String(qty),
        unit: comboDraft.newFoodUnit,
      };
    }

    const chosen = Object.entries(workingItems).filter(([, v]) => v.selected);
    if (chosen.length < 1) return setComboError("Select or add at least one food for this combination.");
    const items = [];
    for (const [foodId, v] of chosen) {
      const food = workingCatalog.find((f) => f.id === foodId);
      if (!food) continue;
      const qty = Number(v.qty);
      if (!(qty > 0)) return setComboError(`Quantity for ${food.name} must be greater than 0.`);
      const allowedUnits = getAllowedUnitsForFood(food);
      const safeUnit = allowedUnits.includes(v.unit) ? v.unit : food.defaultServingUnit;
      try {
        createNutritionSnapshot(food, qty, safeUnit);
      } catch (e: any) {
        return setComboError(e.message);
      }
      items.push({ foodId, foodName: food.name, servingQuantity: qty, servingUnit: safeUnit });
    }
    const existing = comboDraft.id ? combos.find((c) => c.id === comboDraft.id) : undefined;
    const now = new Date().toISOString();
    await saveCombination({
      id: existing?.id ?? `combo_${Date.now()}`,
      userId: "default_user",
      name: comboDraft.name.trim(),
      items,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    setComboDraft(null);
    await load();
    flash("Combination saved.");
  };

  const logCombo = async (c: FoodCombination) => {
    const { entries, missingFoods } = expandCombinationToEntries(c, allCatalogFoods, "breakfast", localDateIso());
    for (const e of entries) await saveFoodLogEntry(e);
    flash(
      missingFoods.length
        ? `Logged ${entries.length} items. Skipped missing: ${missingFoods.join(", ")}.`
        : `Logged "${c.name}" to breakfast.`
    );
  };

  const setField = (k: keyof FormState, v: any) => setForm((p) => (p ? { ...p, [k]: v } : p));
  const inputCls = "w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500";

  return (
    <div className="min-h-screen pb-24 md:pb-12 flex flex-col">
      <Navbar onOpenAddModal={() => setAddOpen(true)} />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 pt-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold text-white">My Foods</h1>
          <div className="flex gap-2">
            <button onClick={() => openComboEditor()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-medium">
              <Layers className="w-4 h-4" /> New combination
            </button>
            <button onClick={() => { setForm(blankForm()); setFormError(null); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-500 text-white text-xs font-semibold">
              <Plus className="w-4 h-4" /> New food
            </button>
          </div>
        </div>

        {/* Combinations */}
        <section aria-labelledby="combos-h" className="space-y-2">
          <h2 id="combos-h" className="text-sm font-bold text-gray-300">Combinations</h2>
          {combos.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No combinations yet. Create one, such as &quot;My usual breakfast&quot;, to log several foods in one tap.</p>
          ) : (
            combos.map((c) => (
              <div key={c.id} className="p-3 rounded-2xl glass-card border border-gray-800 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-white">{c.name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {c.items.map((i) => `${i.servingQuantity}${i.servingUnit} ${i.foodName}`).join(" + ")}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => logCombo(c)} className="px-3 py-1.5 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 text-xs font-medium">Log</button>
                  <button aria-label={`Edit ${c.name}`} onClick={() => openComboEditor(c)} className="p-2 text-gray-400 hover:text-white"><Pencil className="w-4 h-4" /></button>
                  <button
                    aria-label={`Delete ${c.name}`}
                    onClick={async () => { if (window.confirm(`Delete combination "${c.name}"?`)) { await deleteCombination(c.id); await load(); } }}
                    className="p-2 text-gray-400 hover:text-rose-400"
                  ><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))
          )}
        </section>

        {/* Foods */}
        <section aria-labelledby="foods-h" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode("saved")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                  viewMode === "saved"
                    ? "bg-brand-500/20 border-brand-500 text-brand-300"
                    : "bg-gray-900 border-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                My Saved Foods ({foods.filter((f) => !f.isArchived).length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode("common")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                  viewMode === "common"
                    ? "bg-brand-500/20 border-brand-500 text-brand-300"
                    : "bg-gray-900 border-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                Common Foods ({STARTER_FOODS.length})
              </button>
            </div>
            {viewMode === "saved" && (
              <button onClick={() => setShowArchived((s) => !s)} className="text-xs text-brand-400 hover:underline">
                {showArchived ? "Show active" : "Show archived"}
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
            <input
              aria-label="Search foods"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                viewMode === "saved"
                  ? "Search your saved foods..."
                  : "Search normal everyday foods (e.g. Egg, Oats, Paneer, Dal, Milk)..."
              }
              className={`${inputCls} pl-9`}
            />
          </div>

          {viewMode === "saved" ? (
            visible.length === 0 ? (
              <div className="p-6 rounded-2xl glass-card border border-gray-800 text-center space-y-2">
                <p className="text-xs text-gray-300 font-medium">
                  {showArchived
                    ? "Nothing archived."
                    : query
                    ? "No saved foods match your search."
                    : "Your Saved Foods list is empty."}
                </p>
                {!showArchived && (
                  <p className="text-[11px] text-gray-500">
                    Foods only appear here when you create them with <b>+ New food</b> or save them from{" "}
                    <button
                      type="button"
                      onClick={() => setViewMode("common")}
                      className="text-brand-400 underline font-medium"
                    >
                      Common Foods
                    </button>
                    .
                  </p>
                )}
              </div>
            ) : (
              <ul className="space-y-2">
                {visible.map((f) => {
                  const p = createNutritionSnapshot(f, f.defaultServingQuantity, f.defaultServingUnit);
                  return (
                    <li
                      key={f.id}
                      className="p-3 rounded-2xl glass-card border border-gray-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={getFoodPosterUrl(f.name, f.category)}
                          alt={f.name}
                          className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-white/10"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm text-white">{f.name}</p>
                            {f.brand && (
                              <span className="text-[10px] text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">
                                {f.brand}
                              </span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 rounded border text-emerald-300 border-emerald-500/30 bg-emerald-500/10">
                              Saved
                            </span>
                          </div>
                          <p className="text-xs text-gray-400">
                            {f.defaultServingQuantity} {f.defaultServingUnit} · {f.category} ·{" "}
                            {p.protein === null ? "protein unknown" : `${p.protein} g protein`}
                            {p.calories === null ? "" : ` · ${p.calories} kcal`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center flex-shrink-0">
                        {!f.isArchived && (
                          <button
                            onClick={() => quickLog(f)}
                            className="px-2.5 py-1.5 mr-1 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 text-xs font-medium"
                          >
                            Log
                          </button>
                        )}
                        <button
                          aria-label={`Edit ${f.name}`}
                          onClick={() => {
                            setForm(formFromFood(f));
                            setFormError(null);
                          }}
                          className="p-2 text-gray-400 hover:text-white"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          aria-label={`Duplicate ${f.name}`}
                          onClick={() => {
                            setForm(formFromFood(f, true));
                            setFormError(null);
                          }}
                          className="p-2 text-gray-400 hover:text-white"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          aria-label={`${f.isArchived ? "Restore" : "Archive"} ${f.name}`}
                          onClick={() => toggleArchive(f)}
                          className="p-2 text-gray-400 hover:text-white"
                        >
                          {f.isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                        </button>
                        <button
                          aria-label={`Delete ${f.name}`}
                          onClick={() => removeFood(f)}
                          className="p-2 text-gray-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <ul className="space-y-2">
              {visibleCommon.map((f) => {
                const p = createNutritionSnapshot(f, f.defaultServingQuantity, f.defaultServingUnit);
                const alreadySaved = savedFoodNames.has(f.name.toLowerCase());
                return (
                  <li
                    key={f.id}
                    className="p-3 rounded-2xl glass-card border border-gray-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={getFoodPosterUrl(f.name, f.category)}
                        alt={f.name}
                        className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-white/10"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm text-white">{f.name}</p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded border text-sky-300 border-sky-500/30 bg-sky-500/10">
                            Common food
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">
                          {f.defaultServingQuantity} {f.defaultServingUnit} · {f.category} ·{" "}
                          {p.protein === null ? "protein unknown" : `${p.protein} g protein`}
                          {p.calories === null ? "" : ` · ${p.calories} kcal`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => quickLog(f)}
                        className="px-2.5 py-1.5 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 text-xs font-medium"
                      >
                        Log
                      </button>
                      {!alreadySaved ? (
                        <button
                          onClick={() => saveCommonFoodToSaved(f)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-gray-200"
                        >
                          <BookmarkPlus className="w-3.5 h-3.5 text-brand-400" />
                          Save
                        </button>
                      ) : (
                        <span className="text-[11px] text-emerald-400 px-2">Saved ✓</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      {toast && <div role="status" className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-gray-800 border border-gray-700 text-xs text-white shadow-xl">{toast}</div>}

      {/* Food form modal */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Food form">
          <div className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl flex flex-col max-h-[92vh]">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{form.id ? "Edit food" : "New food"}</h2>
              <button aria-label="Close" onClick={() => setForm(null)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {form.id && <p className="text-[11px] text-gray-400">Editing changes future logs only. Existing log entries keep the nutrition they were logged with.</p>}
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 text-gray-400">Name *<input className={`${inputCls} mt-1`} value={form.name} onChange={(e) => setField("name", e.target.value)} /></label>
                <label className="text-gray-400">Brand<input className={`${inputCls} mt-1`} value={form.brand} onChange={(e) => setField("brand", e.target.value)} /></label>
                <label className="text-gray-400">Category<input className={`${inputCls} mt-1`} value={form.category} onChange={(e) => setField("category", e.target.value)} /></label>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="text-gray-400">Nutrition entered
                  <select className={`${inputCls} mt-1`} value={form.referenceType} onChange={(e) => setField("referenceType", e.target.value)}>
                    <option value="per_100g">per 100 g</option>
                    <option value="per_100ml">per 100 ml</option>
                    <option value="per_serving">per serving</option>
                  </select>
                </label>
                <label className="text-gray-400">Usual serving
                  <input type="number" min="0" step="any" className={`${inputCls} mt-1`} value={form.servingQty} onChange={(e) => setField("servingQty", e.target.value)} />
                </label>
                <label className="text-gray-400">Unit
                  <select className={`${inputCls} mt-1`} value={form.servingUnit} onChange={(e) => setField("servingUnit", e.target.value)}>
                    {UNITS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </label>
                {form.referenceType === "per_serving" && (
                  <label className="text-gray-400 col-span-3">One serving the values refer to = how many {form.servingUnit}?
                    <input type="number" min="0" step="any" className={`${inputCls} mt-1`} value={form.refQty} onChange={(e) => setField("refQty", e.target.value)} />
                  </label>
                )}
              </div>

              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-brand-500/15 via-purple-500/10 to-accent-cyan/10 border border-brand-500/30 space-y-2.5">
                <div>
                  <p className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                    <span>Don&rsquo;t know the calories or nutrients?</span>
                  </p>
                  <p className="text-[11px] text-gray-300 mt-0.5">
                    Auto-estimate all nutrition fields from the food name above or from a photo.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isEstimatingForm || !form.name.trim()}
                    onClick={() => handleEstimateForForm()}
                    className="flex-1 min-w-[140px] py-2 px-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition"
                  >
                    {isEstimatingForm ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>{isEstimatingForm ? "Estimating..." : "✨ Estimate from Name"}</span>
                  </button>

                  <input
                    ref={formPhotoRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        setIsEstimatingForm(true);
                        const compressed = await compressFoodPhoto(file);
                        const cleaned = file.name
                          .replace(/\.[^/.]+$/, "")
                          .replace(/[_-]+/g, " ")
                          .replace(/^(img|dsc|photo|image|screenshot|whatsapp image)\s*\d*/i, "")
                          .trim();
                        await handleEstimateForForm(compressed, cleaned);
                      } finally {
                        if (formPhotoRef.current) formPhotoRef.current.value = "";
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={isEstimatingForm}
                    onClick={() => formPhotoRef.current?.click()}
                    className="flex-1 min-w-[140px] py-2 px-3 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Camera className="w-3.5 h-3.5 text-accent-cyan" />
                    <span>📷 Estimate from Photo</span>
                  </button>
                </div>
                {formEstimateNotice && (
                  <p className="text-[11px] text-emerald-300 font-medium bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2.5 py-1.5">
                    {formEstimateNotice}
                  </p>
                )}
              </div>

              <fieldset className="p-3 rounded-2xl bg-gray-800/40 border border-gray-700/60 space-y-2">
                <legend className="px-1 text-[11px] font-semibold text-gray-300">Nutrients. Leave blank if unknown; blank is never treated as 0.</legend>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {NUTRIENT_FIELDS.map((n) => (
                    <label key={n.key} className="text-[10px] text-gray-400">{n.label} ({n.unit})
                      <input type="number" min="0" step="any" placeholder="unknown" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs mt-0.5"
                        value={form.nutrients[n.key] ?? ""}
                        onChange={(e) => setForm((p) => (p ? { ...p, nutrients: { ...p.nutrients, [n.key]: e.target.value } } : p))} />
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="p-3 rounded-2xl bg-gray-800/40 border border-gray-700/60 space-y-2">
                <legend className="px-1 text-[11px] font-semibold text-gray-300">Conversions (optional). Only units you define can be converted.</legend>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] text-gray-400">Grams per piece / scoop / tbsp / cup (matching the unit above)
                    <input type="number" min="0" step="any" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs mt-0.5" value={form.gramsPerUnit} onChange={(e) => setField("gramsPerUnit", e.target.value)} />
                  </label>
                  <label className="text-[10px] text-gray-400">Grams per 1 ml (density)
                    <input type="number" min="0" step="any" className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs mt-0.5" value={form.mlToGrams} onChange={(e) => setField("mlToGrams", e.target.value)} />
                  </label>
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-gray-400">Price per serving (optional)<input type="number" min="0" step="any" className={`${inputCls} mt-1`} value={form.price} onChange={(e) => setField("price", e.target.value)} /></label>
                <label className="text-gray-400">Verification
                  <select className={`${inputCls} mt-1`} value={form.verification} onChange={(e) => setField("verification", e.target.value)}>
                    <option value="unverified">Unverified (my own entry)</option>
                    <option value="verified">Verified from a label</option>
                  </select>
                </label>
              </div>
              {formError && <p role="alert" className="text-rose-400">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setForm(null)} className="px-4 py-2 text-xs text-gray-400 hover:text-white">Cancel</button>
              <button onClick={submitForm} className="px-5 py-2.5 rounded-xl bg-brand-500 text-white text-xs font-semibold">Save food</button>
            </div>
          </div>
        </div>
      )}

      {/* Combination modal */}
      {comboDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Combination editor">
          <div className="w-full max-w-lg bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl flex flex-col max-h-[92vh]">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{comboDraft.id ? "Edit combination" : "New combination"}</h2>
              <button aria-label="Close" onClick={() => setComboDraft(null)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div>
                <label className="text-gray-300 font-semibold block mb-1">Combination Name *</label>
                <input
                  className={`${inputCls}`}
                  placeholder="e.g. My Usual Breakfast, Post-Workout Shake"
                  value={comboDraft.name}
                  onChange={(e) => setComboDraft((d) => d && { ...d, name: e.target.value })}
                />
              </div>

              {/* Action: Add New Custom Food Inline & Live Summary */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-500/15 via-brand-500/10 to-transparent border border-purple-500/30 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-gray-400 font-medium">Combination Total ({comboTotals.count} items)</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-sm font-bold text-brand-400">{comboTotals.protein}g protein</span>
                    <span className="text-xs text-amber-300 font-semibold">{comboTotals.calories} kcal</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setComboDraft((d) => d && { ...d, showAddNewFood: !d.showAddNewFood })
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold hover:bg-purple-500/30 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{comboDraft.showAddNewFood ? "Cancel" : "+ Add Any New Food"}</span>
                </button>
              </div>

              {/* Inline Custom Food Creation Form */}
              {comboDraft.showAddNewFood && (
                <div className="p-4 rounded-2xl bg-gray-800/90 border border-purple-500/40 space-y-3 animate-fadeIn">
                  <p className="text-xs font-bold text-purple-300">Create new food for this combination:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400">Food Name *</label>
                      <input
                        placeholder="e.g. Peanut Butter"
                        value={comboDraft.newFoodName}
                        onChange={(e) =>
                          setComboDraft((d) => d && { ...d, newFoodName: e.target.value })
                        }
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[10px] text-gray-400">Portion Qty *</label>
                        <input
                          type="number"
                          min="0.1"
                          step="any"
                          value={comboDraft.newFoodQty}
                          onChange={(e) =>
                            setComboDraft((d) => d && { ...d, newFoodQty: e.target.value })
                          }
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400">Unit</label>
                        <select
                          value={comboDraft.newFoodUnit}
                          onChange={(e) =>
                            setComboDraft(
                              (d) => d && { ...d, newFoodUnit: e.target.value as ServingUnit }
                            )
                          }
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-1 py-1.5 text-white text-xs"
                        >
                          {UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isEstimatingCombo || !comboDraft.newFoodName.trim()}
                      onClick={() => handleEstimateForCombo()}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-brand-500/20 hover:bg-brand-500/30 border border-brand-500/40 text-brand-300 font-semibold text-[11px] flex items-center justify-center gap-1 disabled:opacity-40"
                    >
                      {isEstimatingCombo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      <span>✨ Estimate from Name</span>
                    </button>
                    <input
                      ref={comboPhotoRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          setIsEstimatingCombo(true);
                          const compressed = await compressFoodPhoto(file);
                          const cleaned = file.name
                            .replace(/\.[^/.]+$/, "")
                            .replace(/[_-]+/g, " ")
                            .replace(/^(img|dsc|photo|image|screenshot|whatsapp image)\s*\d*/i, "")
                            .trim();
                          await handleEstimateForCombo(compressed, cleaned);
                        } finally {
                          if (comboPhotoRef.current) comboPhotoRef.current.value = "";
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={isEstimatingCombo}
                      onClick={() => comboPhotoRef.current?.click()}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-200 font-semibold text-[11px] flex items-center justify-center gap-1"
                    >
                      <Camera className="w-3 h-3 text-accent-cyan" />
                      <span>📷 Estimate from Photo</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-brand-400">Protein (g)</label>
                      <input
                        type="number"
                        placeholder="e.g. 8"
                        value={comboDraft.newFoodProtein}
                        onChange={(e) =>
                          setComboDraft((d) => d && { ...d, newFoodProtein: e.target.value })
                        }
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-amber-400">Calories (kcal)</label>
                      <input
                        type="number"
                        placeholder="e.g. 180"
                        value={comboDraft.newFoodCalories}
                        onChange={(e) =>
                          setComboDraft((d) => d && { ...d, newFoodCalories: e.target.value })
                        }
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleQuickCreateFoodForCombo}
                    className="w-full py-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
                  >
                    + Add to Combination & Save to Library
                  </button>
                </div>
              )}

              {/* Search Bar for existing foods */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-500" />
                <input
                  placeholder="Search foods in library or type a new food name..."
                  value={comboDraft.search}
                  onChange={(e) => {
                    const val = e.target.value;
                    setComboDraft((d) => d && { ...d, search: val });
                  }}
                  className="w-full bg-gray-800/80 border border-gray-700 rounded-xl pl-8 pr-3 py-1.5 text-white text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Foods Checklist */}
              {(() => {
                const filtered = allCatalogFoods
                  .filter((f) => !f.isArchived)
                  .filter((f) =>
                    `${f.name} ${f.category} ${f.brand ?? ""}`
                      .toLowerCase()
                      .includes((comboDraft.search || "").toLowerCase())
                  );

                if (filtered.length === 0) {
                  return (
                    <div className="p-4 rounded-2xl border border-dashed border-purple-500/40 bg-purple-500/10 space-y-3">
                      <p className="text-xs font-semibold text-white">
                        &ldquo;{comboDraft.search}&rdquo; is not in the normal foods list yet — add it right here:
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left">
                        <div>
                          <label className="text-[10px] text-gray-300">Portion Qty</label>
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={comboDraft.newFoodQty}
                            onChange={(e) =>
                              setComboDraft((d) => d && { ...d, newFoodQty: e.target.value })
                            }
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs font-semibold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-300">Unit</label>
                          <select
                            value={comboDraft.newFoodUnit}
                            onChange={(e) =>
                              setComboDraft(
                                (d) => d && { ...d, newFoodUnit: e.target.value as ServingUnit }
                              )
                            }
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-1 py-1.5 text-white text-xs"
                          >
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-brand-400">Protein (g, optional)</label>
                          <input
                            type="number"
                            placeholder="e.g. 8"
                            value={comboDraft.newFoodProtein}
                            onChange={(e) =>
                              setComboDraft((d) => d && { ...d, newFoodProtein: e.target.value })
                            }
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-amber-400">Calories (optional)</label>
                          <input
                            type="number"
                            placeholder="e.g. 180"
                            value={comboDraft.newFoodCalories}
                            onChange={(e) =>
                              setComboDraft((d) => d && { ...d, newFoodCalories: e.target.value })
                            }
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isEstimatingCombo}
                          onClick={() => handleEstimateForCombo()}
                          className="flex-1 py-1.5 px-2.5 rounded-lg bg-brand-500/20 hover:bg-brand-500/30 border border-brand-500/40 text-brand-300 font-semibold text-[11px] flex items-center justify-center gap-1"
                        >
                          {isEstimatingCombo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          <span>✨ Estimate Protein &amp; Calories for &ldquo;{comboDraft.search}&rdquo;</span>
                        </button>
                        <button
                          type="button"
                          disabled={isEstimatingCombo}
                          onClick={() => comboPhotoRef.current?.click()}
                          className="py-1.5 px-2.5 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-200 font-semibold text-[11px] flex items-center justify-center gap-1"
                        >
                          <Camera className="w-3 h-3 text-accent-cyan" />
                          <span>📷 From Photo</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleQuickCreateFoodForCombo}
                        className="w-full py-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold shadow-md transition-all"
                      >
                        + Add &ldquo;{comboDraft.search}&rdquo; to Combination
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {filtered
                        .sort((a, b) => {
                          const aSel = comboDraft.items[a.id]?.selected ? 1 : 0;
                          const bSel = comboDraft.items[b.id]?.selected ? 1 : 0;
                          return bSel - aSel || a.name.localeCompare(b.name);
                        })
                        .map((f) => {
                          const it = comboDraft.items[f.id] || {
                            selected: false,
                            qty: String(f.defaultServingQuantity),
                            unit: f.defaultServingUnit,
                          };
                          const allowedUnits = getAllowedUnitsForFood(f);
                          const patch = (p: Partial<typeof it>) =>
                            setComboDraft(
                              (d) =>
                                d && {
                                  ...d,
                                  items: {
                                    ...d.items,
                                    [f.id]: {
                                      ...(d.items[f.id] || {
                                        selected: false,
                                        qty: String(f.defaultServingQuantity),
                                        unit: f.defaultServingUnit,
                                      }),
                                      ...p,
                                    },
                                  },
                                }
                            );

                          return (
                            <li
                              key={f.id}
                              className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all ${
                                it.selected
                                  ? "border-brand-500/50 bg-brand-500/10"
                                  : "border-gray-800 bg-gray-800/30 hover:bg-gray-800/50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                aria-label={`Include ${f.name}`}
                                checked={it.selected}
                                onChange={(e) => patch({ selected: e.target.checked })}
                                className="rounded border-gray-700 bg-gray-800 text-brand-500"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-medium truncate">{f.name}</p>
                                <p className="text-[10px] text-gray-400">
                                  {f.nutrientValues.protein !== null
                                    ? `${f.nutrientValues.protein}g protein`
                                    : "protein unknown"}{" "}
                                  • {f.category}
                                </p>
                              </div>
                              <input
                                aria-label={`${f.name} quantity`}
                                type="number"
                                min="0.1"
                                step="any"
                                disabled={!it.selected}
                                value={it.qty}
                                onChange={(e) => patch({ qty: e.target.value })}
                                className="w-16 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-white disabled:opacity-40 text-xs font-semibold"
                              />
                              <select
                                aria-label={`${f.name} unit`}
                                disabled={!it.selected}
                                value={it.unit}
                                onChange={(e) => patch({ unit: e.target.value as ServingUnit })}
                                className="bg-gray-900 border border-gray-700 rounded-lg px-1 py-1 text-white disabled:opacity-40 text-xs"
                              >
                                {allowedUnits.map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                              </select>
                            </li>
                          );
                        })}
                    </ul>
                    {comboDraft.search.trim() && (
                      <div className="p-2.5 rounded-xl border border-dashed border-purple-500/40 bg-purple-500/10 flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-300">
                          Don&rsquo;t see exact match for <b>&ldquo;{comboDraft.search.trim()}&rdquo;</b>?
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setComboDraft(
                              (d) =>
                                d && {
                                  ...d,
                                  showAddNewFood: true,
                                  newFoodName: d.search.trim(),
                                }
                            )
                          }
                          className="px-3 py-1 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold"
                        >
                          + Add &ldquo;{comboDraft.search.trim()}&rdquo;
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
              {comboError && <p role="alert" className="text-rose-400">{comboError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setComboDraft(null)} className="px-4 py-2 text-xs text-gray-400 hover:text-white">Cancel</button>
              <button onClick={submitCombo} className="px-5 py-2.5 rounded-xl bg-brand-500 text-white text-xs font-semibold">Save combination</button>
            </div>
          </div>
        </div>
      )}

      <AddFoodModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        foods={foods}
        combinations={combos}
        onLogEntry={async (e) => {
          await saveFoodLogEntry({ ...e, id: `log_${Date.now()}`, userId: "default_user", loggedAt: localDateIso(), createdAt: new Date().toISOString() } as FoodLogEntry);
          flash("Logged.");
        }}
        onLogCombination={async (c, meal) => {
          const { entries } = expandCombinationToEntries(c, allCatalogFoods, meal, localDateIso());
          for (const en of entries) await saveFoodLogEntry(en);
          flash("Logged.");
        }}
        onSaveCustomFood={async (f) => { await saveFood(f); await load(); return f; }}
        onOpenAIScan={() => setScanOpen(true)}
      />
      <PhotoScannerModal
        isOpen={scanOpen}
        foods={allCatalogFoods}
        onClose={() => setScanOpen(false)}
        onConfirmLog={async (entries) => {
          for (const e of entries) await saveFoodLogEntry({ ...e, id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, userId: "default_user" } as FoodLogEntry);
          flash("Logged.");
        }}
      />
    </div>
  );
}
