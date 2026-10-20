"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { X, Search, Plus, Layers, Camera, BookmarkPlus, Sparkles, Loader2 } from "lucide-react";
import { Food, FoodCombination, FoodLogEntry, MealType, ServingUnit, NutrientValues } from "@/lib/nutrition/types";
import {
  createNutritionSnapshot,
  getAllowedUnitsForFood,
  scaleNutrientValues,
} from "@/lib/nutrition/calculator";
import { STARTER_FOODS } from "@/lib/nutrition/starter-db";
import { compressFoodPhoto, requestFoodNutritionEstimate } from "@/lib/nutrition/estimator";

interface AddFoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  foods: Food[];
  combinations: FoodCombination[];
  initialMeal?: MealType;
  onLogEntry: (entry: Partial<FoodLogEntry>) => void;
  onLogCombination: (combo: FoodCombination, mealType: MealType) => void;
  onSaveCustomFood: (food: Food) => Promise<Food>;
  onOpenAIScan: () => void;
}

export function AddFoodModal({
  isOpen,
  onClose,
  foods,
  combinations,
  initialMeal,
  onLogEntry,
  onLogCombination,
  onSaveCustomFood,
  onOpenAIScan,
}: AddFoodModalProps) {
  const [activeTab, setActiveTab] = useState<"common" | "saved" | "combinations" | "custom">("common");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMeal, setSelectedMeal] = useState<MealType>(initialMeal || "breakfast");
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (initialMeal) {
      setSelectedMeal(initialMeal);
    }
  }, [initialMeal, isOpen]);

  // Selected library item state
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [portionQty, setPortionQty] = useState<number>(1);
  const [portionUnit, setPortionUnit] = useState<ServingUnit>("g");

  // Custom manual entry state
  const [customName, setCustomName] = useState("");
  const [customBrand, setCustomBrand] = useState("");
  const [customCategory, setCustomCategory] = useState("Custom");
  const [customQty, setCustomQty] = useState<string>("1");
  const [customUnit, setCustomUnit] = useState<ServingUnit>("piece");
  const [customRefType, setCustomRefType] = useState<"per_serving" | "per_100g" | "per_100ml">("per_serving");
  const [customProtein, setCustomProtein] = useState<string>("");
  const [customCalories, setCustomCalories] = useState<string>("");
  const [customCarbs, setCustomCarbs] = useState<string>("");
  const [customFat, setCustomFat] = useState<string>("");
  const [customFibre, setCustomFibre] = useState<string>("");
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateBanner, setEstimateBanner] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleEstimateCustomFood = async (imageBase64?: string, fileHintName?: string) => {
    const nameToEstimate = customName.trim() || fileHintName || "";
    if (!nameToEstimate && !imageBase64) {
      setEstimateBanner("Enter a food name above or pick a photo first to estimate nutrition.");
      return;
    }

    setIsEstimating(true);
    setEstimateBanner(null);
    try {
      const qtyNum = Math.max(0.1, Number(customQty) || 1);
      const effectiveUnit: ServingUnit =
        customRefType === "per_100g" ? "g" : customRefType === "per_100ml" ? "ml" : customUnit;

      const est = await requestFoodNutritionEstimate({
        foodName: nameToEstimate,
        quantity: qtyNum,
        unit: effectiveUnit,
        referenceType: customRefType,
        imageBase64,
      });

      if (!customName.trim() && est.foodName) {
        setCustomName(est.foodName);
      }
      if (est.category) {
        setCustomCategory(est.category);
      }
      if (!customQty || customQty === "1") {
        setCustomQty(String(est.suggestedQuantity));
      }
      if (customRefType === "per_serving" && est.suggestedUnit) {
        setCustomUnit(est.suggestedUnit);
      }

      const n = est.nutrients;
      setCustomProtein(n.protein !== null ? String(n.protein) : "");
      setCustomCalories(n.calories !== null ? String(n.calories) : "");
      setCustomCarbs(n.carbohydrates !== null ? String(n.carbohydrates) : "");
      setCustomFat(n.totalFat !== null ? String(n.totalFat) : "");
      setCustomFibre(n.fibre !== null ? String(n.fibre) : "");

      setEstimateBanner(
        `✨ Estimated for ${est.suggestedQuantity} ${est.suggestedUnit} ${est.foodName}: ${n.protein ?? 0}g protein · ${n.calories ?? 0} kcal`
      );
    } finally {
      setIsEstimating(false);
    }
  };

  const handlePhotoSelectedForEstimate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsEstimating(true);
      const compressed = await compressFoodPhoto(file);
      setPhotoPreviewUrl(compressed);
      const cleanedFileName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[_-]+/g, " ")
        .replace(/^(img|dsc|photo|image|screenshot|whatsapp image)\s*\d*/i, "")
        .trim();
      await handleEstimateCustomFood(compressed, cleanedFileName);
    } catch {
      setIsEstimating(false);
      setEstimateBanner("Could not read that photo. Try estimating from the food name instead.");
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const activeSavedFoods = foods.filter((f) => !f.isArchived);
  const savedFoodNames = new Set(activeSavedFoods.map((f) => f.name.toLowerCase()));

  const sourceList = activeTab === "saved" ? activeSavedFoods : STARTER_FOODS;
  const filteredFoods = sourceList.filter(
    (f) =>
      !f.isArchived &&
      (f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.brand && f.brand.toLowerCase().includes(searchQuery.toLowerCase())) ||
        f.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const openCustomTabWithQuery = (prefillName?: string) => {
    const nameToUse = (prefillName ?? searchQuery).trim();
    if (nameToUse) {
      setCustomName(nameToUse);
    }
    setSelectedFood(null);
    setActiveTab("custom");
  };

  const handleSaveCommonToLibrary = async (food: Food, e: React.MouseEvent) => {
    e.stopPropagation();
    const userCopy: Food = {
      ...food,
      id: `food_saved_${food.id}`,
      ownerUserId: "default_user",
      dataSource: "user_created",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await onSaveCustomFood(userCopy);
    setSavedNotice(`Saved "${food.name}" to My Foods!`);
    setTimeout(() => setSavedNotice(null), 2200);
  };

  const handleSelectFood = (food: Food) => {
    setSelectedFood(food);
    setPortionQty(food.defaultServingQuantity || 1);
    setPortionUnit(food.defaultServingUnit || food.referenceUnit);
  };

  const handleLogSelectedFood = () => {
    if (!selectedFood) return;
    const allowedUnits = getAllowedUnitsForFood(selectedFood);
    const safeUnit = allowedUnits.includes(portionUnit) ? portionUnit : selectedFood.defaultServingUnit;
    const snapshot = createNutritionSnapshot(selectedFood, portionQty, safeUnit);
    const todayIso = new Date().toISOString().split("T")[0];

    onLogEntry({
      foodId: selectedFood.id,
      foodNameSnapshot: selectedFood.name,
      servingQuantity: portionQty,
      servingUnit: safeUnit,
      nutritionSnapshot: snapshot,
      mealType: selectedMeal,
      entrySource: "saved_food",
      loggedAt: todayIso,
      createdAt: new Date().toISOString(),
    });

    setSelectedFood(null);
    onClose();
  };

  const handleSaveAndLogCustom = async (overrideName?: string) => {
    const finalName = (overrideName ?? customName).trim();
    if (!finalName) return;

    const qtyNum = Math.max(0.1, Number(customQty) || 1);
    const effectiveUnit: ServingUnit =
      customRefType === "per_100g" ? "g" : customRefType === "per_100ml" ? "ml" : customUnit;

    const parseNutrient = (val: string): number | null => {
      const trimmed = val.trim();
      if (trimmed === "") return null;
      const num = Number(trimmed);
      return isNaN(num) ? null : Math.max(0, num);
    };

    const nutrients: NutrientValues = {
      protein: parseNutrient(customProtein),
      calories: parseNutrient(customCalories),
      carbohydrates: parseNutrient(customCarbs),
      totalFat: parseNutrient(customFat),
      saturatedFat: null,
      fibre: parseNutrient(customFibre),
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

    const newFood: Food = {
      id: `food_custom_${Date.now()}`,
      ownerUserId: "default_user",
      name: finalName,
      brand: customBrand.trim() || null,
      category: customCategory,
      referenceType: customRefType,
      defaultServingQuantity: qtyNum,
      defaultServingUnit: effectiveUnit,
      referenceQuantity: customRefType === "per_100g" || customRefType === "per_100ml" ? 100 : qtyNum,
      referenceUnit: effectiveUnit,
      nutrientValues: nutrients,
      dataSource: "user_created",
      verificationStatus: "unverified",
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (saveToLibrary) {
      await onSaveCustomFood(newFood);
    }

    const snapshot = scaleNutrientValues(newFood, qtyNum, effectiveUnit);

    const todayIso = new Date().toISOString().split("T")[0];
    onLogEntry({
      foodId: saveToLibrary ? newFood.id : null,
      foodNameSnapshot: newFood.name,
      servingQuantity: qtyNum,
      servingUnit: effectiveUnit,
      nutritionSnapshot: snapshot,
      mealType: selectedMeal,
      entrySource: "manual",
      loggedAt: todayIso,
      createdAt: new Date().toISOString(),
    });

    setCustomName("");
    setCustomProtein("");
    setCustomCalories("");
    setCustomCarbs("");
    setCustomFat("");
    setCustomFibre("");
    setSearchQuery("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-[#141417] border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[90vh]">
        {/* Mobile sheet handle */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
          <span className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <h2 className="text-base sm:text-lg font-extrabold text-white">Log Food</h2>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Meal Selector & Action Tabs */}
        <div className="p-4 border-b border-gray-800 bg-gray-900/30 space-y-3">
          <div className="flex gap-2 bg-gray-800/60 p-1 rounded-xl">
            {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((m) => (
              <button
                key={m}
                onClick={() => setSelectedMeal(m)}
                className={`flex-1 py-1.5 rounded-lg text-xs capitalize font-medium transition-all ${
                  selectedMeal === m
                    ? "bg-brand-500 text-white font-semibold shadow-md shadow-brand-500/20"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => {
                  setActiveTab("common");
                  setSelectedFood(null);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === "common" ? "bg-gray-800 text-brand-400 border border-brand-500/30" : "text-gray-400"
                }`}
              >
                Common Foods
              </button>
              <button
                onClick={() => {
                  setActiveTab("saved");
                  setSelectedFood(null);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === "saved" ? "bg-gray-800 text-brand-400 border border-brand-500/30" : "text-gray-400"
                }`}
              >
                My Saved ({activeSavedFoods.length})
              </button>
              <button
                onClick={() => setActiveTab("combinations")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === "combinations" ? "bg-gray-800 text-brand-400 border border-brand-500/30" : "text-gray-400"
                }`}
              >
                Combos ({combinations.length})
              </button>
              <button
                onClick={() => openCustomTabWithQuery()}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === "custom" ? "bg-gray-800 text-brand-400 border border-brand-500/30" : "text-gray-400"
                }`}
              >
                + Custom Food
              </button>
            </div>

            <button
              onClick={() => {
                onClose();
                onOpenAIScan();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-cyan/10 hover:bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 text-xs font-medium"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>AI Scan</span>
            </button>
          </div>
        </div>

        {/* Modal Tab Contents */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {savedNotice && (
            <div className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 font-medium">
              {savedNotice}
            </div>
          )}

          {(activeTab === "common" || activeTab === "saved") && (
            <>
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
                <input
                  type="text"
                  placeholder={
                    activeTab === "common"
                      ? "Search normal foods or type any food to add..."
                      : "Search your saved foods or type any food to add..."
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-800/60 border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Food List */}
              {activeTab === "saved" && activeSavedFoods.length === 0 && !searchQuery.trim() ? (
                <div className="text-center py-6 text-gray-400 text-xs space-y-3">
                  <p className="font-medium text-gray-300">Your Saved Foods list is empty.</p>
                  <p className="text-[11px] text-gray-500">
                    Pick any item from <b>Common Foods</b> and tap <b>Save</b>, or add any food not in the list with{" "}
                    <b>+ Custom Food</b>.
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab("common")}
                      className="px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 text-xs font-semibold"
                    >
                      Browse Common Foods
                    </button>
                    <button
                      type="button"
                      onClick={() => openCustomTabWithQuery()}
                      className="px-3.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold"
                    >
                      + Add Custom Food
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {filteredFoods.map((food) => {
                    const isSelected = selectedFood?.id === food.id;
                    const protein = food.nutrientValues.protein;
                    const calories = food.nutrientValues.calories;
                    const alreadySaved = savedFoodNames.has(food.name.toLowerCase());

                    return (
                      <div
                        key={food.id}
                        onClick={() => handleSelectFood(food)}
                        className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                          isSelected
                            ? "bg-brand-500/15 border-brand-500 text-white"
                            : "bg-gray-800/40 border-gray-700/60 hover:bg-gray-800 hover:border-gray-600"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm text-white">{food.name}</p>
                            {food.brand && (
                              <span className="text-[10px] text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">
                                {food.brand}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {food.defaultServingQuantity} {food.defaultServingUnit} • {food.category}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-xs font-bold text-brand-400">
                              {protein !== null ? `${protein}g protein` : "Unknown protein"}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {calories !== null ? `${calories} kcal` : "Unknown kcal"}
                            </p>
                          </div>
                          {activeTab === "common" && !alreadySaved && (
                            <button
                              type="button"
                              title="Save to My Foods"
                              onClick={(e) => handleSaveCommonToLibrary(food, e)}
                              className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-brand-300 text-[10px] flex items-center gap-1"
                            >
                              <BookmarkPlus className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Save</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Always allow adding a food that is not in the normal foods list */}
                  <div className="p-3.5 rounded-2xl border border-dashed border-brand-500/40 bg-brand-500/10 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs">
                      <p className="font-bold text-white">
                        {searchQuery.trim()
                          ? `"${searchQuery.trim()}" not in ${activeTab === "common" ? "Common Foods" : "My Saved"}?`
                          : "Food not in the list of normal foods?"}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        Add any custom dish, home-cooked meal, or snack and log it right now.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCustomTabWithQuery(searchQuery)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-md"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {searchQuery.trim() ? `Add "${searchQuery.trim()}"` : "+ Add Custom Food"}
                    </button>
                  </div>
                </div>
              )}

              {/* Portion adjustment drawer when item selected */}
              {selectedFood && (
                <div className="p-4 rounded-2xl bg-gray-800/80 border border-brand-500/40 space-y-3 animate-fadeIn">
                  <p className="text-xs font-semibold text-gray-300">Adjust Portion for logging</p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-gray-400 text-[10px]">Quantity</label>
                      <input
                        type="number"
                        min="0.1"
                        step="any"
                        value={portionQty}
                        onChange={(e) => setPortionQty(Math.max(0.1, Number(e.target.value)))}
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-white font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 text-[10px]">Unit</label>
                      <select
                        value={portionUnit}
                        onChange={(e) => setPortionUnit(e.target.value as ServingUnit)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-white"
                      >
                        {getAllowedUnitsForFood(selectedFood).map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleLogSelectedFood}
                    className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-xs shadow-lg shadow-brand-500/20"
                  >
                    Confirm &amp; Add {selectedFood.name}
                  </button>
                </div>
              )}
            </>
          )}

          {activeTab === "combinations" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">Log a saved multi-item meal combination in one tap.</p>
                <Link
                  href="/my-foods?newCombo=1"
                  onClick={onClose}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 border border-brand-500/30 text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create New Combo
                </Link>
              </div>
              {combinations.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs space-y-3">
                  <Layers className="w-8 h-8 mx-auto opacity-50" />
                  <p>No saved food combinations yet.</p>
                  <p className="text-[11px] text-gray-500">
                    Combine normal foods and your own custom foods into a 1-tap meal combo!
                  </p>
                  <Link
                    href="/my-foods?newCombo=1"
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create Your First Combo
                  </Link>
                </div>
              ) : (
                combinations.map((combo) => (
                  <div
                    key={combo.id}
                    className="p-4 rounded-2xl bg-gray-800/40 border border-gray-700/60 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-semibold text-sm text-white">{combo.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {combo.items.map((i) => `${i.servingQuantity}${i.servingUnit} ${i.foodName}`).join(" + ")}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        onLogCombination(combo, selectedMeal);
                        onClose();
                      }}
                      className="px-3 py-1.5 rounded-xl bg-brand-500/20 hover:bg-brand-500/30 text-brand-400 border border-brand-500/30 text-xs font-medium"
                    >
                      Log Meal
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "custom" && (
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-gray-300 font-semibold">Food Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Masala Dosa, Home Sambar, Whey Shake"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white mt-1"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-gray-400">Portion Qty *</label>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    value={customQty}
                    onChange={(e) => setCustomQty(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white mt-1 font-semibold"
                  />
                </div>
                <div>
                  <label className="text-gray-400">Unit</label>
                  <select
                    value={customRefType === "per_100g" ? "g" : customRefType === "per_100ml" ? "ml" : customUnit}
                    disabled={customRefType !== "per_serving"}
                    onChange={(e) => setCustomUnit(e.target.value as ServingUnit)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white mt-1 disabled:opacity-50"
                  >
                    <option value="piece">piece</option>
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                    <option value="cup">cup</option>
                    <option value="tbsp">tbsp</option>
                    <option value="scoop">scoop</option>
                  </select>
                </div>
                <div>
                  <label className="text-gray-400">Values are for</label>
                  <select
                    value={customRefType}
                    onChange={(e) => {
                      const val = e.target.value as "per_serving" | "per_100g" | "per_100ml";
                      setCustomRefType(val);
                      if (val === "per_100g") {
                        setCustomQty("100");
                        setCustomUnit("g");
                      } else if (val === "per_100ml") {
                        setCustomQty("100");
                        setCustomUnit("ml");
                      }
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white mt-1"
                  >
                    <option value="per_serving">This portion</option>
                    <option value="per_100g">Per 100g</option>
                    <option value="per_100ml">Per 100ml</option>
                  </select>
                </div>
              </div>

              {/* Auto-Estimate Nutrition Banner (From Name or Photo) */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-brand-500/15 via-purple-500/10 to-accent-cyan/10 border border-brand-500/30 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                      <span>Don&rsquo;t know the calories or macros?</span>
                    </p>
                    <p className="text-[11px] text-gray-300 mt-0.5">
                      Auto-estimate protein, calories, carbs, fat &amp; fibre from the food name or a photo.
                    </p>
                  </div>
                  {photoPreviewUrl && (
                    <img
                      src={photoPreviewUrl}
                      alt="Food preview"
                      className="w-10 h-10 rounded-lg object-cover border border-white/20 flex-shrink-0"
                    />
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isEstimating || !customName.trim()}
                    onClick={() => handleEstimateCustomFood()}
                    className="flex-1 min-w-[140px] py-2 px-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition active:scale-95"
                  >
                    {isEstimating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>{isEstimating ? "Estimating..." : "✨ Estimate from Name"}</span>
                  </button>

                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoSelectedForEstimate}
                  />
                  <button
                    type="button"
                    disabled={isEstimating}
                    onClick={() => photoInputRef.current?.click()}
                    className="flex-1 min-w-[140px] py-2 px-3 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <Camera className="w-3.5 h-3.5 text-accent-cyan" />
                    <span>📷 Estimate from Photo</span>
                  </button>
                </div>

                {estimateBanner && (
                  <p className="text-[11px] text-emerald-300 font-medium bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2.5 py-1.5">
                    {estimateBanner}
                  </p>
                )}
              </div>

              {/* Macro Inputs */}
              <div className="p-3 rounded-2xl bg-gray-800/40 border border-gray-700/60 space-y-2">
                <p className="text-[11px] font-semibold text-gray-300">
                  Nutrients (Auto-estimated or enter manually — leave blank if unknown)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-brand-400">Protein (g)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 12"
                      value={customProtein}
                      onChange={(e) => setCustomProtein(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-amber-400">Calories (kcal)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 220"
                      value={customCalories}
                      onChange={(e) => setCustomCalories(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-sky-400">Carbs (g)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 30"
                      value={customCarbs}
                      onChange={(e) => setCustomCarbs(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-purple-400">Fat (g)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 6"
                      value={customFat}
                      onChange={(e) => setCustomFat(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-emerald-400">Fibre (g)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 4"
                      value={customFibre}
                      onChange={(e) => setCustomFibre(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="saveLib"
                  checked={saveToLibrary}
                  onChange={(e) => setSaveToLibrary(e.target.checked)}
                  className="rounded border-gray-700 bg-gray-800 text-brand-500"
                />
                <label htmlFor="saveLib" className="text-gray-300 cursor-pointer">
                  Also save to &ldquo;My Saved Foods&rdquo; so I can reuse it anytime
                </label>
              </div>

              <button
                onClick={() => handleSaveAndLogCustom()}
                disabled={!customName.trim()}
                className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold text-xs shadow-lg shadow-brand-500/20"
              >
                {saveToLibrary ? "Save & Log Custom Food" : "Log Custom Food"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
