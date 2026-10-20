"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navigation/Navbar";
import { FitnessGoal, FoodLogEntry, NutritionGoal, UserProfile } from "@/lib/nutrition/types";
import { summarizeRange } from "@/lib/nutrition/progress";
import { localDateIso, shiftDateIso } from "@/lib/nutrition/combination";
import {
  aggregateDailyNutrients,
  calculateBmiInfo,
  calculateRecommendedGoals,
  calculateWeightGoalRoadmap,
} from "@/lib/nutrition/calculator";
import {
  getAllFoodLogs,
  getNutritionGoals,
  getUserProfile,
  saveNutritionGoals,
  saveUserProfile,
  seedStarterDataIfEmpty,
} from "@/lib/storage/indexed-db";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Info,
  Flame,
  Zap,
  CalendarCheck,
  Trophy,
  TrendingUp,
  PieChart as PieIcon,
  Activity,
  Award,
  AlertTriangle,
  Scale,
  Droplets,
  Dumbbell,
  Sparkles,
  Check,
  Plus,
  Minus,
} from "lucide-react";

const RANGES = [
  { label: "7 Days", days: 7 },
  { label: "14 Days", days: 14 },
  { label: "30 Days", days: 30 },
] as const;

const GOAL_META: Record<
  FitnessGoal,
  { emoji: string; label: string; tagline: string; badgeClass: string }
