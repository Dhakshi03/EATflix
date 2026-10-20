"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navigation/Navbar";
import {
  ActivityLevel,
  BiologicalSex,
  DietaryPreference,
  FitnessGoal,
  NutritionGoal,
  UserProfile,
} from "@/lib/nutrition/types";
import {
  calculateBmiInfo,
  calculateRecommendedGoals,
  calculateWeightGoalRoadmap,
} from "@/lib/nutrition/calculator";
import { localDateIso } from "@/lib/nutrition/combination";
import {
  getNutritionGoals,
  getUserProfile,
  saveNutritionGoals,
  saveUserProfile,
  seedStarterDataIfEmpty,
} from "@/lib/storage/indexed-db";
import { exportUserDataJSON, importUserDataJSON } from "@/lib/storage/export-import";
import { clearEverything, clearFoodLogs } from "@/lib/storage/maintenance";
import { CloudSyncCard } from "@/components/sync/CloudSyncCard";
import { getSupabaseClient } from "@/lib/sync/supabase-client";
import {
  ensureCleanWhenSignedOut,
  GUEST_PROFILE_ACTIVE_KEY,
  signOutAndClearLocalData,
} from "@/lib/sync/sync-engine";
import {
  Download,
  Upload,
  Trash2,
  Info,
  User,
  Target,
  Cloud,
  Compass,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Check,
  Lock,
  Pencil,
  LogOut,
  LogIn,
  Scale,
  Droplets,
  Dumbbell,
  Flame,
} from "lucide-react";

const GOAL_FIELDS: { key: keyof NutritionGoal; label: string; unit: string; required: boolean }[] = [
  { key: "protein", label: "Protein", unit: "g", required: true },
  { key: "calories", label: "Calories", unit: "kcal", required: true },
  { key: "carbohydrates", label: "Carbohydrates", unit: "g", required: true },
  { key: "totalFat", label: "Fat", unit: "g", required: true },
  { key: "fibre", label: "Fibre", unit: "g", required: true },
  { key: "iron", label: "Iron", unit: "mg", required: false },
  { key: "calcium", label: "Calcium", unit: "mg", required: false },
  { key: "zinc", label: "Zinc", unit: "mg", required: false },
  { key: "vitB12", label: "Vitamin B12", unit: "mcg", required: false },
  { key: "vitD", label: "Vitamin D", unit: "IU", required: false },
  { key: "folate", label: "Folate", unit: "mcg", required: false },
];

const SLIDES = [
  { id: 0, title: "About You", subtitle: "Name, age & body", icon: User },
  { id: 1, title: "Your Goal", subtitle: "Goal & questions", icon: Compass },
  { id: 2, title: "Daily Plan", subtitle: "Tailored macros", icon: Target },
  { id: 3, title: "Cloud Sync", subtitle: "Save & sync", icon: Cloud },
] as const;

