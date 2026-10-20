"use client";

import { expandCombinationToEntries, localDateIso, shiftDateIso } from "@/lib/nutrition/combination";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/navigation/Navbar";
import { AddFoodModal } from "@/components/dashboard/AddFoodModal";
import { PhotoScannerModal } from "@/components/ai/PhotoScannerModal";
import { Food, FoodCombination, FoodLogEntry, MealType } from "@/lib/nutrition/types";
import {
  deleteFoodLogEntry,
  getAllCombinations,
  getAllFoods,
  getFoodLogsByDate,
  mergeSavedAndCommonFoods,
  saveFood,
  saveFoodLogEntry,
} from "@/lib/storage/indexed-db";
import { aggregateDailyNutrients, createNutritionSnapshot } from "@/lib/nutrition/calculator";
import { NutrientValues, ServingUnit } from "@/lib/nutrition/types";
import { ChevronLeft, ChevronRight, Calendar, Trash2, Edit2, Plus, AlertCircle, Info } from "lucide-react";

export default function FoodLogPage() {
  const [selectedDate, setSelectedDate] = useState<string>(localDateIso());
  const [logs, setLogs] = useState<FoodLogEntry[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [combinations, setCombinations] = useState<FoodCombination[]>([]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeMealForModal, setActiveMealForModal] = useState<MealType>("breakfast");
  const [isPhotoScannerOpen, setIsPhotoScannerOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<FoodLogEntry | null>(null);

  const loadLogs = async () => {
    const l = await getFoodLogsByDate(selectedDate);
    const f = await getAllFoods();
    const c = await getAllCombinations();
    setLogs(l);
    setFoods(f);
    setCombinations(c);
  };

  useEffect(() => {
    loadLogs();
  }, [selectedDate]);

  const handleDateChange = (daysOffset: number) => {
    setSelectedDate(shiftDateIso(selectedDate, daysOffset));
  };

  const handleDelete = async (id: string) => {
    await deleteFoodLogEntry(id);
    await loadLogs();
  };

  const allCatalogFoods = mergeSavedAndCommonFoods(foods);

  const [editing, setEditing] = useState<{ entry: FoodLogEntry; qty: string; unit: ServingUnit; meal: MealType } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const saveEdit = async () => {
    if (!editing) return;
    const qty = Number(editing.qty);
    if (!(qty > 0)) return setEditError("Quantity must be greater than 0.");
    const { entry } = editing;
    const food = entry.foodId ? allCatalogFoods.find((f) => f.id === entry.foodId) : undefined;
    let snapshot: NutrientValues;
    if (food) {
      try {
        snapshot = createNutritionSnapshot(food, qty, editing.unit);
      } catch (e: any) {
        return setEditError(e.message);
      }
    } else {
      // No library food: scale proportionally in the same unit; unknown stays unknown.
      const ratio = qty / entry.servingQuantity;
      snapshot = { ...entry.nutritionSnapshot };
      for (const k of Object.keys(snapshot) as (keyof NutrientValues)[]) {
        const v = snapshot[k];
        snapshot[k] = v === null ? null : Math.round(v * ratio * 10) / 10;
      }
    }
    await saveFoodLogEntry({ ...entry, servingQuantity: qty, servingUnit: editing.unit, mealType: editing.meal, nutritionSnapshot: snapshot });
    setEditing(null);
    setEditError(null);
    await loadLogs();
  };

  const aggregated = aggregateDailyNutrients(logs);

  const mealGroups: Record<MealType, FoodLogEntry[]> = {
    breakfast: logs.filter((l) => l.mealType === "breakfast"),
    lunch: logs.filter((l) => l.mealType === "lunch"),
    dinner: logs.filter((l) => l.mealType === "dinner"),
    snack: logs.filter((l) => l.mealType === "snack"),
  };

  const formattedDate = new Date(selectedDate).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="min-h-screen pb-24 md:pb-12 flex flex-col">
      <Navbar onOpenAddModal={() => setIsAddModalOpen(true)} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 pt-6 space-y-6">
        {/* Date Navigator Bar */}
        <div className="flex items-center justify-between p-4 rounded-2xl glass-panel border border-gray-800">
          <button
            onClick={() => handleDateChange(-1)}
            className="p-2 rounded-xl bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white transition-all"
            title="Previous Day"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 text-center">
            <Calendar className="w-4 h-4 text-brand-400" />
            <span className="font-bold text-sm text-white">{formattedDate}</span>
          </div>

          <button
            onClick={() => handleDateChange(1)}
            className="p-2 rounded-xl bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white transition-all"
            title="Next Day"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Daily Summary Bar */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl glass-card border border-brand-500/30 text-center">
            <p className="text-[11px] text-gray-400 font-medium uppercase">Total Protein</p>
            <p className="text-xl font-extrabold text-brand-400 mt-0.5">
              {aggregated.totals.protein !== null ? `${aggregated.totals.protein}g` : "0g"}
            </p>
          </div>

          <div className="p-4 rounded-2xl glass-card border border-amber-500/30 text-center">
            <p className="text-[11px] text-gray-400 font-medium uppercase">Total Calories</p>
            <p className="text-xl font-extrabold text-amber-400 mt-0.5">
              {aggregated.totals.calories !== null ? `${aggregated.totals.calories} kcal` : "0 kcal"}
            </p>
          </div>

          <div className="p-4 rounded-2xl glass-card border border-accent-cyan/30 text-center">
            <p className="text-[11px] text-gray-400 font-medium uppercase">Logged Meals</p>
            <p className="text-xl font-extrabold text-accent-cyan mt-0.5">{logs.length}</p>
          </div>
        </div>

        {/* Meals Breakdown List */}
        <div className="space-y-4">
          {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((meal) => {
            const mealEntries = mealGroups[meal];
            const mealProtein = mealEntries.reduce(
              (acc, e) => acc + (e.nutritionSnapshot.protein || 0),
              0
            );

            return (
              <div key={meal} className="rounded-3xl glass-card border border-gray-800 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-white capitalize">
                      {meal}
                    </h2>
                    <button
                      onClick={() => {
                        setActiveMealForModal(meal);
                        setIsAddModalOpen(true);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 text-brand-400 border border-brand-500/30 text-[11px] font-semibold transition-all active:scale-95"
                      title={`Add food directly to ${meal}`}
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Add</span>
                    </button>
                  </div>
                  <span className="text-xs font-semibold text-brand-400 bg-brand-500/10 border border-brand-500/20 px-3 py-1 rounded-full">
                    {Math.round(mealProtein * 10) / 10}g protein
                  </span>
                </div>

                {mealEntries.length === 0 ? (
                  <p className="text-xs text-gray-500 italic py-2">No food logged for {meal}.</p>
                ) : (
                  <div className="space-y-2">
                    {mealEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-3 rounded-2xl bg-gray-900/60 border border-gray-800 hover:border-gray-700 transition-all flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-white">
                              {entry.foodNameSnapshot}
                            </span>
                            {entry.entrySource === "photo" && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                AI Vision
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {entry.servingQuantity} {entry.servingUnit}
                          </p>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xs font-bold text-brand-400">
                              {entry.nutritionSnapshot.protein !== null
                                ? `${entry.nutritionSnapshot.protein}g protein`
                                : "Unknown"}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {entry.nutritionSnapshot.calories !== null
                                ? `${entry.nutritionSnapshot.calories} kcal`
                                : "Unknown"}
                            </p>
                          </div>

                          <button
                            onClick={() => { setEditing({ entry, qty: String(entry.servingQuantity), unit: entry.servingUnit, meal: entry.mealType }); setEditError(null); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
                            title="Edit entry"
                            aria-label={`Edit ${entry.foodNameSnapshot}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setSelectedSnapshot(entry)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
                            title="View frozen snapshot details"
                          >
                            <Info className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-gray-800"
                            title="Delete log entry"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Edit entry">
            <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-3xl p-6 space-y-4 text-xs">
              <h3 className="text-base font-bold text-white">Edit {editing.entry.foodNameSnapshot}</h3>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-gray-400">Quantity
                  <input type="number" min="0" step="any" value={editing.qty} onChange={(e) => setEditing({ ...editing, qty: e.target.value })} className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white" />
                </label>
                <label className="text-gray-400">Unit
                  <select disabled={!editing.entry.foodId || !foods.some((f) => f.id === editing.entry.foodId)} value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value as ServingUnit })} className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white disabled:opacity-50">
                    {(["g", "ml", "piece", "cup", "tbsp", "scoop"] as ServingUnit[]).map((u) => <option key={u}>{u}</option>)}
                  </select>
                </label>
                <label className="text-gray-400 col-span-2">Meal
                  <select value={editing.meal} onChange={(e) => setEditing({ ...editing, meal: e.target.value as MealType })} className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white capitalize">
                    {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((m) => <option key={m}>{m}</option>)}
                  </select>
                </label>
              </div>
              {editError && <p role="alert" className="text-rose-400">{editError}</p>}
              <div className="flex justify-end gap-3">
                <button onClick={() => setEditing(null)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                <button onClick={saveEdit} className="px-5 py-2 rounded-xl bg-brand-500 text-white font-semibold">Save</button>
              </div>
            </div>
          </div>
        )}

        {/* Snapshot Inspector Drawer/Modal */}
        {selectedSnapshot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-3xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white">Frozen Snapshot Details</h3>
                  <p className="text-xs text-gray-400">{selectedSnapshot.foodNameSnapshot}</p>
                </div>
                <button
                  onClick={() => setSelectedSnapshot(null)}
                  className="p-1 text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded-xl bg-gray-800/60">
                  <span className="text-gray-400 block">Protein</span>
                  <span className="text-brand-400 font-bold text-sm">
                    {selectedSnapshot.nutritionSnapshot.protein ?? "Unknown"}g
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-gray-800/60">
                  <span className="text-gray-400 block">Calories</span>
                  <span className="text-amber-400 font-bold text-sm">
                    {selectedSnapshot.nutritionSnapshot.calories ?? "Unknown"} kcal
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-gray-800/60">
                  <span className="text-gray-400 block">Carbohydrates</span>
                  <span className="text-cyan-400 font-bold text-sm">
                    {selectedSnapshot.nutritionSnapshot.carbohydrates ?? "Unknown"}g
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-gray-800/60">
                  <span className="text-gray-400 block">Total Fat</span>
                  <span className="text-purple-400 font-bold text-sm">
                    {selectedSnapshot.nutritionSnapshot.totalFat ?? "Unknown"}g
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-gray-800/60">
                  <span className="text-gray-400 block">Fibre</span>
                  <span className="text-emerald-400 font-bold text-sm">
                    {selectedSnapshot.nutritionSnapshot.fibre ?? "Unknown"}g
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-gray-800/60">
                  <span className="text-gray-400 block">Calcium</span>
                  <span className="text-blue-400 font-bold text-sm">
                    {selectedSnapshot.nutritionSnapshot.calcium ?? "Unknown"} mg
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-gray-500 italic">
                Note: This frozen snapshot retains exact nutrient values captured at the time of logging.
              </p>
            </div>
          </div>
        )}
      </main>

      <AddFoodModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        foods={foods}
        combinations={combinations}
        initialMeal={activeMealForModal}
        onLogEntry={async (entry) => {
          await saveFoodLogEntry({
            ...entry,
            id: `log_${Date.now()}`,
            userId: "default_user",
            loggedAt: selectedDate,
            createdAt: new Date().toISOString(),
          } as FoodLogEntry);
          await loadLogs();
        }}
        onLogCombination={async (combo, meal) => {
          const { entries } = expandCombinationToEntries(combo, allCatalogFoods, meal, selectedDate);
          for (const e of entries) await saveFoodLogEntry(e);
          await loadLogs();
        }}
        onSaveCustomFood={async (f) => {
          await saveFood(f);
          await loadLogs();
          return f;
        }}
        onOpenAIScan={() => setIsPhotoScannerOpen(true)}
      />

      <PhotoScannerModal
        isOpen={isPhotoScannerOpen}
        foods={allCatalogFoods}
        onClose={() => setIsPhotoScannerOpen(false)}
        onConfirmLog={async (entries) => {
          for (const entry of entries) {
            await saveFoodLogEntry({
              ...entry,
              id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              userId: "default_user",
              loggedAt: selectedDate,
              createdAt: new Date().toISOString(),
            } as FoodLogEntry);
          }
          await loadLogs();
        }}
      />
    </div>
  );
}
