"use client";

import { useEffect, useState } from "react";
import { expandCombinationToEntries, localDateIso } from "@/lib/nutrition/combination";
import { Navbar } from "@/components/navigation/Navbar";
import { EatflixMark } from "@/components/navigation/EatflixLogo";
import { AddFoodModal } from "@/components/dashboard/AddFoodModal";
import { PhotoScannerModal } from "@/components/ai/PhotoScannerModal";
import {
  Food,
  FoodCombination,
  FoodLogEntry,
  NutritionGoal,
  UserProfile,
  MealType,
} from "@/lib/nutrition/types";
import {
  getAllCombinations,
  getAllFoods,
  getFoodLogsByDate,
  getNutritionGoals,
  getUserProfile,
  saveFood,
  saveFoodLogEntry,
  deleteFoodLogEntry,
  seedStarterDataIfEmpty,
  mergeSavedAndCommonFoods,
} from "@/lib/storage/indexed-db";
import { aggregateDailyNutrients, calculateBmiInfo } from "@/lib/nutrition/calculator";
import { generateFoodSuggestions, FoodSuggestion } from "@/lib/nutrition/recommender";
import { HERO_BACKDROP_URL, MEAL_EPISODE_IMAGES, getFoodPosterUrl } from "@/lib/nutrition/media";
import {
  Flame,
  Plus,
  Camera,
  BookOpen,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Trash2,
  ArrowRight,
  Play,
  Film,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

const EPISODE_META: Record<
  MealType,
  { ep: string; title: string; subtitle: string; runtime: string }
> = {
  breakfast: { ep: "E1", title: "Breakfast", subtitle: "Morning Opening Act", runtime: "8:00 AM" },
  lunch: { ep: "E2", title: "Lunch", subtitle: "Midday Power Feature", runtime: "1:00 PM" },
  dinner: { ep: "E3", title: "Dinner", subtitle: "Prime Time Finale", runtime: "8:00 PM" },
  snack: { ep: "E4", title: "Snacks & Shakes", subtitle: "Bonus Scenes", runtime: "Anytime" },
};

export default function HomePage() {
  const [currentDateIso] = useState<string>(localDateIso());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [goals, setGoals] = useState<NutritionGoal | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [combinations, setCombinations] = useState<FoodCombination[]>([]);
  const [todayLogs, setTodayLogs] = useState<FoodLogEntry[]>([]);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeMealForModal, setActiveMealForModal] = useState<MealType>("breakfast");
  const [isPhotoScannerOpen, setIsPhotoScannerOpen] = useState(false);
  const [showMicros, setShowMicros] = useState(false);

  const loadData = async () => {
    await seedStarterDataIfEmpty();
    const p = await getUserProfile();
    const g = await getNutritionGoals();
    const f = await getAllFoods();
    const c = await getAllCombinations();
    const l = await getFoodLogsByDate(currentDateIso);

    setProfile(p);
    setGoals(g);
    setFoods(f);
    setCombinations(c);
    setTodayLogs(l);
  };

  useEffect(() => {
    loadData();
  }, [currentDateIso]);

  const aggregated = aggregateDailyNutrients(todayLogs);
  const totals = aggregated.totals;

  const proteinConsumed = totals.protein || 0;
  const proteinTarget = goals?.protein || 80;
  const proteinRemaining = Math.max(0, Math.round((proteinTarget - proteinConsumed) * 10) / 10);
  const proteinPercent = Math.min(100, Math.round((proteinConsumed / proteinTarget) * 100));

  const caloriesConsumed = totals.calories || 0;
  const caloriesTarget = goals?.calories || 2000;
  const caloriesRemaining = Math.max(0, Math.round(caloriesTarget - caloriesConsumed));
  const caloriesPercent = Math.min(100, Math.round((caloriesConsumed / caloriesTarget) * 100));

  const carbsConsumed = totals.carbohydrates || 0;
  const carbsTarget = goals?.carbohydrates || 220;
  const carbsPercent = Math.min(100, Math.round((carbsConsumed / carbsTarget) * 100));

  const fatConsumed = totals.totalFat || 0;
  const fatTarget = goals?.totalFat || 65;
  const fatPercent = Math.min(100, Math.round((fatConsumed / fatTarget) * 100));

  const fibreConsumed = totals.fibre || 0;
  const fibreTarget = goals?.fibre || 30;
  const fibrePercent = Math.min(100, Math.round((fibreConsumed / fibreTarget) * 100));

  const allCatalogFoods = mergeSavedAndCommonFoods(foods);

  const suggestions: FoodSuggestion[] =
    profile && goals ? generateFoodSuggestions(totals, goals, profile, allCatalogFoods) : [];

  const handleLogEntry = async (entryPartial: Partial<FoodLogEntry>) => {
    const newEntry: FoodLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      userId: profile?.id || "default_user",
      foodId: entryPartial.foodId || null,
      foodNameSnapshot: entryPartial.foodNameSnapshot || "Custom Entry",
      servingQuantity: entryPartial.servingQuantity || 1,
      servingUnit: entryPartial.servingUnit || "g",
      nutritionSnapshot: entryPartial.nutritionSnapshot || totals,
      mealType: entryPartial.mealType || "breakfast",
      entrySource: entryPartial.entrySource || "manual",
      confidence: entryPartial.confidence || null,
      loggedAt: currentDateIso,
      createdAt: new Date().toISOString(),
    };

    await saveFoodLogEntry(newEntry);
    await loadData();
  };

  const handleLogCombination = async (combo: FoodCombination, mealType: MealType) => {
    const { entries } = expandCombinationToEntries(
      combo,
      allCatalogFoods,
      mealType,
      currentDateIso,
      profile?.id || "default_user"
    );
    for (const e of entries) await saveFoodLogEntry(e);
    await loadData();
  };

  const handleDeleteEntry = async (id: string) => {
    await deleteFoodLogEntry(id);
    await loadData();
  };

  const handleRepeatLastServing = async (entry: FoodLogEntry) => {
    await saveFoodLogEntry({
      ...entry,
      id: `log_repeat_${Date.now()}`,
      loggedAt: currentDateIso,
      createdAt: new Date().toISOString(),
    });
    await loadData();
  };

  const handleSaveCustomFood = async (food: Food) => {
    await saveFood(food);
    await loadData();
    return food;
  };

  const mealGroups: Record<MealType, FoodLogEntry[]> = {
    breakfast: todayLogs.filter((l) => l.mealType === "breakfast"),
    lunch: todayLogs.filter((l) => l.mealType === "lunch"),
    dinner: todayLogs.filter((l) => l.mealType === "dinner"),
    snack: todayLogs.filter((l) => l.mealType === "snack"),
  };

  const formattedDate = new Date(currentDateIso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const bmiInfo = calculateBmiInfo(profile?.heightCm, profile?.weightKg);

  return (
    <div className="min-h-screen pb-24 md:pb-12 flex flex-col">
      <Navbar onOpenAddModal={() => setIsAddModalOpen(true)} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 pt-4 space-y-8">
        {/* NETFLIX FULL-BLEED CINEMATIC HERO BILLBOARD */}
        <section className="relative overflow-hidden rounded-3xl border border-zinc-800/90 shadow-2xl min-h-[340px] sm:min-h-[390px] flex flex-col justify-end">
          {/* Background Culinary Photography */}
          <img
            src={HERO_BACKDROP_URL}
            alt="EATflix Featured Meal Spread"
            className="absolute inset-0 w-full h-full object-cover object-center scale-105 transition-transform duration-700"
          />
          {/* Multi-layer Netflix Vignettes */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b0b0d] via-[#0b0b0d]/90 to-[#0b0b0d]/35" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0d] via-[#0b0b0d]/45 to-transparent" />

          <div className="relative z-10 p-4 sm:p-9 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
            <div className="space-y-3 max-w-xl">
              {/* EATFLIX ORIGINAL + TOP 10 Badge */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <EatflixMark className="w-6 h-6" />
                  <span className="text-[11px] font-extrabold tracking-[0.28em] text-zinc-200 uppercase">
                    SERIES
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-[#E50914]/20 border border-[#E50914]/50 text-[10px] font-extrabold text-red-300 uppercase tracking-wider">
                  #1 Today • {formattedDate}
                </span>
                <Link
                  href="/profile"
                  className="px-2.5 py-0.5 rounded bg-black/60 backdrop-blur-md border border-zinc-700 text-[10px] text-zinc-200 hover:text-white capitalize"
                >
                  {profile?.displayName?.trim() || "Set Up Profile"} •{" "}
                  {(profile?.dietaryPreference || "eggitarian").replace("_", " ")}
                </Link>
              </div>

              {/* Hero Title */}
              <h1 className="text-2xl sm:text-5xl font-black tracking-tight text-white uppercase leading-[0.95] drop-shadow-lg">
                THE PROTEIN <span className="text-[#E50914]">CHRONICLES</span>
              </h1>

              {/* Netflix Metadata Line */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="text-[#46d369] font-extrabold">{proteinPercent}% Goal Match</span>
                <span className="text-zinc-300">2026</span>
                <span className="px-1.5 py-0.5 rounded border border-zinc-500 bg-black/40 text-[10px] text-zinc-200 leading-none">
                  4K MACRO HD
                </span>
                <span className="px-2 py-0.5 rounded bg-zinc-900/80 border border-zinc-700 text-zinc-200 text-[11px]">
                  {proteinRemaining > 0 ? `${proteinRemaining}g protein left` : "Target Complete ★"}
                </span>
              </div>

              <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed max-w-lg drop-shadow">
                {proteinRemaining > 0
                  ? `You've logged ${Math.round(proteinConsumed * 10) / 10}g of your ${proteinTarget}g protein target and ${Math.round(caloriesConsumed)} of ${caloriesTarget} kcal today.`
                  : `Box office smash! You hit ${Math.round(proteinConsumed * 10) / 10}g protein today against your ${proteinTarget}g target.`}
              </p>

              {/* Netflix Play & Glass Action Buttons (Full-width 2-col on mobile, inline on desktop) */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 pt-1">
                <button
                  onClick={() => {
                    setActiveMealForModal("breakfast");
                    setIsAddModalOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-white hover:bg-zinc-200 text-black font-extrabold text-xs sm:text-sm shadow-xl transition active:scale-95"
                >
                  <Play className="w-4 h-4 fill-black text-black" />
                  <span>Log Meal</span>
                </button>

                <button
                  onClick={() => setIsPhotoScannerOpen(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-zinc-700/85 hover:bg-zinc-600/90 text-white font-bold text-xs sm:text-sm border border-zinc-500/40 backdrop-blur-md transition active:scale-95"
                >
                  <Camera className="w-4 h-4 text-[#E50914]" />
                  <span>AI Photo Scan</span>
                </button>

                <Link
                  href="/my-foods"
                  className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-black/60 hover:bg-black/80 text-zinc-200 font-semibold text-xs border border-zinc-700 backdrop-blur-md transition"
                >
                  <BookOpen className="w-3.5 h-3.5 text-zinc-400" />
                  <span>My List ({foods.filter((f) => !f.isArchived).length})</span>
                </Link>
              </div>
            </div>

            {/* Right: Macro Box Office HUD */}
            <div className="w-full lg:w-80 p-4 rounded-2xl bg-black/75 border border-zinc-800 backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400">
                  Today&apos;s Macro Box Office
                </span>
                <span className="text-[11px] font-bold text-[#46d369]">{caloriesRemaining} kcal left</span>
              </div>

              {/* Protein Progress */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-[#E50914]" /> Protein
                  </span>
                  <span className="font-extrabold text-white">
                    {Math.round(proteinConsumed * 10) / 10}g{" "}
                    <span className="text-zinc-500 font-normal">/ {proteinTarget}g</span>
                  </span>
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#E50914] rounded-full transition-all duration-700"
                    style={{ width: `${proteinPercent}%` }}
                  />
                </div>
              </div>

              {/* Calories Progress */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-zinc-300">Calories</span>
                  <span className="font-bold text-amber-400">
                    {Math.round(caloriesConsumed)}{" "}
                    <span className="text-zinc-500 font-normal">/ {caloriesTarget} kcal</span>
                  </span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-700"
                    style={{ width: `${caloriesPercent}%` }}
                  />
                </div>
              </div>

              {/* Mini Macro Grid */}
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="p-2 rounded-xl bg-zinc-900/90 border border-zinc-800">
                  <p className="text-[10px] text-zinc-400">Carbs</p>
                  <p className="text-xs font-extrabold text-sky-400">
                    {Math.round(carbsConsumed)}/{carbsTarget}g
                  </p>
                  <div className="w-full h-1 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-sky-400" style={{ width: `${carbsPercent}%` }} />
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-zinc-900/90 border border-zinc-800">
                  <p className="text-[10px] text-zinc-400">Fat</p>
                  <p className="text-xs font-extrabold text-purple-400">
                    {Math.round(fatConsumed)}/{fatTarget}g
                  </p>
                  <div className="w-full h-1 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-purple-400" style={{ width: `${fatPercent}%` }} />
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-zinc-900/90 border border-zinc-800">
                  <p className="text-[10px] text-zinc-400">Fibre</p>
                  <p className="text-xs font-extrabold text-[#46d369]">
                    {Math.round(fibreConsumed)}/{fibreTarget}g
                  </p>
                  <div className="w-full h-1 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-[#46d369]" style={{ width: `${fibrePercent}%` }} />
                  </div>
                </div>
              </div>

              {/* BMI Spectrum Progress Bar */}
              {bmiInfo && (
                <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400 font-semibold">
                      BMI ({profile?.weightKg}kg / {profile?.heightCm}cm)
                    </span>
                    <span className={`font-extrabold ${bmiInfo.colorClass}`}>
                      {bmiInfo.bmi} • {bmiInfo.category}
                    </span>
                  </div>
                  <div className="relative h-2 w-full rounded-full overflow-visible bg-zinc-800 flex">
                    <div className="h-full w-[20%] bg-sky-500/80 rounded-l-full" />
                    <div className="h-full w-[30%] bg-emerald-500/85" />
                    <div className="h-full w-[23%] bg-amber-500/85" />
                    <div className="h-full w-[27%] bg-rose-500/85 rounded-r-full" />
                    <div
                      className="absolute -top-1 w-2.5 h-4 rounded-full bg-white border-2 border-[#101012] shadow -translate-x-1/2"
                      style={{ left: `${bmiInfo.markerPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ROW 1: CONTINUE EATING FOR YOU (Widescreen 16:9 Netflix Thumbnail Rail) */}
        {(todayLogs.length > 0 || combinations.length > 0) && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-[#E50914]" />
                Continue Eating • 1-Tap Instant Replay
              </h2>
              <Link href="/my-foods" className="text-xs text-zinc-400 hover:text-white">
                Manage My List →
              </Link>
            </div>

            <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-4">
              {combinations.slice(0, 2).map((combo) => {
                const firstItemName = combo.items[0]?.foodName || combo.name;
                const poster = getFoodPosterUrl(firstItemName);
                return (
                  <button
                    key={combo.id}
                    onClick={() => handleLogCombination(combo, "breakfast")}
                    className="min-w-[185px] sm:min-w-0 snap-start group relative rounded-xl overflow-hidden bg-[#18181b] border border-zinc-800 hover:border-[#E50914] text-left transition-all hover:-translate-y-1 shadow-lg flex-shrink-0"
                  >
                    <div className="relative h-28 w-full overflow-hidden">
                      <img
                        src={poster}
                        alt={combo.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#18181b] via-black/30 to-transparent" />
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-[#E50914] text-white text-[9px] font-black uppercase tracking-wider">
                        COMBO
                      </span>
                      <div className="absolute inset-0 flex items-center justify-center opacity-90 group-hover:scale-110 transition-transform">
                        <span className="w-9 h-9 rounded-full bg-black/75 border-2 border-white flex items-center justify-center text-white shadow-lg">
                          <Play className="w-4 h-4 fill-white ml-0.5" />
                        </span>
                      </div>
                      {/* Netflix Red Progress Bar at bottom of thumbnail */}
                      <div className="absolute bottom-0 inset-x-0 h-1 bg-zinc-700">
                        <div className="h-full bg-[#E50914] w-4/5" />
                      </div>
                    </div>
                    <div className="p-2.5">
                      <p className="font-bold text-xs text-white truncate">{combo.name}</p>
                      <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                        {combo.items.length} items • Tap to replay
                      </p>
                    </div>
                  </button>
                );
              })}

              {todayLogs.slice(0, 4 - Math.min(2, combinations.length)).map((entry) => {
                const poster = getFoodPosterUrl(entry.foodNameSnapshot);
                return (
                  <button
                    key={`repeat_${entry.id}`}
                    onClick={() => handleRepeatLastServing(entry)}
                    className="min-w-[185px] sm:min-w-0 snap-start group relative rounded-xl overflow-hidden bg-[#18181b] border border-zinc-800 hover:border-[#E50914] text-left transition-all hover:-translate-y-1 shadow-lg flex-shrink-0"
                  >
                    <div className="relative h-28 w-full overflow-hidden">
                      <img
                        src={poster}
                        alt={entry.foodNameSnapshot}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#18181b] via-black/30 to-transparent" />
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 border border-zinc-700 text-[#46d369] text-[10px] font-extrabold">
                        +{entry.nutritionSnapshot.protein ?? 0}g P
                      </span>
                      <div className="absolute inset-0 flex items-center justify-center opacity-90 group-hover:scale-110 transition-transform">
                        <span className="w-9 h-9 rounded-full bg-black/75 border-2 border-white flex items-center justify-center text-white shadow-lg">
                          <Play className="w-4 h-4 fill-white ml-0.5" />
                        </span>
                      </div>
                      <div className="absolute bottom-0 inset-x-0 h-1 bg-zinc-700">
                        <div className="h-full bg-[#E50914] w-2/3" />
                      </div>
                    </div>
                    <div className="p-2.5">
                      <p className="font-bold text-xs text-white truncate">{entry.foodNameSnapshot}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {entry.servingQuantity} {entry.servingUnit} • {entry.nutritionSnapshot.calories ?? 0} kcal
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ROW 2: TODAY'S EPISODES — SEASON 1 (Netflix Episode Cards with Widescreen Thumbnails) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <Film className="w-4 h-4 text-[#E50914]" />
              Today&apos;s Episodes • Season 1 (Meals)
            </h2>
            <Link href="/food-log" className="text-xs text-[#E50914] hover:underline flex items-center gap-1 font-semibold">
              <span>Full Episode Guide</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((meal) => {
              const entries = mealGroups[meal];
              const meta = EPISODE_META[meal];
              const epImage = MEAL_EPISODE_IMAGES[meal];
              const mealProtein = entries.reduce((acc, e) => acc + (e.nutritionSnapshot.protein || 0), 0);
              const mealCalories = entries.reduce((acc, e) => acc + (e.nutritionSnapshot.calories || 0), 0);
              const epProgress = Math.min(100, Math.round((mealProtein / (proteinTarget / 4)) * 100));

              return (
                <div
                  key={meal}
                  className="rounded-2xl bg-[#18181b] border border-zinc-800/90 overflow-hidden flex flex-col justify-between shadow-lg"
                >
                  {/* Episode Thumbnail Header (Horizontal side-by-side on mobile & desktop like Netflix App) */}
                  <div className="flex flex-row items-center gap-3 sm:gap-3.5 p-3 sm:p-3.5 border-b border-zinc-800/80">
                    <div
                      onClick={() => {
                        setActiveMealForModal(meal);
                        setIsAddModalOpen(true);
                      }}
                      className="relative w-32 h-20 sm:w-40 sm:h-28 rounded-xl overflow-hidden flex-shrink-0 cursor-pointer group"
                    >
                      <img
                        src={epImage}
                        alt={meta.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-black/35 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <span className="w-9 h-9 rounded-full bg-black/75 border-2 border-white flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                          <Plus className="w-4 h-4 stroke-[2.5]" />
                        </span>
                      </div>
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/80 text-white font-black text-[10px]">
                        {meta.ep}
                      </span>
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-zinc-300 text-[9px] font-semibold">
                        {meta.runtime}
                      </span>
                      {/* Netflix Red Progress Bar at bottom of episode thumbnail */}
                      <div className="absolute bottom-0 inset-x-0 h-1 bg-zinc-700">
                        <div
                          className="h-full bg-[#E50914] transition-all duration-500"
                          style={{ width: `${epProgress}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-extrabold text-white">
                            {meta.ep}. {meta.title}
                          </h3>
                          <span className="text-xs font-extrabold text-[#46d369]">
                            {Math.round(mealProtein * 10) / 10}g P
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          {meta.subtitle} • {Math.round(mealCalories)} kcal
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <span className="text-[10px] text-zinc-500">
                          {entries.length === 0 ? "Not streamed yet" : `${entries.length} item(s) logged`}
                        </span>
                        <button
                          onClick={() => {
                            setActiveMealForModal(meal);
                            setIsAddModalOpen(true);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E50914] hover:bg-[#b80710] text-white text-[11px] font-bold transition active:scale-95"
                        >
                          <Play className="w-3 h-3 fill-white" />
                          <span>Log {meta.title}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Logged Scenes inside Episode */}
                  <div className="p-3.5">
                    {entries.length === 0 ? (
                      <p className="text-xs text-zinc-500 italic py-1">
                        No foods logged in this episode yet. Click &ldquo;Log {meta.title}&rdquo; or tap the thumbnail!
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/90 border border-zinc-800/80 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <img
                                src={getFoodPosterUrl(entry.foodNameSnapshot)}
                                alt={entry.foodNameSnapshot}
                                className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-zinc-700"
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-white truncate">{entry.foodNameSnapshot}</p>
                                <p className="text-[10px] text-zinc-400">
                                  {entry.servingQuantity} {entry.servingUnit}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5 flex-shrink-0">
                              <div className="text-right">
                                <span className="font-bold text-white block">
                                  {entry.nutritionSnapshot.protein !== null
                                    ? `${entry.nutritionSnapshot.protein}g P`
                                    : "—"}
                                </span>
                                <span className="text-[10px] text-zinc-400">
                                  {entry.nutritionSnapshot.calories !== null
                                    ? `${entry.nutritionSnapshot.calories} kcal`
                                    : ""}
                                </span>
                              </div>
                              <button
                                onClick={() => handleDeleteEntry(entry.id)}
                                className="text-zinc-500 hover:text-rose-400 p-1"
                                title="Remove entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ROW 3: TOP 10 HIGH-PROTEIN PICKS FOR YOU TODAY (Netflix Ranked Number + Poster Rail) */}
        {suggestions.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-[#E50914] text-white font-black text-[10px] uppercase tracking-wider">
                  TOP 10
                </span>
                <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                  High-Protein Picks for You Today
                </h2>
              </div>
              <Link href="/discover" className="text-xs text-zinc-400 hover:text-white flex items-center gap-1">
                <span>Browse All Picks</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="flex overflow-x-auto snap-x snap-mandatory gap-3.5 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4">
              {suggestions.slice(0, 4).map((item, idx) => {
                const matchScore = Math.min(99, Math.max(86, 98 - idx * 3));
                const poster = getFoodPosterUrl(item.food.name, item.food.category);
                return (
                  <div
                    key={item.food.id}
                    className="min-w-[215px] sm:min-w-0 snap-start group relative rounded-2xl overflow-hidden bg-[#18181b] border border-zinc-800 hover:border-[#E50914]/60 flex flex-col justify-between transition-all hover:-translate-y-1 shadow-xl flex-shrink-0"
                  >
                    {/* Poster Image with Netflix Rank Number & Top-10 Ribbon */}
                    <div className="relative h-40 w-full overflow-hidden">
                      <img
                        src={poster}
                        alt={item.food.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#18181b] via-black/30 to-transparent" />

                      {/* Giant Netflix-style Outlined Rank Number */}
                      <span
                        className="absolute -bottom-3 left-2 text-6xl font-black leading-none select-none pointer-events-none"
                        style={{
                          color: "#101012",
                          WebkitTextStroke: "2px #ffffff",
                          textShadow: "0 4px 14px rgba(0,0,0,0.8)",
                        }}
                      >
                        {idx + 1}
                      </span>

                      {/* Top-Right Red Ribbon */}
                      <div className="absolute top-0 right-3 bg-[#E50914] text-white px-2 py-1 rounded-b-md text-[9px] font-black uppercase tracking-wider shadow">
                        TOP 10
                      </div>

                      {/* Match Score Pill */}
                      <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-extrabold text-[#46d369]">
                        {matchScore}% Match
                      </span>
                    </div>

                    <div className="p-3.5 pt-2 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <p className="font-extrabold text-sm text-white line-clamp-1">{item.food.name}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          {item.suggestedQuantity} {item.suggestedUnit} •{" "}
                          <span className="text-white font-bold">+{item.proteinContributionGrams}g protein</span> •{" "}
                          {item.contributedNutrients.calories ?? "—"} kcal
                        </p>
                      </div>

                      <button
                        onClick={() =>
                          handleLogEntry({
                            foodId: item.food.id,
                            foodNameSnapshot: item.food.name,
                            servingQuantity: item.suggestedQuantity,
                            servingUnit: item.suggestedUnit as FoodLogEntry["servingUnit"],
                            nutritionSnapshot: item.contributedNutrients,
                            mealType: "snack",
                            entrySource: "recommendation",
                          })
                        }
                        className="w-full py-2 rounded-lg bg-white hover:bg-zinc-200 text-black text-xs font-extrabold flex items-center justify-center gap-1.5 transition active:scale-95"
                      >
                        <Play className="w-3.5 h-3.5 fill-black text-black" />
                        <span>Quick Log</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* COLLAPSIBLE CAST & CREW (MICRONUTRIENTS) */}
        <section className="rounded-2xl bg-[#18181b] border border-zinc-800 overflow-hidden">
          <button
            onClick={() => setShowMicros(!showMicros)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-800/40 transition-colors"
          >
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#E50914]" />
                Supporting Cast: Hair-Health &amp; Micronutrients
              </h2>
              <p className="text-xs text-zinc-400">
                Iron, Zinc, Calcium, Vitamin B12, Vitamin D, Folate &amp; Essential Fats
              </p>
            </div>
            {showMicros ? (
              <ChevronUp className="w-5 h-5 text-zinc-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-zinc-400" />
            )}
          </button>

          {showMicros && (
            <div className="p-4 pt-0 border-t border-zinc-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              {[
                { label: "Iron", key: "iron", unit: "mg", target: goals?.iron },
                { label: "Calcium", key: "calcium", unit: "mg", target: goals?.calcium },
                { label: "Zinc", key: "zinc", unit: "mg", target: goals?.zinc },
                { label: "Vitamin B12", key: "vitB12", unit: "mcg", target: goals?.vitB12 },
                { label: "Vitamin D", key: "vitD", unit: "IU", target: goals?.vitD },
                { label: "Folate", key: "folate", unit: "mcg", target: goals?.folate },
                { label: "Healthy Fats", key: "healthyFats", unit: "g", target: null },
                { label: "Sugar", key: "sugar", unit: "g", target: null },
              ].map((m) => {
                const val = totals[m.key as keyof typeof totals];
                const isIncomplete = aggregated.incompleteNutrients.includes(m.key as any);

                return (
                  <div key={m.key} className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400 font-medium">{m.label}</span>
                      {isIncomplete && (
                        <span
                          className="text-[10px] text-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 rounded"
                          title="Some logged foods today did not specify this nutrient"
                        >
                          partial
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-white mt-1">
                      {val !== null ? `${val} ${m.unit}` : "Unknown"}
                    </p>
                    {m.target && (
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        Goal: {m.target} {m.unit}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Modals */}
      <AddFoodModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        foods={foods}
        combinations={combinations}
        initialMeal={activeMealForModal}
        onLogEntry={handleLogEntry}
        onLogCombination={handleLogCombination}
        onSaveCustomFood={handleSaveCustomFood}
        onOpenAIScan={() => setIsPhotoScannerOpen(true)}
      />

      <PhotoScannerModal
        isOpen={isPhotoScannerOpen}
        onClose={() => setIsPhotoScannerOpen(false)}
        foods={allCatalogFoods}
        onConfirmLog={async (entries) => {
          for (const entry of entries) {
            await handleLogEntry(entry);
          }
        }}
      />
    </div>
  );
}