const GENDER_OPTIONS: { value: BiologicalSex; label: string }[] = [
  { value: "female", label: "Female / Woman" },
  { value: "male", label: "Male / Man" },
  { value: "non_binary", label: "Non-binary" },
  { value: "transgender_female", label: "Transgender Woman / Transfeminine" },
  { value: "transgender_male", label: "Transgender Man / Transmasculine" },
  { value: "genderqueer", label: "Genderqueer / Genderfluid" },
  { value: "agender", label: "Agender" },
  { value: "intersex", label: "Intersex" },
  { value: "other", label: "Other / Self-describe" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const GOAL_CARDS: {
  value: FitnessGoal;
  emoji: string;
  title: string;
  subtitle: string;
  badge: string;
  questionsPrompt: string;
  focusOptions: string[];
}[] = [
  {
    value: "fat_loss",
    emoji: "🔥",
    title: "Lose Weight & Burn Fat",
    subtitle: "Calorie deficit with high protein & fibre so you stay full while losing fat",
    badge: "Weight Loss",
    questionsPrompt: "Customize your weight-loss pace & habits",
    focusOptions: [
      "Control evening snacking",
      "High-protein satiety",
      "Preserve lean muscle",
      "Cut sweet cravings",
      "Quick 10-min meals",
    ],
  },
  {
    value: "muscle_gain",
    emoji: "💪",
    title: "Build Muscle & Gain Weight",
    subtitle: "Clean calorie surplus + 1.8g/kg protein to build lean strength and size",
    badge: "Muscle & Gain",
    questionsPrompt: "Customize your muscle & weight-gain plan",
    focusOptions: [
      "High protein (1.8g/kg+)",
      "Post-workout recovery",
      "Calorie-dense shakes",
      "Strength & gym progression",
      "Budget high-protein foods",
    ],
  },
  {
    value: "maintain",
    emoji: "⚖️",
    title: "Maintain Weight & Tone",
    subtitle: "Stay at your healthiest weight while improving body composition & daily energy",
    badge: "Maintenance",
    questionsPrompt: "Customize your maintenance & body-toning focus",
    focusOptions: [
      "Body recomposition",
      "Consistent daily protein",
      "Steady all-day energy",
      "Balanced home meals",
      "Mindful portions",
    ],
  },
  {
    value: "athletic_performance",
    emoji: "⚡",
    title: "Stamina & Athletic Energy",
    subtitle: "Fuel workouts, sports, and active days with optimal carbs, protein, and hydration",
    badge: "Performance",
    questionsPrompt: "Customize your training & stamina fuel",
    focusOptions: [
      "Endurance & stamina carbs",
      "Fast muscle recovery",
      "High hydration & electrolytes",
      "Iron & oxygen support",
      "Pre/post-workout nutrition",
    ],
  },
  {
    value: "wellness_vitality",
    emoji: "🌿",
    title: "Gut, Hair/Skin & Micronutrients",
    subtitle: "Prioritize 30g+ fibre, iron, B12, zinc, folate & calcium for long-term vitality",
    badge: "Holistic Health",
    questionsPrompt: "Choose the wellness areas that matter most to you",
    focusOptions: [
      "Hair & Iron Boost",
      "Gut & High Fibre (30g+)",
      "Bone & Calcium + Vit D",
      "Hormonal / PCOS Balance",
      "Glowing Skin & Hydration",
    ],
  },
];

function formatGenderLabel(sex?: BiologicalSex | null): string {
  if (!sex) return "—";
  return GENDER_OPTIONS.find((g) => g.value === sex)?.label || sex.replace(/_/g, " ");
}

function formatGoalLabel(goal?: FitnessGoal | null): string {
  const found = GOAL_CARDS.find((g) => g.value === goal);
  return found ? found.title : "Maintain Weight & Tone";
}

function getMissingBasicFields(p: UserProfile): string[] {
  const missing: string[] = [];
  if (!p.displayName || !p.displayName.trim()) missing.push("Display name");
  if (p.age == null || !Number.isFinite(p.age) || p.age < 10 || p.age > 120) missing.push("Age (10–120)");
  if (!p.biologicalSex) missing.push("Gender");
  if (p.heightCm == null || !Number.isFinite(p.heightCm) || p.heightCm < 50 || p.heightCm > 260) {
    missing.push("Height in cm (50–260)");
  }
  if (p.weightKg == null || !Number.isFinite(p.weightKg) || p.weightKg < 20 || p.weightKg > 400) {
    missing.push("Weight in kg (20–400)");
  }
  return missing;
}

function getMissingGoalFields(p: UserProfile): string[] {
  const missing = getMissingBasicFields(p);
  if (!p.activityLevel) missing.push("Activity level");
  return missing;
}

export default function ProfilePage() {
  const [isWizardMode, setIsWizardMode] = useState<boolean>(false);
  const [step, setStep] = useState<number>(0);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [goals, setGoals] = useState<Record<string, string>>({});
  const [exclusions, setExclusions] = useState("");
  const [autoUpdateTargets, setAutoUpdateTargets] = useState(true);
  const [step1Saved, setStep1Saved] = useState(false);
  const [step2Saved, setStep2Saved] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [quickWeightInput, setQuickWeightInput] = useState<string>("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setAuthEmail(data.session?.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthEmail(session?.user?.email ?? null);
    });
    return () => {
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const handleGlobalSignOut = async () => {
    await signOutAndClearLocalData();
    setAuthEmail(null);
    await load(false);
    setStep(0);
    setIsWizardMode(true);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("eatflix:open-auth-modal"));
    }
    setMsg({
      type: "ok",
      text: "Signed out and cleared your profile from this screen. Sign back in anytime to restore your account.",
    });
  };

  const goalsToRecord = (g: NutritionGoal): Record<string, string> => {
    const s: Record<string, string> = {};
    for (const f of GOAL_FIELDS) {
      const v = g[f.key];
      s[f.key] = v == null ? "" : String(v);
    }
    return s;
  };

  const goToStep = (nextStep: number) => {
    setStep(nextStep);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("eatflix_profile_step", String(nextStep));
    }
  };

  const load = async (preserveCurrentStep = false) => {
    await seedStarterDataIfEmpty();
    await ensureCleanWhenSignedOut();
    const p = await getUserProfile();
    const g = await getNutritionGoals();
    setProfile(p);
    setQuickWeightInput(p.weightKg != null ? String(p.weightKg) : "");
    setExclusions(p.allergiesAndExclusions.join(", "));
    const gRec = goalsToRecord(g);
    setGoals(gRec);

    const basicReady = getMissingBasicFields(p).length === 0;
    const fullReady = getMissingGoalFields(p).length === 0;
    const isOAuthReturn =
      typeof window !== "undefined" &&
      (window.location.search.includes("step=2") ||
        window.location.search.includes("step=3") ||
        window.location.hash.includes("access_token") ||
        window.localStorage.getItem("eatflix_oauth_pending") === "true");

    if (isOAuthReturn) {
      window.localStorage.removeItem("eatflix_oauth_pending");
      setStep1Saved(basicReady);
      setStep2Saved(fullReady);
      if (fullReady) {
        setIsWizardMode(false);
      } else {
        setIsWizardMode(true);
        goToStep(3);
      }
      return;
    }

    setStep1Saved(basicReady);
    setStep2Saved(fullReady);

    if (!preserveCurrentStep) {
      setIsWizardMode(!fullReady);
      if (!fullReady) {
        setStep(basicReady ? 1 : 0);
      }
    }
  };

  useEffect(() => {
    load(false);
    const onSyncComplete = () => {
      load(false);
    };
    window.addEventListener("nutritrack:sync-complete", onSyncComplete);
    return () => {
      window.removeEventListener("nutritrack:sync-complete", onSyncComplete);
    };
  }, []);

  if (!profile) return <div className="p-8 text-gray-400">Loading…</div>;

  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
  const setP = (patch: Partial<UserProfile>) => {
    setProfile((p) => (p ? { ...p, ...patch } : p));
  };

  const toggleFocusArea = (area: string) => {
    const current = profile.focusAreas || [];
    const next = current.includes(area) ? current.filter((x) => x !== area) : [...current, area];
    setP({ focusAreas: next });
  };

  const missingBasic = getMissingBasicFields(profile);
  const isBasicValid = missingBasic.length === 0;
  const missingGoal = getMissingGoalFields(profile);
  const isGoalValid = missingGoal.length === 0;

  const recommendation = calculateRecommendedGoals(profile);
  const bmiInfo = calculateBmiInfo(profile.heightCm, profile.weightKg);
  const weightRoadmap = calculateWeightGoalRoadmap(profile);
  const activeGoalCard = GOAL_CARDS.find((g) => g.value === (profile.fitnessGoal || "maintain")) || GOAL_CARDS[2];

  const applyRecommendedToState = (customProfile?: UserProfile) => {
    const rec = calculateRecommendedGoals(customProfile || profile);
    setGoals(goalsToRecord(rec.goals));
    return rec;
  };

  const parseAndValidateGoals = (goalSource: Record<string, string>): NutritionGoal | null => {
    const g: any = {};
    for (const f of GOAL_FIELDS) {
      const n = numOrNull(goalSource[f.key] ?? "");
      if (n === null) {
        if (f.required) {
          setMsg({ type: "err", text: `${f.label} target is required.` });
          return null;
        }
        g[f.key] = null;
        continue;
      }
      if (!Number.isFinite(n) || n < 0 || (f.required && n === 0)) {
        setMsg({ type: "err", text: `${f.label} must be a positive number.` });
        return null;
      }
      g[f.key] = n;
    }
    return g as NutritionGoal;
  };

  const canNavigateToStep = (targetStep: number): boolean => {
    if (targetStep === 0) return true;
    if (targetStep === 1) return step1Saved && isBasicValid;
    if (targetStep === 2) return step1Saved && isGoalValid;
    return step1Saved && isGoalValid && step2Saved;
  };

  const handleStepClick = (targetStep: number) => {
    if (targetStep === step) return;
    if (!canNavigateToStep(targetStep)) {
      if (!isBasicValid) {
        setMsg({
          type: "err",
          text: `Complete Step 1 (About You) first. Missing: ${missingBasic.join(", ")}.`,
        });
      } else if (!isGoalValid) {
        setMsg({
          type: "err",
          text: `Select your Goal & Activity Level in Step 2 before moving ahead.`,
        });
      } else {
        setMsg({
          type: "err",
          text: "Save your Daily Plan in Step 3 before moving to Cloud Sync.",
        });
      }
      return;
    }
    setMsg(null);
    goToStep(targetStep);
  };

  // Step 0 -> Step 1 (Save Basic Info -> Go to Goal & Questions)
  const handleSaveBasicAndNext = async () => {
    setMsg(null);
    if (!isBasicValid) {
      setMsg({
        type: "err",
        text: `Please fill in all required fields: ${missingBasic.join(", ")}.`,
      });
      return;
    }

    const today = localDateIso();
    const existingHistory = profile.weightHistory || [];
    const nextHistory =
      profile.weightKg && existingHistory.length === 0
        ? [{ date: today, weightKg: profile.weightKg, note: "Starting weight" }]
        : existingHistory;

    const updatedProfile: UserProfile = {
      ...profile,
      displayName: profile.displayName.trim(),
      startingWeightKg: profile.startingWeightKg ?? profile.weightKg,
      weightHistory: nextHistory,
      allergiesAndExclusions: exclusions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    await saveUserProfile(updatedProfile);
    if (!authEmail && typeof window !== "undefined") {
      window.localStorage.setItem(GUEST_PROFILE_ACTIVE_KEY, "true");
    }
    setProfile(updatedProfile);
    setStep1Saved(true);
    setMsg({ type: "ok", text: "Basic details saved! Now choose your primary goal & preferences." });
    goToStep(1);
  };

  // Step 1 -> Step 2 (Save Goal & Relevant Qs -> Calculate Daily Plan)
  const handleSaveGoalQuestionsAndNext = async () => {
    setMsg(null);
    if (!profile.activityLevel) {
      setMsg({ type: "err", text: "Please select your Activity Level so we can calculate your calorie needs." });
      return;
    }

    const defaultTargetWeight =
      profile.targetWeightKg ??
      (profile.fitnessGoal === "fat_loss" && profile.weightKg
        ? Math.max(40, Math.round((profile.weightKg - 4) * 10) / 10)
        : profile.fitnessGoal === "muscle_gain" && profile.weightKg
        ? Math.round((profile.weightKg + 4) * 10) / 10
        : profile.weightKg ?? null);

    const updatedProfile: UserProfile = {
      ...profile,
      fitnessGoal: profile.fitnessGoal || "maintain",
      targetWeightKg: defaultTargetWeight,
      startingWeightKg: profile.startingWeightKg ?? profile.weightKg,
      weeklyPaceKg: profile.weeklyPaceKg ?? (profile.fitnessGoal === "fat_loss" ? 0.5 : 0.25),
      workoutDaysPerWeek: profile.workoutDaysPerWeek ?? 3,
      waterGoalLitres: profile.waterGoalLitres ?? 2.5,
    };

    await saveUserProfile(updatedProfile);
    if (!authEmail && typeof window !== "undefined") {
      window.localStorage.setItem(GUEST_PROFILE_ACTIVE_KEY, "true");
    }
    setProfile(updatedProfile);

    if (autoUpdateTargets) {
      const rec = calculateRecommendedGoals(updatedProfile);
      setGoals(goalsToRecord(rec.goals));
      await saveNutritionGoals(rec.goals);
      setStep2Saved(true);
      setMsg({
        type: "ok",
        text: `Goal saved! Calculated your personalized plan: ${rec.goals.calories} kcal & ${rec.goals.protein}g protein/day.`,
      });
    }

    goToStep(2);
  };

  // Step 2 -> Step 3 (Save Daily Plan -> Cloud Sync)
  const handleSavePlanAndNext = async () => {
    setMsg(null);
    const parsedGoals = parseAndValidateGoals(goals);
    if (!parsedGoals) return;

    await saveUserProfile(profile);
    await saveNutritionGoals(parsedGoals);
    setStep2Saved(true);
    setMsg({ type: "ok", text: "Daily nutrition plan saved! Connect Cloud Sync below to back up across devices." });
    goToStep(3);
  };

  const handleSavePlanAndFinish = async () => {
    setMsg(null);
    const parsedGoals = parseAndValidateGoals(goals);
    if (!parsedGoals) return;
    await saveUserProfile(profile);
    await saveNutritionGoals(parsedGoals);
    setStep2Saved(true);
    setIsWizardMode(false);
    setMsg({ type: "ok", text: "Profile & Daily Plan saved!" });
  };

  const handleQuickWeightCheckIn = async () => {
    const w = Number(quickWeightInput);
    if (!Number.isFinite(w) || w < 20 || w > 400) {
      setMsg({ type: "err", text: "Enter a valid weight between 20 and 400 kg." });
      return;
    }
    const today = localDateIso();
    const existing = profile.weightHistory || [];
    const filtered = existing.filter((entry) => entry.date !== today);
    const nextHistory = [...filtered, { date: today, weightKg: w }].sort((a, b) => a.date.localeCompare(b.date));

    const updated: UserProfile = {
      ...profile,
      weightKg: w,
      startingWeightKg: profile.startingWeightKg ?? profile.weightKg ?? w,
      weightHistory: nextHistory,
    };
    await saveUserProfile(updated);
    setProfile(updated);
    setMsg({ type: "ok", text: `Logged today's weight (${w} kg) and updated your BMI & Goal progress!` });
  };

  const doExport = async () => {
    const blob = new Blob([await exportUserDataJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `eatflix-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImport = async (file: File) => {
    try {
      const r = await importUserDataJSON(await file.text());
      await load();
      setMsg({ type: "ok", text: `Imported ${r.importedFoods} foods and ${r.importedLogs} log entries.` });
    } catch (e: any) {
      setMsg({ type: "err", text: `Import failed: ${e.message}` });
    }
  };

  const inputCls =
    "w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500";

  // NORMAL PROFILE VIEW (shown whenever profile setup is complete and user is not in Wizard edit mode)
  if (!isWizardMode && isGoalValid) {
    const dietLabel =
      profile.dietaryPreference === "vegetarian"
        ? "Vegetarian"
        : profile.dietaryPreference === "eggitarian"
        ? "Eggitarian"
        : "Non-Vegetarian";
    const goalLabel = formatGoalLabel(profile.fitnessGoal);

    return (
      <div className="min-h-screen pb-24 md:pb-12 flex flex-col">
        <Navbar onOpenAddModal={() => (window.location.href = "/")} />
        <main className="flex-1 max-w-2xl w-full mx-auto px-4 pt-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-white">My Profile &amp; Goals</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Your personal metrics, weight &amp; goal tracker, daily macro targets, and Cloud Sync
              </p>
            </div>
            <Link href="/" className="text-xs text-brand-400 hover:underline">
              ← Home
            </Link>
          </div>

          {msg && (
            <div
              role={msg.type === "err" ? "alert" : "status"}
              className={`px-3.5 py-2.5 rounded-xl border text-xs font-medium ${
                msg.type === "ok"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
              }`}
            >
              {msg.text}
            </div>
          )}

          {/* 1. Member Profile Card */}
          <section className="p-5 rounded-2xl glass-card border border-gray-800 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-brand-500/25">
                  {profile.displayName.trim()[0]?.toUpperCase() || "E"}
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-white">{profile.displayName}</h2>
                  {authEmail && <p className="text-xs text-emerald-400 font-medium">{authEmail}</p>}
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-500/15 text-brand-300 border border-brand-500/30">
                      {dietLabel}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      {goalLabel}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-800 text-gray-300 capitalize">
                      {(profile.activityLevel || "moderate").replace("_", " ")} activity
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMsg(null);
                    setStep(0);
                    setIsWizardMode(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-white font-semibold"
                >
                  <Pencil className="w-3.5 h-3.5 text-brand-400" />
                  Edit Profile
                </button>
                {!authEmail && (
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.dispatchEvent(new CustomEvent("eatflix:open-auth-modal"));
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-xs text-white font-semibold transition"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Sign In
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleGlobalSignOut}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs text-rose-300 font-semibold transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="p-3 rounded-xl bg-gray-900/70 border border-gray-800">
                <p className="text-[10px] text-gray-400 uppercase font-semibold">Age</p>
                <p className="text-sm font-extrabold text-white mt-0.5">{profile.age} yrs</p>
              </div>
              <div className="p-3 rounded-xl bg-gray-900/70 border border-gray-800">
                <p className="text-[10px] text-gray-400 uppercase font-semibold">Gender</p>
                <p className="text-sm font-extrabold text-white mt-0.5">{formatGenderLabel(profile.biologicalSex)}</p>
              </div>
              <div className="p-3 rounded-xl bg-gray-900/70 border border-gray-800">
                <p className="text-[10px] text-gray-400 uppercase font-semibold">Height</p>
                <p className="text-sm font-extrabold text-white mt-0.5">{profile.heightCm} cm</p>
              </div>
              <div className="p-3 rounded-xl bg-gray-900/70 border border-gray-800">
                <p className="text-[10px] text-gray-400 uppercase font-semibold">Weight</p>
                <p className="text-sm font-extrabold text-white mt-0.5">{profile.weightKg} kg</p>
              </div>
            </div>

            {bmiInfo && (
              <div className="p-3.5 rounded-xl bg-gray-900/80 border border-gray-800 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-200">Body Mass Index (BMI):</span>
                    <span className={`text-base font-black ${bmiInfo.colorClass}`}>{bmiInfo.bmi}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${bmiInfo.badgeClass}`}>
                      {bmiInfo.category}
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    Healthy range: <b className="text-gray-200">{bmiInfo.healthyMinKg}–{bmiInfo.healthyMaxKg} kg</b>
                  </span>
                </div>
                <div className="relative h-2.5 w-full rounded-full overflow-visible bg-gray-800 flex">
                  <div className="h-full w-[20%] bg-sky-500/80 rounded-l-full" />
                  <div className="h-full w-[30%] bg-emerald-500/85" />
                  <div className="h-full w-[23%] bg-amber-500/85" />
                  <div className="h-full w-[27%] bg-rose-500/85 rounded-r-full" />
                  <div
                    className="absolute -top-1 w-3 h-4.5 rounded-full bg-white border-2 border-[#101012] shadow -translate-x-1/2"
                    style={{ left: `${bmiInfo.markerPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Weight & Goal Progress + Quick Check-In */}
            {weightRoadmap && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-[#E50914]/10 border border-zinc-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-[#E50914]" />
                    <span className="text-xs font-extrabold text-white">
                      {activeGoalCard.emoji} {activeGoalCard.title} Tracker
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMsg(null);
                        setStep(1);
                        setIsWizardMode(true);
                      }}
                      className="text-[11px] text-brand-400 hover:underline font-semibold"
                    >
                      Change Goal →
                    </button>
                    <Link href="/progress" className="text-[11px] text-emerald-400 hover:underline font-semibold">
                      Full Charts →
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-black/40 border border-zinc-800">
                    <div className="text-[10px] text-zinc-400 uppercase">Start</div>
                    <div className="text-sm font-black text-zinc-200">{weightRoadmap.startKg} kg</div>
                  </div>
                  <div className="p-2 rounded-lg bg-black/40 border border-[#E50914]/30">
                    <div className="text-[10px] text-zinc-400 uppercase">Current</div>
                    <div className="text-sm font-black text-white">{weightRoadmap.currentKg} kg</div>
                  </div>
                  <div className="p-2 rounded-lg bg-black/40 border border-emerald-500/30">
                    <div className="text-[10px] text-zinc-400 uppercase">Target</div>
                    <div className="text-sm font-black text-emerald-400">{weightRoadmap.targetKg} kg</div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-300 font-medium">
                      {weightRoadmap.direction === "maintain"
                        ? weightRoadmap.remainingKg <= 1.5
                          ? "✅ Within your healthy maintenance zone!"
                          : `${weightRoadmap.remainingKg} kg from your maintenance target`
                        : weightRoadmap.remainingKg === 0
                        ? "🎉 Target weight reached!"
                        : `${weightRoadmap.remainingKg} kg to go (${
                            weightRoadmap.estimatedWeeks ? `~${weightRoadmap.estimatedWeeks} wks` : "on track"
                          })`}
                    </span>
                    <span className="font-bold text-emerald-400">{weightRoadmap.progressPercent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#E50914] to-emerald-400 transition-all duration-500"
                      style={{ width: `${weightRoadmap.progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Quick Log Today's Weight */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="number"
                    step="0.1"
                    min="20"
                    max="400"
                    value={quickWeightInput}
                    onChange={(e) => setQuickWeightInput(e.target.value)}
                    placeholder="Log today's weight (kg)"
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#E50914]"
                  />
                  <button
                    type="button"
                    onClick={handleQuickWeightCheckIn}
                    className="px-3.5 py-1.5 rounded-xl bg-[#E50914] hover:bg-[#f40612] text-white text-xs font-extrabold transition"
                  >
                    Update Weight
                  </button>
                </div>
              </div>
            )}

            {profile.focusAreas && profile.focusAreas.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-gray-400 font-semibold mr-1">Focus Areas:</span>
                {profile.focusAreas.map((area) => (
                  <span
                    key={area}
                    className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700"
                  >
                    ✓ {area}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* 2. Daily Macro & Micronutrient Targets Card */}
          <section className="p-5 rounded-2xl glass-card border border-gray-800 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-white">Daily Nutrition Targets</h2>
                <p className="text-xs text-gray-400">{recommendation.summary}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMsg(null);
                  setStep(2);
                  setIsWizardMode(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-white font-semibold"
              >
                <Pencil className="w-3.5 h-3.5 text-brand-400" />
                Edit Targets
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="p-3 rounded-xl bg-gray-900/70 border border-gray-800 text-center">
                <p className="text-base font-extrabold text-amber-400">{goals.calories || "—"}</p>
                <p className="text-[10px] text-gray-400">Calories (kcal)</p>
              </div>
              <div className="p-3 rounded-xl bg-gray-900/70 border border-brand-500/30 text-center">
                <p className="text-base font-extrabold text-brand-400">{goals.protein || "—"}g</p>
                <p className="text-[10px] text-gray-400">Protein</p>
              </div>
              <div className="p-3 rounded-xl bg-gray-900/70 border border-gray-800 text-center">
                <p className="text-base font-extrabold text-sky-400">{goals.carbohydrates || "—"}g</p>
                <p className="text-[10px] text-gray-400">Carbs</p>
              </div>
              <div className="p-3 rounded-xl bg-gray-900/70 border border-gray-800 text-center">
                <p className="text-base font-extrabold text-purple-400">{goals.totalFat || "—"}g</p>
                <p className="text-[10px] text-gray-400">Fat</p>
              </div>
              <div className="p-3 rounded-xl bg-gray-900/70 border border-gray-800 text-center col-span-2 sm:col-span-1">
                <p className="text-base font-extrabold text-emerald-400">{goals.fibre || "—"}g</p>
                <p className="text-[10px] text-gray-400">Fibre</p>
              </div>
            </div>
          </section>

          {/* 3. Cloud Sync Card */}
          <CloudSyncCard onDataUpdated={() => load(true)} />

          {/* 4. Data & Backups Card */}
          <section className="space-y-3 p-5 rounded-2xl glass-card border border-gray-800">
            <div>
              <h2 className="text-sm font-bold text-white">Data &amp; Backups</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Export or import a full JSON backup or reset your local device data anytime.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={doExport}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-white font-medium"
              >
                <Download className="w-4 h-4" /> Export backup
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-white font-medium"
              >
                <Upload className="w-4 h-4" /> Import backup
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) doImport(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm("Delete ALL food log entries? This cannot be undone.")) {
                    await clearFoodLogs();
                    setMsg({ type: "ok", text: "Food logs deleted." });
                  }
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300"
              >
                <Trash2 className="w-4 h-4" /> Delete food logs
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (
                    window.confirm(
                      "Delete EVERYTHING (logs, foods, combinations, goals, profile)? This cannot be undone."
                    )
                  ) {
                    await clearEverything();
                    if (typeof window !== "undefined") {
                      window.localStorage.removeItem("eatflix_profile_step");
                      window.localStorage.removeItem(GUEST_PROFILE_ACTIVE_KEY);
                    }
                    await load(false);
                    setStep(0);
                    setIsWizardMode(true);
                    setMsg({ type: "ok", text: "All data deleted and defaults restored." });
                  }
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300"
              >
                <Trash2 className="w-4 h-4" /> Delete everything
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 md:pb-12 flex flex-col">
      <Navbar onOpenAddModal={() => (window.location.href = "/")} />
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 pt-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Profile &amp; Goal Setup</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Step {step + 1} of {SLIDES.length} — {SLIDES[step].title}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {step1Saved && isGoalValid && (
              <button
                type="button"
                onClick={() => setIsWizardMode(false)}
                className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-white font-semibold"
              >
                View My Profile
              </button>
            )}
            {authEmail && (
              <button
                type="button"
                onClick={handleGlobalSignOut}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs text-rose-300 font-semibold transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            )}
            <Link href="/" className="text-xs text-brand-400 hover:underline">
              ← Home
            </Link>
          </div>
        </div>

        {/* Stepper / Slide Selector */}
        <div className="grid grid-cols-4 gap-2">
          {SLIDES.map((s, idx) => {
            const Icon = s.icon;
            const active = step === idx;
            const unlocked = canNavigateToStep(idx);
            const completed = unlocked && step > idx;
            return (
              <button
                key={s.id}
                type="button"
                aria-disabled={!unlocked}
                onClick={() => handleStepClick(idx)}
                className={`flex flex-col items-start p-2.5 rounded-2xl border text-left transition ${
                  active
                    ? "bg-brand-500/15 border-brand-500 text-white shadow-sm"
                    : completed
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200 hover:border-emerald-500/50"
                    : unlocked
                    ? "bg-gray-900/60 border-gray-800 text-gray-300 hover:border-gray-700 hover:text-white"
                    : "bg-gray-950/50 border-gray-900 text-gray-600 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                      active
                        ? "bg-brand-500 text-white"
                        : completed
                        ? "bg-emerald-500/20 text-emerald-300"
                        : unlocked
                        ? "bg-gray-800 text-gray-300"
                        : "bg-gray-900 text-gray-600"
                    }`}
                  >
                    {!unlocked ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : completed ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Icon className="w-3.5 h-3.5" />
                    )}
                  </span>
                  <span className="text-[10px] text-gray-500 font-medium">{idx + 1}/4</span>
                </div>
                <div className="text-xs font-bold truncate w-full">{s.title}</div>
                <div className="text-[10px] text-gray-400 truncate w-full hidden sm:block">
                  {!unlocked ? "Locked" : s.subtitle}
                </div>
              </button>
            );
          })}
        </div>

        {msg && (
          <div
            role={msg.type === "err" ? "alert" : "status"}
            className={`px-3.5 py-2.5 rounded-xl border text-xs font-medium ${
              msg.type === "ok"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            {msg.text}
          </div>
        )}

        {!authEmail && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-[#E50914]/15 via-zinc-900 to-zinc-900 border border-[#E50914]/30 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold text-white">Already have an EATflix account?</p>
              <p className="text-[11px] text-gray-300 mt-0.5">
                Sign in now to restore your saved profile, weight history, and food logs, or complete setup below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("eatflix:open-auth-modal"));
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E50914] hover:bg-[#f40612] text-white font-extrabold text-xs shadow-lg shadow-[#E50914]/30 transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In to Account
            </button>
          </div>
        )}

        {/* STEP 1: ABOUT YOU (Name, Age, Gender, Height, Weight, Diet) */}
        {step === 0 && (
          <section className="space-y-4 p-5 rounded-2xl glass-card border border-gray-800">
            <div>
              <h2 className="text-base font-bold text-white">1. About You</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Start with your basic metrics and food preference. Next, we&apos;ll tailor your specific health or weight goal.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs text-gray-400">
              <label className="col-span-2">
                Display name <span className="text-brand-400">*</span>
                <input
                  className={`${inputCls} mt-1`}
                  placeholder="Enter your name"
                  value={profile.displayName}
                  onChange={(e) => setP({ displayName: e.target.value })}
                />
              </label>

              <label>
                Age (years) <span className="text-brand-400">*</span>
                <input
                  type="number"
                  min="10"
                  max="120"
                  placeholder="e.g. 22"
                  className={`${inputCls} mt-1`}
                  value={profile.age ?? ""}
                  onChange={(e) => setP({ age: numOrNull(e.target.value) })}
                />
              </label>

              <label>
                Gender <span className="text-brand-400">*</span>
                <select
                  className={`${inputCls} mt-1`}
                  value={profile.biologicalSex ?? ""}
                  onChange={(e) =>
                    setP({ biologicalSex: (e.target.value || null) as BiologicalSex | null })
                  }
                >
                  <option value="">Select gender…</option>
                  {GENDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Height (cm) <span className="text-brand-400">*</span>
                <input
                  type="number"
                  min="50"
                  max="260"
                  placeholder="e.g. 164"
                  className={`${inputCls} mt-1`}
                  value={profile.heightCm ?? ""}
                  onChange={(e) => setP({ heightCm: numOrNull(e.target.value) })}
                />
              </label>

              <label>
                Current Weight (kg) <span className="text-brand-400">*</span>
                <input
                  type="number"
                  min="20"
                  max="400"
                  step="any"
                  placeholder="e.g. 61"
                  className={`${inputCls} mt-1`}
                  value={profile.weightKg ?? ""}
                  onChange={(e) => setP({ weightKg: numOrNull(e.target.value) })}
                />
              </label>

              {bmiInfo && (
                <div className="col-span-2 p-3 rounded-xl bg-gray-900/80 border border-gray-800 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-200">Live BMI:</span>
                      <span className={`text-sm font-black ${bmiInfo.colorClass}`}>{bmiInfo.bmi}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${bmiInfo.badgeClass}`}>
                        {bmiInfo.category}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-400">
                      Healthy weight range for {profile.heightCm} cm:{" "}
                      <b className="text-gray-200">{bmiInfo.healthyMinKg}–{bmiInfo.healthyMaxKg} kg</b>
                    </span>
                  </div>
                  <div className="relative h-2 w-full rounded-full overflow-visible bg-gray-800 flex">
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

              <label className="col-span-2">
                Dietary preference <span className="text-brand-400">*</span>
                <select
                  className={`${inputCls} mt-1`}
                  value={profile.dietaryPreference}
                  onChange={(e) => setP({ dietaryPreference: e.target.value as DietaryPreference })}
                >
                  <option value="vegetarian">Vegetarian</option>
                  <option value="eggitarian">Vegetarian + eggs (Eggitarian)</option>
                  <option value="non_vegetarian">Non-vegetarian</option>
                </select>
              </label>

              <label className="col-span-2">
                Allergies &amp; exclusions (optional, comma separated)
                <input
                  className={`${inputCls} mt-1`}
                  placeholder="e.g. peanut, soy, mushroom"
                  value={exclusions}
                  onChange={(e) => setExclusions(e.target.value)}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="text-[11px] text-gray-400">
                {!isBasicValid
                  ? `Still needed: ${missingBasic.join(", ")}.`
                  : "All basic metrics ready!"}
              </div>
              <button
                type="button"
                disabled={!isBasicValid}
                onClick={handleSaveBasicAndNext}
                className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition ${
                  isBasicValid
                    ? "bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/20"
                    : "bg-gray-800 border border-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                Next: Choose Your Goal
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </section>
        )}

        {/* STEP 2: CHOOSE GOAL & RELEVANT QUESTIONS */}
        {step === 1 && (
          <section className="space-y-5 p-5 rounded-2xl glass-card border border-gray-800">
            <div>
              <h2 className="text-base font-bold text-white">2. What Is Your Primary Goal?</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Pick the goal that fits you best — we&apos;ll ask a few relevant questions to tailor your daily tracker.
              </p>
            </div>

            {/* 5 Interactive Goal Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {GOAL_CARDS.map((card) => {
                const selected = (profile.fitnessGoal || "maintain") === card.value;
                return (
                  <button
                    key={card.value}
                    type="button"
                    onClick={() => {
                      const nextTarget =
                        card.value === "fat_loss" && profile.weightKg
                          ? Math.max(40, Math.round((profile.weightKg - 4) * 10) / 10)
                          : card.value === "muscle_gain" && profile.weightKg
                          ? Math.round((profile.weightKg + 4) * 10) / 10
                          : profile.weightKg ?? null;
                      setP({
                        fitnessGoal: card.value,
                        targetWeightKg: nextTarget,
                        weeklyPaceKg: card.value === "fat_loss" ? 0.5 : 0.25,
                      });
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition flex flex-col justify-between gap-2 ${
                      selected
                        ? "bg-[#E50914]/15 border-[#E50914] text-white shadow-md shadow-[#E50914]/10"
                        : "bg-gray-900/70 border-gray-800 text-gray-300 hover:border-gray-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xl">{card.emoji}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          selected
                            ? "bg-[#E50914] text-white"
                            : "bg-gray-800 text-gray-400"
                        }`}
                      >
                        {card.badge}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-white">{card.title}</div>
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{card.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Dynamic Relevant Questions Box */}
            <div className="p-4 rounded-2xl bg-gray-900/80 border border-gray-800 space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-800 pb-2.5">
                <Sparkles className="w-4 h-4 text-[#E50914]" />
                <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                  {activeGoalCard.questionsPrompt}
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-300">
                {/* Target Weight Question (shown for Weight Loss, Muscle Gain, Maintain) */}
                {(profile.fitnessGoal === "fat_loss" ||
                  profile.fitnessGoal === "muscle_gain" ||
                  !profile.fitnessGoal ||
                  profile.fitnessGoal === "maintain") && (
                  <div className="space-y-1.5">
                    <label className="block font-semibold text-gray-200">
                      Target Weight (kg)
                      <input
                        type="number"
                        step="0.5"
                        min="30"
                        max="300"
                        placeholder={String(profile.weightKg || 60)}
                        value={profile.targetWeightKg ?? ""}
                        onChange={(e) => setP({ targetWeightKg: numOrNull(e.target.value) })}
                        className={`${inputCls} mt-1`}
                      />
                    </label>
                    {profile.weightKg && (
                      <div className="flex flex-wrap gap-1.5">
                        {profile.fitnessGoal === "fat_loss" && (
                          <>
                            <button
                              type="button"
                              onClick={() => setP({ targetWeightKg: Math.max(40, profile.weightKg! - 3) })}
                              className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-[10px] text-gray-300"
                            >
                              -3 kg ({profile.weightKg - 3} kg)
                            </button>
                            <button
                              type="button"
                              onClick={() => setP({ targetWeightKg: Math.max(40, profile.weightKg! - 5) })}
                              className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-[10px] text-gray-300"
                            >
                              -5 kg ({profile.weightKg - 5} kg)
                            </button>
                          </>
                        )}
                        {profile.fitnessGoal === "muscle_gain" && (
                          <>
                            <button
                              type="button"
                              onClick={() => setP({ targetWeightKg: profile.weightKg! + 3 })}
                              className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-[10px] text-gray-300"
                            >
                              +3 kg ({profile.weightKg + 3} kg)
                            </button>
                            <button
                              type="button"
                              onClick={() => setP({ targetWeightKg: profile.weightKg! + 5 })}
                              className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-[10px] text-gray-300"
                            >
                              +5 kg ({profile.weightKg + 5} kg)
                            </button>
                          </>
                        )}
                        {bmiInfo && (
                          <button
                            type="button"
                            onClick={() =>
                              setP({
                                targetWeightKg:
                                  Math.round(((bmiInfo.healthyMinKg + bmiInfo.healthyMaxKg) / 2) * 10) / 10,
                              })
                            }
                            className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[10px] text-emerald-300"
                          >
                            Ideal BMI ({Math.round((bmiInfo.healthyMinKg + bmiInfo.healthyMaxKg) / 2)} kg)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Weekly Pace Question (shown for Weight Loss or Muscle Gain) */}
                {(profile.fitnessGoal === "fat_loss" || profile.fitnessGoal === "muscle_gain") && (
                  <label className="block font-semibold text-gray-200">
                    Target Weekly Pace
                    <select
                      className={`${inputCls} mt-1`}
                      value={String(profile.weeklyPaceKg ?? 0.5)}
                      onChange={(e) => setP({ weeklyPaceKg: Number(e.target.value) })}
                    >
                      <option value="0.25">Gentle &amp; Easy (0.25 kg / week)</option>
                      <option value="0.5">Steady &amp; Sustainable (0.5 kg / week — Recommended)</option>
                      <option value="0.75">Accelerated (0.75 kg / week)</option>
                    </select>
                  </label>
                )}

                {/* Activity Level Question */}
                <label className="block font-semibold text-gray-200">
                  Daily Activity Level <span className="text-brand-400">*</span>
                  <select
                    className={`${inputCls} mt-1`}
                    value={profile.activityLevel ?? ""}
                    onChange={(e) =>
                      setP({ activityLevel: (e.target.value || undefined) as ActivityLevel | undefined })
                    }
                  >
                    <option value="">Select activity level…</option>
                    <option value="sedentary">Sedentary (desk job, mostly sitting)</option>
                    <option value="light">Lightly Active (1–3 light workouts/week)</option>
                    <option value="moderate">Moderately Active (3–5 workouts/week)</option>
                    <option value="active">Active (6–7 workouts/week)</option>
                    <option value="very_active">Very Active (intense daily training / sports)</option>
                  </select>
                </label>

                {/* Workout Days & Daily Hydration */}
                <div className="grid grid-cols-2 gap-2">
                  <label className="block font-semibold text-gray-200">
                    Workouts / week
                    <select
                      className={`${inputCls} mt-1`}
                      value={String(profile.workoutDaysPerWeek ?? 3)}
                      onChange={(e) => setP({ workoutDaysPerWeek: Number(e.target.value) })}
                    >
                      <option value="0">0 days</option>
                      <option value="1">1–2 days</option>
                      <option value="3">3–4 days</option>
                      <option value="5">5 days</option>
                      <option value="6">6–7 days</option>
                    </select>
                  </label>
                  <label className="block font-semibold text-gray-200">
                    Daily Water Goal
                    <select
                      className={`${inputCls} mt-1`}
                      value={String(profile.waterGoalLitres ?? 2.5)}
                      onChange={(e) => setP({ waterGoalLitres: Number(e.target.value) })}
                    >
                      <option value="2">2.0 Litres (8 glasses)</option>
                      <option value="2.5">2.5 Litres (10 glasses)</option>
                      <option value="3">3.0 Litres (12 glasses)</option>
                      <option value="3.5">3.5 Litres (14 glasses)</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* Estimated Timeline Callout */}
              {weightRoadmap && weightRoadmap.direction !== "maintain" && weightRoadmap.remainingKg > 0 && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs">
                  <span className="text-emerald-200">
                    Roadmap: <b>{weightRoadmap.currentKg} kg → {weightRoadmap.targetKg} kg</b> (
                    {weightRoadmap.direction === "lose" ? "-" : "+"}
                    {weightRoadmap.remainingKg} kg)
                  </span>
                  <span className="font-extrabold text-emerald-400">
                    Est. ~{weightRoadmap.estimatedWeeks} weeks
                  </span>
                </div>
              )}

              {/* Focus Area Chips */}
              <div className="space-y-2 pt-1">
                <p className="text-xs font-semibold text-gray-200">
                  What should we prioritize in your food suggestions &amp; tracker? (Tap all that apply)
                </p>
                <div className="flex flex-wrap gap-2">
                  {activeGoalCard.focusOptions.map((option) => {
                    const active = (profile.focusAreas || []).includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => toggleFocusArea(option)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                          active
                            ? "bg-[#E50914] border-[#E50914] text-white shadow-sm"
                            : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600"
                        }`}
                      >
                        {active ? "✓ " : "+ "}
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => goToStep(0)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-gray-200 font-medium"
              >
                <ChevronLeft className="w-4 h-4" />
                Back: About You
              </button>
              <button
                type="button"
                onClick={handleSaveGoalQuestionsAndNext}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-xs shadow-lg shadow-brand-500/20 transition"
              >
                Save Goal &amp; View Daily Plan
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </section>
        )}

        {/* STEP 3: DAILY NUTRITION PLAN */}
        {step === 2 && (
          <section className="space-y-4 p-5 rounded-2xl glass-card border border-gray-800">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-white">3. Your Personalized Daily Plan</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {recommendation.summary}. You can fine-tune any target below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const rec = applyRecommendedToState();
                  setMsg({
                    type: "ok",
                    text: `Recalculated from your goal (${rec.goals.calories} kcal, ${rec.goals.protein}g protein).`,
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-500/15 border border-brand-500/40 text-xs text-brand-300 hover:bg-brand-500/25 font-medium"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Reset to Recommended
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-gray-400">
              {GOAL_FIELDS.map((f) => (
                <label key={f.key}>
                  {f.label} ({f.unit}){" "}
                  {f.required ? (
                    <span className="text-brand-400">*</span>
                  ) : (
                    <span className="text-gray-600">optional</span>
                  )}
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className={`${inputCls} mt-1`}
                    value={goals[f.key] ?? ""}
                    onChange={(e) => {
                      setGoals((p) => ({ ...p, [f.key]: e.target.value }));
                      setStep2Saved(false);
                    }}
                  />
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-800">
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-gray-200 font-medium"
              >
                <ChevronLeft className="w-4 h-4" />
                Back: Goal &amp; Questions
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSavePlanAndFinish}
                  className="px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-white font-medium"
                >
                  Save &amp; Finish
                </button>
                <button
                  type="button"
                  onClick={handleSavePlanAndNext}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-xs shadow-lg shadow-brand-500/20"
                >
                  Next: Cloud Sync
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* STEP 4: CLOUD SYNC & BACKUP */}
        {step === 3 && (
          <div className="space-y-4">
            <CloudSyncCard onDataUpdated={() => load(true)} />

            <section className="space-y-3 p-5 rounded-2xl glass-card border border-gray-800">
              <div>
                <h2 className="text-sm font-bold text-white">Local Backup &amp; Reset</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Export or import a JSON backup file anytime.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={doExport}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-white font-medium"
                >
                  <Download className="w-4 h-4" /> Export backup
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-white font-medium"
                >
                  <Upload className="w-4 h-4" /> Import backup
                </button>
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-gray-200 font-medium"
              >
                <ChevronLeft className="w-4 h-4" />
                Back: Daily Plan
              </button>
              <button
                type="button"
                onClick={() => setIsWizardMode(false)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-xs shadow-lg shadow-brand-500/20"
              >
                Finish Setup — View My Profile
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