> = {
  fat_loss: {
    emoji: "🔥",
    label: "Weight Loss & Fat Burn",
    tagline: "Calorie deficit + high protein & fibre satiety tracker",
    badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
  muscle_gain: {
    emoji: "💪",
    label: "Muscle & Weight Gain",
    tagline: "Clean calorie surplus + 1.8g/kg protein & workout consistency",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  maintain: {
    emoji: "⚖️",
    label: "Maintain Weight & Tone",
    tagline: "Weight stability band (±1.5 kg) + daily protein & macro balance",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  athletic_performance: {
    emoji: "⚡",
    label: "Stamina & Athletic Energy",
    tagline: "Training fuel, carbs + protein recovery, and daily hydration",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  wellness_vitality: {
    emoji: "🌿",
    label: "Gut, Hair/Skin & Vitality",
    tagline: "30g+ fibre, iron, B12, zinc, calcium & daily hydration",
    badgeClass: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  },
};

const NUTRIENT_LABEL: Record<string, string> = {
  protein: "Protein",
  fibre: "Fibre",
  iron: "Iron",
  calcium: "Calcium",
  zinc: "Zinc",
  vitB12: "Vitamin B12",
  vitD: "Vitamin D",
  folate: "Folate",
};

const HEALTH_INDICATORS: { key: keyof NutritionGoal; label: string; unit: string; color: string }[] = [
  { key: "protein", label: "Protein", unit: "g", color: "#10b981" },
  { key: "fibre", label: "Fibre", unit: "g", color: "#06b6d4" },
  { key: "iron", label: "Iron", unit: "mg", color: "#f43f5e" },
  { key: "zinc", label: "Zinc", unit: "mg", color: "#8b5cf6" },
  { key: "vitB12", label: "Vitamin B12", unit: "mcg", color: "#f59e0b" },
  { key: "vitD", label: "Vitamin D", unit: "IU", color: "#eab308" },
  { key: "folate", label: "Folate", unit: "mcg", color: "#ec4899" },
  { key: "calcium", label: "Calcium", unit: "mg", color: "#3b82f6" },
];

export default function ProgressPage() {
  const [logs, setLogs] = useState<FoodLogEntry[]>([]);
  const [goals, setGoals] = useState<NutritionGoal | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [days, setDays] = useState<number>(7);
  const [selected, setSelected] = useState<string>(localDateIso());

  // Weight & Goal interactive inputs
  const [weightInput, setWeightInput] = useState<string>("");
  const [weightDateInput, setWeightDateInput] = useState<string>(localDateIso());
  const [targetWeightInput, setTargetWeightInput] = useState<string>("");
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const loadAll = async () => {
    await seedStarterDataIfEmpty();
    const [allLogs, g, p] = await Promise.all([
      getAllFoodLogs(),
      getNutritionGoals(),
      getUserProfile(),
    ]);
    setLogs(allLogs);
    setGoals(g);
    setProfile(p);
    if (p.weightKg != null) setWeightInput(String(p.weightKg));
    if (p.targetWeightKg != null) setTargetWeightInput(String(p.targetWeightKg));
  };

  useEffect(() => {
    loadAll();
    const onSync = () => loadAll();
    window.addEventListener("nutritrack:sync-complete", onSync);
    return () => window.removeEventListener("nutritrack:sync-complete", onSync);
  }, []);

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const today = localDateIso();

  const handleLogWeight = async () => {
    if (!profile) return;
    const w = Number(weightInput);
    if (!Number.isFinite(w) || w < 20 || w > 400) {
      showToast("Please enter a valid weight between 20 and 400 kg.");
      return;
    }
    const logDate = weightDateInput || today;
    const existing = profile.weightHistory || [];
    // Seed starting weight entry if empty and profile already had a weight
    const seeded =
      existing.length === 0 && profile.weightKg && profile.weightKg !== w
        ? [{ date: shiftDateIso(logDate, -7), weightKg: profile.weightKg, note: "Start" }]
        : existing;

    const filtered = seeded.filter((e) => e.date !== logDate);
    const nextHistory = [...filtered, { date: logDate, weightKg: w }].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    const latestWeight = nextHistory[nextHistory.length - 1]?.weightKg ?? w;
    const updated: UserProfile = {
      ...profile,
      weightKg: latestWeight,
      startingWeightKg: profile.startingWeightKg ?? profile.weightKg ?? w,
      weightHistory: nextHistory,
    };

    await saveUserProfile(updated);
    setProfile(updated);
    showToast(`Logged ${w} kg for ${logDate}!`);
  };

  const handleSaveTargetWeight = async () => {
    if (!profile) return;
    const tw = Number(targetWeightInput);
    if (!Number.isFinite(tw) || tw < 30 || tw > 300) {
      showToast("Enter a target weight between 30 and 300 kg.");
      return;
    }
    const updated: UserProfile = {
      ...profile,
      targetWeightKg: tw,
      startingWeightKg: profile.startingWeightKg ?? profile.weightKg ?? tw,
    };
    await saveUserProfile(updated);
    setProfile(updated);
    showToast(`Target weight updated to ${tw} kg!`);
  };

  const handleSwitchGoal = async (nextGoal: FitnessGoal) => {
    if (!profile) return;
    const nextTarget =
      nextGoal === "fat_loss" && profile.weightKg
        ? Math.max(40, Math.round((profile.weightKg - 4) * 10) / 10)
        : nextGoal === "muscle_gain" && profile.weightKg
        ? Math.round((profile.weightKg + 4) * 10) / 10
        : profile.weightKg ?? profile.targetWeightKg ?? null;

    const updated: UserProfile = {
      ...profile,
      fitnessGoal: nextGoal,
      targetWeightKg: profile.targetWeightKg ?? nextTarget,
    };
    const rec = calculateRecommendedGoals(updated);
    await saveUserProfile(updated);
    await saveNutritionGoals(rec.goals);
    setProfile(updated);
    setGoals(rec.goals);
    if (updated.targetWeightKg != null) setTargetWeightInput(String(updated.targetWeightKg));
    showToast(`Switched goal to ${GOAL_META[nextGoal].label} (${rec.goals.calories} kcal, ${rec.goals.protein}g protein)!`);
  };

  const handleAdjustWater = async (deltaLitres: number) => {
    if (!profile) return;
    const checkIns = { ...(profile.dailyCheckIns || {}) };
    const todayRec = checkIns[today] || {};
    const nextWater = Math.max(0, Math.min(6, Math.round(((todayRec.waterLitres || 0) + deltaLitres) * 100) / 100));
    checkIns[today] = { ...todayRec, waterLitres: nextWater };

    const updated: UserProfile = {
      ...profile,
      dailyCheckIns: checkIns,
    };
    await saveUserProfile(updated);
    setProfile(updated);
  };

  const handleToggleWorkoutToday = async () => {
    if (!profile) return;
    const checkIns = { ...(profile.dailyCheckIns || {}) };
    const todayRec = checkIns[today] || {};
    const nextDone = !todayRec.workoutDone;
    checkIns[today] = { ...todayRec, workoutDone: nextDone };

    const updated: UserProfile = {
      ...profile,
      dailyCheckIns: checkIns,
    };
    await saveUserProfile(updated);
    setProfile(updated);
    showToast(nextDone ? "💪 Logged today's workout!" : "Removed today's workout check-in.");
  };

  const bmiInfo = useMemo(
    () => calculateBmiInfo(profile?.heightCm, profile?.weightKg),
    [profile?.heightCm, profile?.weightKg]
  );

  const weightRoadmap = useMemo(() => calculateWeightGoalRoadmap(profile), [profile]);

  const weightChartData = useMemo(() => {
    if (!profile) return [];
    const raw = profile.weightHistory || [];
    if (raw.length === 0 && profile.weightKg) {
      return [
        {
          date: today,
          label: today.slice(5),
          weightKg: profile.weightKg,
        },
      ];
    }
    return raw.slice(-14).map((item) => ({
      date: item.date,
      label: item.date.slice(5),
      weightKg: item.weightKg,
    }));
  }, [profile, today]);

  // Weekly workout count (last 7 days)
  const workoutsLast7Days = useMemo(() => {
    if (!profile?.dailyCheckIns) return 0;
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = shiftDateIso(today, -i);
      if (profile.dailyCheckIns[d]?.workoutDone) count++;
    }
    return count;
  }, [profile?.dailyCheckIns, today]);

  const todayWaterLitres = profile?.dailyCheckIns?.[today]?.waterLitres ?? 0;
  const waterGoalLitres = profile?.waterGoalLitres ?? 2.5;
  const todayWorkoutDone = Boolean(profile?.dailyCheckIns?.[today]?.workoutDone);
  const workoutTargetPerWeek = profile?.workoutDaysPerWeek ?? 3;

  const summary = useMemo(() => (goals ? summarizeRange(logs, goals, today, days) : null), [logs, goals, today, days]);
  const dayLogs = useMemo(() => logs.filter((l) => l.loggedAt === selected), [logs, selected]);
  const dayAgg = useMemo(() => aggregateDailyNutrients(dayLogs), [dayLogs]);

  // Build rich daily chart dataset (including carbs, fat, fibre per day)
  const richChartData = useMemo(() => {
    if (!summary) return [];
    const byDate = new Map<string, FoodLogEntry[]>();
    for (const l of logs) {
      if (!byDate.has(l.loggedAt)) byDate.set(l.loggedAt, []);
      byDate.get(l.loggedAt)!.push(l);
    }

    return summary.days.map((d) => {
      const entries = byDate.get(d.date) ?? [];
      const agg = aggregateDailyNutrients(entries).totals;
      const shortDate = new Date(d.date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      return {
        date: d.date,
        label: d.date.slice(5),
        shortDate,
        entryCount: d.entryCount,
        protein: d.entryCount ? d.protein ?? 0 : null,
        calories: d.entryCount ? d.calories ?? 0 : null,
        carbs: d.entryCount ? agg.carbohydrates ?? 0 : null,
        fat: d.entryCount ? agg.totalFat ?? 0 : null,
        fibre: d.entryCount ? agg.fibre ?? 0 : null,
        proteinGoalMet: d.proteinGoalMet,
      };
    });
  }, [summary, logs]);

  // Period average macro split for the Donut chart
  const macroSplitData = useMemo(() => {
    const loggedRows = richChartData.filter((r) => r.entryCount > 0);
    if (loggedRows.length === 0) return [];
    const avgP = loggedRows.reduce((s, r) => s + (r.protein || 0), 0) / loggedRows.length;
    const avgC = loggedRows.reduce((s, r) => s + (r.carbs || 0), 0) / loggedRows.length;
    const avgF = loggedRows.reduce((s, r) => s + (r.fat || 0), 0) / loggedRows.length;

    const pKcal = Math.round(avgP * 4);
    const cKcal = Math.round(avgC * 4);
    const fKcal = Math.round(avgF * 9);
    const total = pKcal + cKcal + fKcal;
    if (total === 0) return [];

    return [
      { name: "Protein", grams: Math.round(avgP), value: pKcal, pct: Math.round((pKcal / total) * 100), color: "#10b981" },
      { name: "Carbs", grams: Math.round(avgC), value: cKcal, pct: Math.round((cKcal / total) * 100), color: "#06b6d4" },
      { name: "Fat", grams: Math.round(avgF), value: fKcal, pct: Math.round((fKcal / total) * 100), color: "#f59e0b" },
    ];
  }, [richChartData]);

  // Selected day Radar Chart data (% of target, capped at 100 for radar shape)
  const radarData = useMemo(() => {
    if (!goals) return [];
    return HEALTH_INDICATORS.map((h) => {
      const val = dayAgg.totals[h.key as keyof typeof dayAgg.totals];
      const target = goals[h.key] as number | null | undefined;
      const pct = target && val != null && target > 0 ? Math.round((val / target) * 100) : 0;
      return {
        subject: h.label,
        percent: Math.min(100, pct),
        rawPercent: pct,
        actual: val,
        target: target ?? null,
        unit: h.unit,
      };
    });
  }, [dayAgg, goals]);

  if (!goals || !summary) return <div className="p-8 text-gray-400">Loading…</div>;

  const activeGoalKey: FitnessGoal = profile?.fitnessGoal || "maintain";
  const activeGoalMeta = GOAL_META[activeGoalKey] || GOAL_META.maintain;

  const maxFreqCount = summary.frequentFoods.length
    ? Math.max(...summary.frequentFoods.map((f) => f.count), 1)
    : 1;

  return (
    <div className="min-h-screen pb-24 md:pb-12 flex flex-col">
      <Navbar onOpenAddModal={() => (window.location.href = "/")} />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 pt-6 space-y-6">
        {/* Header & Range Picker */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Goals, Weight &amp; Analytics</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Track your weight journey, daily hydration, workouts, macros, and goal-specific milestones
            </p>
          </div>
          <div className="flex gap-1 bg-gray-900/90 border border-gray-800 p-1 rounded-xl" role="group" aria-label="Range">
            {RANGES.map((r) => (
              <button
                key={r.days}
                aria-pressed={days === r.days}
                onClick={() => setDays(r.days)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  days === r.days
                    ? "bg-brand-500 text-white shadow-md shadow-brand-500/20"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {feedbackMsg && (
          <div
            role="status"
            className="px-4 py-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-300"
          >
            {feedbackMsg}
          </div>
        )}

        {/* INTERACTIVE GOAL SWITCHER & MULTI-GOAL HUB */}
        <section className="p-5 rounded-3xl glass-card border border-gray-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{activeGoalMeta.emoji}</span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-extrabold text-white">{activeGoalMeta.label}</h2>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${activeGoalMeta.badgeClass}`}>
                    Active Goal
                  </span>
                </div>
                <p className="text-xs text-gray-400">{activeGoalMeta.tagline}</p>
              </div>
            </div>
            <Link
              href="/profile"
              className="text-xs text-brand-400 hover:underline font-semibold"
            >
              Customize Goal Questions →
            </Link>
          </div>

          {/* 1-Tap Goal Switcher Pills for Everyone */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {(Object.keys(GOAL_META) as FitnessGoal[]).map((gKey) => {
              const item = GOAL_META[gKey];
              const isSelected = activeGoalKey === gKey;
              return (
                <button
                  key={gKey}
                  type="button"
                  onClick={() => handleSwitchGoal(gKey)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
                    isSelected
                      ? "bg-[#E50914] border-[#E50914] text-white shadow-md shadow-[#E50914]/25"
                      : "bg-gray-900/80 border-gray-800 text-gray-300 hover:border-gray-700"
                  }`}
                >
                  <span>{item.emoji}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Grid: Weight Tracker + Hydration & Workout Habit Trackers */}
          <div className="grid lg:grid-cols-12 gap-4 pt-1">
            {/* LEFT 7 COLS: WEIGHT JOURNEY & CHECK-IN TRACKER */}
            <div className="lg:col-span-7 p-4 rounded-2xl bg-gray-900/75 border border-gray-800 space-y-3.5 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-[#E50914]" />
                    <h3 className="text-sm font-bold text-white">Weight Tracker &amp; Goal Progress</h3>
                  </div>
                  {weightRoadmap && (
                    <span className="text-[11px] font-bold text-emerald-400">
                      {weightRoadmap.direction === "maintain"
                        ? "Maintenance Band (±1.5 kg)"
                        : weightRoadmap.remainingKg === 0
                        ? "🎉 Goal Reached!"
                        : `${weightRoadmap.remainingKg} kg to target${
                            weightRoadmap.estimatedWeeks ? ` · ~${weightRoadmap.estimatedWeeks} wks` : ""
                          }`}
                    </span>
                  )}
                </div>

                {weightRoadmap ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2.5 rounded-xl bg-black/40 border border-gray-800">
                        <p className="text-[10px] text-gray-400 uppercase font-semibold">Starting</p>
                        <p className="text-base font-black text-gray-200 mt-0.5">{weightRoadmap.startKg} kg</p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-black/40 border border-[#E50914]/40">
                        <p className="text-[10px] text-gray-400 uppercase font-semibold">Current</p>
                        <p className="text-base font-black text-white mt-0.5">{weightRoadmap.currentKg} kg</p>
                        {weightRoadmap.changedSoFarKg !== 0 && (
                          <p
                            className={`text-[10px] font-bold ${
                              (weightRoadmap.direction === "lose" && weightRoadmap.changedSoFarKg < 0) ||
                              (weightRoadmap.direction === "gain" && weightRoadmap.changedSoFarKg > 0)
                                ? "text-emerald-400"
                                : "text-amber-400"
                            }`}
                          >
                            {weightRoadmap.changedSoFarKg > 0 ? "+" : ""}
                            {weightRoadmap.changedSoFarKg} kg so far
                          </p>
                        )}
                      </div>
                      <div className="p-2.5 rounded-xl bg-black/40 border border-emerald-500/30">
                        <p className="text-[10px] text-gray-400 uppercase font-semibold">Target Goal</p>
                        <div className="flex items-center justify-center gap-1 mt-0.5">
                          <input
                            type="number"
                            step="0.5"
                            min="30"
                            max="300"
                            value={targetWeightInput}
                            onChange={(e) => setTargetWeightInput(e.target.value)}
                            onBlur={handleSaveTargetWeight}
                            aria-label="Target weight in kg"
                            className="w-16 bg-gray-900 border border-gray-700 rounded-lg px-1.5 py-0.5 text-center text-sm font-black text-emerald-400 focus:outline-none focus:border-emerald-500"
                          />
                          <span className="text-xs font-bold text-emerald-400">kg</span>
                        </div>
                      </div>
                    </div>

                    {/* Goal Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-gray-300 font-medium">
                          {weightRoadmap.direction === "lose"
                            ? `Weight Loss Progress (${weightRoadmap.startKg} kg → ${weightRoadmap.targetKg} kg)`
                            : weightRoadmap.direction === "gain"
                            ? `Weight Gain Progress (${weightRoadmap.startKg} kg → ${weightRoadmap.targetKg} kg)`
                            : `Weight Maintenance Stability (Target ${weightRoadmap.targetKg} kg)`}
                        </span>
                        <span className="font-extrabold text-emerald-400">{weightRoadmap.progressPercent}%</span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-gray-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#E50914] via-amber-500 to-emerald-400 transition-all duration-500"
                          style={{ width: `${weightRoadmap.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">
                    Log your current weight below to start tracking your weight curve and BMI progress.
                  </p>
                )}

                {/* Weight Trend Mini Chart */}
                {weightChartData.length > 0 && (
                  <div className="h-32 pt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={weightChartData}>
                        <defs>
                          <linearGradient id="weightCurveGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#E50914" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#E50914" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "#9ca3af", fontSize: 10 }}
                          axisLine={{ stroke: "#1f2937" }}
                          tickLine={false}
                        />
                        <YAxis
                          domain={["dataMin - 2", "dataMax + 2"]}
                          tick={{ fill: "#9ca3af", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          width={34}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "rgba(17, 24, 39, 0.95)",
                            border: "1px solid #374151",
                            borderRadius: "10px",
                            fontSize: 11,
                            color: "#fff",
                          }}
                          formatter={(val: any) => [`${val} kg`, "Weight"]}
                        />
                        {weightRoadmap?.targetKg && (
                          <ReferenceLine
                            y={weightRoadmap.targetKg}
                            stroke="#10b981"
                            strokeDasharray="4 4"
                            label={{
                              value: `Goal ${weightRoadmap.targetKg}kg`,
                              position: "insideTopRight",
                              fill: "#34d399",
                              fontSize: 10,
                            }}
                          />
                        )}
                        <Area
                          type="monotone"
                          dataKey="weightKg"
                          stroke="#E50914"
                          strokeWidth={2.5}
                          fill="url(#weightCurveGrad)"
                          activeDot={{ r: 4, fill: "#fff", stroke: "#E50914", strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Log Weight Input Row */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-800">
                <input
                  type="date"
                  max={today}
                  value={weightDateInput}
                  onChange={(e) => setWeightDateInput(e.target.value)}
                  className="bg-gray-950 border border-gray-700 rounded-xl px-2.5 py-1.5 text-xs text-gray-200"
                />
                <input
                  type="number"
                  step="0.1"
                  min="20"
                  max="400"
                  placeholder="Weight (kg)"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  className="flex-1 min-w-[110px] bg-gray-950 border border-gray-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#E50914]"
                />
                <button
                  type="button"
                  onClick={handleLogWeight}
                  className="px-4 py-1.5 rounded-xl bg-[#E50914] hover:bg-[#f40612] text-white text-xs font-extrabold shadow-md shadow-[#E50914]/25 transition"
                >
                  + Log Weight
                </button>
              </div>
            </div>

            {/* RIGHT 5 COLS: DAILY HYDRATION, WORKOUT & GOAL HABITS */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              {/* Hydration Card */}
              <div className="p-4 rounded-2xl bg-gray-900/75 border border-gray-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-sky-400" />
                    <h3 className="text-xs font-bold text-white">Today&apos;s Hydration</h3>
                  </div>
                  <span className="text-xs font-extrabold text-sky-400">
                    {todayWaterLitres} / {waterGoalLitres} L
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-300 transition-all"
                    style={{ width: `${Math.min(100, Math.round((todayWaterLitres / waterGoalLitres) * 100))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-gray-400">
                    {Math.round(todayWaterLitres * 4)} of {Math.round(waterGoalLitres * 4)} glasses (250ml)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAdjustWater(-0.25)}
                      className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
                      aria-label="Remove 250ml water"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdjustWater(0.25)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-xs font-bold"
                    >
                      <Plus className="w-3.5 h-3.5" /> 250ml
                    </button>
                  </div>
                </div>
              </div>

              {/* Workout & Movement Streak Card */}
              <div className="p-4 rounded-2xl bg-gray-900/75 border border-gray-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Dumbbell className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-white">Weekly Workouts &amp; Movement</h3>
                  </div>
                  <span className="text-xs font-extrabold text-emerald-400">
                    {workoutsLast7Days} / {workoutTargetPerWeek} days
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-all"
                    style={{
                      width: `${Math.min(100, Math.round((workoutsLast7Days / Math.max(1, workoutTargetPerWeek)) * 100))}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-gray-400">
                    {todayWorkoutDone ? "Great job completing today's session!" : "Did you work out or train today?"}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleWorkoutToday}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                      todayWorkoutDone
                        ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                        : "bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200"
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    {todayWorkoutDone ? "Done Today" : "Mark Workout"}
                  </button>
                </div>
              </div>

              {/* Goal-Specific Live Insight Box */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#E50914]/15 via-gray-900 to-gray-900 border border-[#E50914]/30 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-white">
                  <Sparkles className="w-3.5 h-3.5 text-[#E50914]" />
                  <span>{activeGoalMeta.label} Focus</span>
                </div>
                <p className="text-[11px] text-gray-300 leading-relaxed">
                  {activeGoalKey === "fat_loss" &&
                    `Aim for ${goals.calories} kcal/day and at least ${goals.protein}g protein + ${goals.fibre}g fibre so you stay full while burning fat steadily.`}
                  {activeGoalKey === "muscle_gain" &&
                    `Hit ${goals.protein}g protein (${
                      profile?.weightKg ? `${Math.round((goals.protein / profile.weightKg) * 10) / 10}g/kg` : "1.8g/kg"
                    }) and ${goals.calories} kcal/day alongside ${workoutTargetPerWeek} strength sessions/week.`}
                  {activeGoalKey === "maintain" &&
                    `Keep your weight within ±1.5 kg of ${
                      weightRoadmap?.targetKg ?? profile?.weightKg ?? 60
                    } kg while hitting ${goals.protein}g protein daily.`}
                  {activeGoalKey === "athletic_performance" &&
                    `Fuel your sessions with ${goals.carbohydrates}g carbs, ${goals.protein}g protein, and ${waterGoalLitres}L hydration daily.`}
                  {activeGoalKey === "wellness_vitality" &&
                    `Prioritize ${goals.fibre}g+ gut fibre, ${goals.iron ?? 18}mg iron, ${goals.calcium ?? 1000}mg calcium, and ${waterGoalLitres}L water every day.`}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* BMI & Body Metrics Spectrum Bar */}
        <section className="p-5 rounded-3xl glass-card border border-gray-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#E50914]" />
                <h2 className="text-sm font-bold text-white">Body Mass Index (BMI) &amp; Weight Spectrum</h2>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {bmiInfo && profile
                  ? `Based on ${profile.heightCm} cm & ${profile.weightKg} kg • Healthy range for your height: ${bmiInfo.healthyMinKg}–${bmiInfo.healthyMaxKg} kg`
                  : "Add your height and weight in Profile to view your personalized BMI progress bar."}
              </p>
            </div>

            {bmiInfo ? (
              <div className="flex items-center gap-2">
                <span className={`text-xl font-black ${bmiInfo.colorClass}`}>{bmiInfo.bmi}</span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${bmiInfo.badgeClass}`}>
                  {bmiInfo.category}
                </span>
              </div>
            ) : (
              <Link
                href="/profile"
                className="px-3 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold"
              >
                Set Height &amp; Weight →
              </Link>
            )}
          </div>

          {bmiInfo && (
            <div className="space-y-1.5 pt-1">
              <div className="relative h-3 w-full rounded-full overflow-visible bg-gray-800 flex">
                <div className="h-full w-[20%] bg-sky-500/80 rounded-l-full" title="Underweight (<18.5)" />
                <div className="h-full w-[30%] bg-emerald-500/85" title="Healthy (18.5–24.9)" />
                <div className="h-full w-[23%] bg-amber-500/85" title="Overweight (25–29.9)" />
                <div className="h-full w-[27%] bg-rose-500/85 rounded-r-full" title="Obese (30+)" />
                <div
                  className="absolute -top-1.5 w-3.5 h-6 rounded-full bg-white border-2 border-[#101012] shadow-[0_0_10px_rgba(255,255,255,0.9)] -translate-x-1/2 transition-all duration-500"
                  style={{ left: `${bmiInfo.markerPercent}%` }}
                  title={`Your BMI: ${bmiInfo.bmi}`}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 font-medium px-0.5">
                <span className="text-sky-400">&lt;18.5 Underweight</span>
                <span className="text-emerald-400">18.5–24.9 Healthy</span>
                <span className="text-amber-400">25–29.9 Overweight</span>
                <span className="text-rose-400">30+ Obese</span>
              </div>
            </div>
          )}
        </section>

        {summary.loggedDays === 0 ? (
          <div className="p-8 rounded-3xl glass-card border border-gray-800 text-center space-y-3">
            <Activity className="w-10 h-10 text-brand-400 mx-auto opacity-80" />
            <p className="text-base font-bold text-white">Nothing logged in this period yet</p>
            <p className="text-xs text-gray-400 max-w-md mx-auto">
              Log your first meal on the Home or Food Log screen to unlock interactive protein, calorie, macro, and
              micronutrient charts.
            </p>
            <Link
              href="/"
              className="inline-block mt-2 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold"
            >
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <>
            {/* Top KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                icon={<CalendarCheck className="w-4 h-4 text-sky-400" />}
                label="Days logged"
                value={`${summary.loggedDays} / ${days}`}
                sub={`${Math.round((summary.loggedDays / days) * 100)}% logging consistency`}
                percent={Math.round((summary.loggedDays / days) * 100)}
                barColor="bg-sky-400"
              />
              <KpiCard
                icon={<Zap className="w-4 h-4 text-emerald-400" />}
                label="Avg protein / logged day"
                value={summary.averageProtein === null ? "—" : `${summary.averageProtein} g`}
                sub={`Target: ${goals.protein} g / day`}
                percent={
                  summary.averageProtein !== null
                    ? Math.min(100, Math.round((summary.averageProtein / goals.protein) * 100))
                    : 0
                }
                barColor="bg-emerald-400"
              />
              <KpiCard
                icon={<Flame className="w-4 h-4 text-amber-400" />}
                label="Avg calories / logged day"
                value={summary.averageCalories === null ? "—" : `${summary.averageCalories} kcal`}
                sub={`Target: ${goals.calories} kcal / day`}
                percent={
                  summary.averageCalories !== null
                    ? Math.min(100, Math.round((summary.averageCalories / goals.calories) * 100))
                    : 0
                }
                barColor="bg-amber-400"
              />
              <KpiCard
                icon={<Trophy className="w-4 h-4 text-violet-400" />}
                label="Protein goal hit"
                value={`${summary.proteinGoalDays} day${summary.proteinGoalDays === 1 ? "" : "s"}`}
                sub={
                  summary.proteinGoalPercent !== null
                    ? `${summary.proteinGoalPercent}% of logged days`
                    : "Keep logging!"
                }
                percent={summary.proteinGoalPercent ?? 0}
                barColor="bg-violet-400"
              />
            </div>

            {/* Row 1: Daily Protein Bar Chart + Daily Calorie Smooth Area Chart */}
            <div className="grid lg:grid-cols-2 gap-4">
              {/* Daily Protein Chart */}
              <section
                aria-label="Daily protein chart"
                className="p-5 rounded-3xl glass-card border border-gray-800 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-emerald-400" />
                      <h2 className="text-sm font-bold text-white">Daily Protein Intake (g)</h2>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Bright green bars reached your {goals.protein}g target. Unlogged days are left blank, never 0.
                    </p>
                  </div>
                </div>

                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={richChartData}
                      onClick={(state: any) => {
                        const clickedDate = state?.activePayload?.[0]?.payload?.date;
                        if (clickedDate) setSelected(clickedDate);
                      }}
                    >
                      <defs>
                        <linearGradient id="proteinGoalGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={1} />
                          <stop offset="100%" stopColor="#059669" stopOpacity={0.85} />
                        </linearGradient>
                        <linearGradient id="proteinPartialGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#0284c7" stopOpacity={0.75} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#9ca3af", fontSize: 10 }}
                        axisLine={{ stroke: "#1f2937" }}
                        tickLine={false}
                        interval={days > 14 ? 3 : days > 7 ? 1 : 0}
                      />
                      <YAxis
                        tick={{ fill: "#9ca3af", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={34}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        contentStyle={{
                          background: "rgba(17, 24, 39, 0.95)",
                          border: "1px solid #374151",
                          borderRadius: "12px",
                          fontSize: 12,
                          color: "#fff",
                        }}
                        formatter={(val: any) => (val === null ? ["Not logged", "Protein"] : [`${val} g`, "Protein"])}
                      />
                      <ReferenceLine
                        y={goals.protein}
                        stroke="#10b981"
                        strokeDasharray="5 5"
                        strokeWidth={1.5}
                        label={{
                          value: `Goal ${goals.protein}g`,
                          position: "insideTopRight",
                          fill: "#34d399",
                          fontSize: 10,
                        }}
                      />
                      <Bar dataKey="protein" radius={[6, 6, 0, 0]} maxBarSize={36}>
                        {richChartData.map((entry, idx) => (
                          <Cell
                            key={`cell-${idx}`}
                            fill={entry.proteinGoalMet ? "url(#proteinGoalGrad)" : "url(#proteinPartialGrad)"}
                            cursor="pointer"
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Daily Calories Smooth Area Chart */}
              <section
                aria-label="Daily calorie trend"
                className="p-5 rounded-3xl glass-card border border-gray-800 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Flame className="w-4 h-4 text-amber-400" />
                      <h2 className="text-sm font-bold text-white">Daily Calorie Trend (kcal)</h2>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Smooth energy intake curve against your {goals.calories} kcal target. Tap a point to inspect.
                    </p>
                  </div>
                </div>

                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={richChartData}
                      onClick={(state: any) => {
                        const clickedDate = state?.activePayload?.[0]?.payload?.date;
                        if (clickedDate) setSelected(clickedDate);
                      }}
                    >
                      <defs>
                        <linearGradient id="calorieAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.45} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#9ca3af", fontSize: 10 }}
                        axisLine={{ stroke: "#1f2937" }}
                        tickLine={false}
                        interval={days > 14 ? 3 : days > 7 ? 1 : 0}
                      />
                      <YAxis
                        tick={{ fill: "#9ca3af", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "rgba(17, 24, 39, 0.95)",
                          border: "1px solid #374151",
                          borderRadius: "12px",
                          fontSize: 12,
                          color: "#fff",
                        }}
                        formatter={(val: any) =>
                          val === null ? ["Not logged", "Calories"] : [`${val} kcal`, "Calories"]
                        }
                      />
                      <ReferenceLine
                        y={goals.calories}
                        stroke="#f59e0b"
                        strokeDasharray="5 5"
                        strokeWidth={1.5}
                        label={{
                          value: `Target ${goals.calories}`,
                          position: "insideTopRight",
                          fill: "#fbbf24",
                          fontSize: 10,
                        }}
                      />
                      <Area
                        type="monotone"
                        connectNulls
                        dataKey="calories"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#calorieAreaGrad)"
                        activeDot={{ r: 5, fill: "#fbbf24", stroke: "#111827", strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>

            {/* Row 2: Macro Energy Donut + Daily Macro Composition Stacked Bars */}
            <div className="grid lg:grid-cols-5 gap-4">
              {/* Macro Energy Donut */}
              <section className="lg:col-span-2 p-5 rounded-3xl glass-card border border-gray-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <PieIcon className="w-4 h-4 text-sky-400" />
                    <h2 className="text-sm font-bold text-white">Average Macro Energy Split</h2>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Share of calories from Protein, Carbs, and Fat on logged days
                  </p>
                </div>

                {macroSplitData.length === 0 ? (
                  <p className="text-xs text-gray-500 py-12 text-center">No macro values recorded yet.</p>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={macroSplitData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={52}
                            outerRadius={76}
                            paddingAngle={4}
                            stroke="none"
                          >
                            {macroSplitData.map((m) => (
                              <Cell key={m.name} fill={m.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "rgba(17, 24, 39, 0.95)",
                              border: "1px solid #374151",
                              borderRadius: "12px",
                              fontSize: 12,
                              color: "#fff",
                            }}
                            formatter={(val: any, _name: any, item: any) => [
                              `${item.payload.grams}g (${val} kcal · ${item.payload.pct}%)`,
                              item.payload.name,
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-3 gap-2 w-full pt-1">
                      {macroSplitData.map((m) => (
                        <div
                          key={m.name}
                          className="p-2 rounded-xl bg-gray-900/70 border border-gray-800 text-center"
                        >
                          <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-300 font-medium">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                            {m.name}
                          </div>
                          <div className="text-sm font-extrabold text-white mt-0.5">{m.pct}%</div>
                          <div className="text-[10px] text-gray-400">{m.grams}g / day</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Daily Macros Stacked Bar Chart */}
              <section className="lg:col-span-3 p-5 rounded-3xl glass-card border border-gray-800 space-y-3">
                <div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-brand-400" />
                    <h2 className="text-sm font-bold text-white">Daily Macro Breakdown (g)</h2>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Stacked grams of Protein, Carbohydrates, and Fat across each logged day
                  </p>
                </div>

                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={richChartData}>
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#9ca3af", fontSize: 10 }}
                        axisLine={{ stroke: "#1f2937" }}
                        tickLine={false}
                        interval={days > 14 ? 3 : days > 7 ? 1 : 0}
                      />
                      <YAxis
                        tick={{ fill: "#9ca3af", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={34}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        contentStyle={{
                          background: "rgba(17, 24, 39, 0.95)",
                          border: "1px solid #374151",
                          borderRadius: "12px",
                          fontSize: 12,
                          color: "#fff",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                      <Bar dataKey="protein" name="Protein (g)" stackId="macros" fill="#10b981" maxBarSize={32} />
                      <Bar dataKey="carbs" name="Carbs (g)" stackId="macros" fill="#06b6d4" maxBarSize={32} />
                      <Bar
                        dataKey="fat"
                        name="Fat (g)"
                        stackId="macros"
                        fill="#f59e0b"
                        radius={[5, 5, 0, 0]}
                        maxBarSize={32}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>

            {/* Row 3: Frequently Eaten Visual Bars + Nutrient Gaps */}
            <div className="grid md:grid-cols-2 gap-4">
              <section className="p-5 rounded-3xl glass-card border border-gray-800 space-y-3">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-brand-400" />
                  <h2 className="text-sm font-bold text-white">Most Frequently Logged Foods</h2>
                </div>
                <div className="space-y-2.5">
                  {summary.frequentFoods.map((f, i) => {
                    const widthPct = Math.max(12, Math.round((f.count / maxFreqCount) * 100));
                    return (
                      <div key={f.name} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-200 font-medium">
                            {i + 1}. {f.name}
                          </span>
                          <span className="text-brand-400 font-semibold">{f.count}×</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-sky-400"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="p-5 rounded-3xl glass-card border border-gray-800 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-bold text-white">Nutrients Averaging Under 70%</h2>
                </div>
                {summary.commonGaps.length === 0 ? (
                  <p className="text-xs text-emerald-300 py-4">
                    No consistent nutrient gaps found across your logged days!
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {summary.commonGaps.map((g) => (
                      <div key={g.key} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-200 font-medium">{NUTRIENT_LABEL[g.key] ?? g.key}</span>
                          <span className="text-amber-400 font-semibold">{g.averagePercent}% of target</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500"
                            style={{ width: `${Math.min(100, Math.max(6, g.averagePercent))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-gray-500 pt-1">
                  Based only on foods with recorded values. Missing data is never treated as zero.
                </p>
              </section>
            </div>
          </>
        )}

        {/* Row 4: Selected Day Inspector + Micronutrient & Hair-Health Radar */}
        <section
          aria-label="General and hair health nutrition"
          className="p-5 rounded-3xl glass-card border border-gray-800 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-white">
                Day Inspector &amp; General / Hair-Health Nutrient Radar
              </h2>
              <p className="text-xs text-gray-400">
                Inspect any calendar date or click a bar on the charts above
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                aria-label="Previous day"
                onClick={() => setSelected(shiftDateIso(selected, -1))}
                className="px-2.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold"
              >
                ‹
              </button>
              <input
                type="date"
                aria-label="Select date"
                max={today}
                value={selected}
                onChange={(e) => e.target.value && setSelected(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-1.5 text-xs text-white"
              />
              <button
                aria-label="Next day"
                disabled={selected >= today}
                onClick={() => setSelected(shiftDateIso(selected, 1))}
                className="px-2.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 items-center">
            {/* Radar Chart */}
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "#d1d5db", fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 9 }} />
                  <Radar
                    name="% of Daily Target"
                    dataKey="percent"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="#10b981"
                    fillOpacity={0.35}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(17, 24, 39, 0.95)",
                      border: "1px solid #374151",
                      borderRadius: "12px",
                      fontSize: 12,
                      color: "#fff",
                    }}
                    formatter={(_val: any, _name: any, item: any) => {
                      const p = item.payload;
                      if (p.actual === null || p.actual === undefined) return ["No data recorded", p.subject];
                      return [
                        `${p.actual} ${p.unit}${p.target ? ` / ${p.target} ${p.unit} (${p.rawPercent}%)` : ""}`,
                        p.subject,
                      ];
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Nutrient Progress Bars & Day Log List */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                {HEALTH_INDICATORS.map((h) => {
                  const v = dayAgg.totals[h.key as keyof typeof dayAgg.totals];
                  const t = goals[h.key] as number | null | undefined;
                  const partial = dayAgg.incompleteNutrients.includes(h.key as any);
                  const pct = t && v != null && t > 0 ? Math.min(100, Math.round((v / t) * 100)) : 0;

                  return (
                    <div key={h.key} className="p-2.5 rounded-xl bg-gray-900/70 border border-gray-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 font-medium">{h.label}</span>
                        <span className="text-[11px] font-bold text-white">
                          {v === null || v === undefined ? (
                            <span className="text-gray-500 font-normal">No data</span>
                          ) : (
                            <>
                              {v} {h.unit}
                              {t ? <span className="text-gray-500 font-normal"> / {t}</span> : null}
                            </>
                          )}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: h.color }}
                        />
                      </div>
                      {partial && v != null && (
                        <p className="text-[10px] text-amber-400">Some foods lack this value</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {dayLogs.length === 0 ? (
                <p className="text-xs text-gray-500 italic pt-1">Nothing was logged on {selected}.</p>
              ) : (
                <div className="p-3 rounded-2xl bg-gray-900/50 border border-gray-800 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-300">
                      Logged on <b>{selected}</b>: Protein{" "}
                      <b className="text-brand-400">
                        {dayAgg.totals.protein ?? "unknown"}
                        {dayAgg.totals.protein !== null && " g"}
                      </b>{" "}
                      · Calories <b>{dayAgg.totals.calories ?? "unknown"}</b>
                    </span>
                    <Link href="/food-log" className="text-brand-400 hover:underline font-medium">
                      Edit in Food Log →
                    </Link>
                  </div>
                  <ul className="space-y-1 text-xs max-h-28 overflow-y-auto pr-1">
                    {dayLogs.map((l) => (
                      <li key={l.id} className="flex justify-between text-gray-400">
                        <span className="capitalize truncate">
                          {l.mealType}: {l.foodNameSnapshot} ({l.servingQuantity} {l.servingUnit})
                        </span>
                        <span className="text-gray-300 font-medium flex-shrink-0 ml-2">
                          {l.nutritionSnapshot.protein ?? "—"} g
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 text-[11px] text-gray-400 pt-1">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-sky-400" />
            <p>
              These totals come only from foods with recorded values and can understate intake. A food diary cannot
              diagnose a deficiency, and meeting targets supports general health but cannot guarantee thicker hair. If
              hair loss persists, speak with a health professional.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  percent,
  barColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  percent: number;
  barColor: string;
}) {
  return (
    <div className="p-4 rounded-2xl glass-card border border-gray-800 flex flex-col justify-between space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400 font-medium">{label}</span>
        <div className="p-1.5 rounded-lg bg-gray-800/80 border border-gray-700/60">{icon}</div>
      </div>
      <div>
        <p className="text-xl font-extrabold text-white">{value}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
      </div>
      <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(4, Math.min(100, percent))}%` }} />
      </div>
    </div>
  );
}
