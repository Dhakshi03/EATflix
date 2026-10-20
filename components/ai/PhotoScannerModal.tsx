"use client";

import { useEffect, useState } from "react";
import {
  X,
  Camera,
  Sparkles,
  Check,
  AlertTriangle,
  Trash2,
  HelpCircle,
  Key,
  ExternalLink,
  Upload,
} from "lucide-react";
import { Food, FoodLogEntry, MealType, NutrientValues, ServingUnit } from "@/lib/nutrition/types";
import { createEmptyNutrients, createNutritionSnapshot, scaleNutrient } from "@/lib/nutrition/calculator";
import { estimateNutritionByName } from "@/lib/nutrition/estimator";
import { localDateIso } from "@/lib/nutrition/combination";
import { saveFood } from "@/lib/storage/indexed-db";

interface PhotoScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  foods: Food[];
  onConfirmLog: (entries: Partial<FoodLogEntry>[]) => void;
}

interface ReviewItem {
  foodName: string;
  quantity: number;
  baseQuantity: number;
  unit: ServingUnit;
  confidence: number;
  clarifyingQuestion: string | null;
  matchedFoodId: string;
  baseEstimatedNutrients: NutrientValues;
  customProtein: string;
  customCalories: string;
  customCarbs: string;
  customFat: string;
  customFibre: string;
}

/**
 * Compresses & resizes camera/gallery photos client-side (max 512px JPEG @ 0.65 quality, ~25KB)
 * so mobile upload + Gemini Vision analysis completes in ~1-1.5 seconds.
 */
function compressImageFile(file: File, maxDim = 512, quality = 0.65): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (typeof window === "undefined" || typeof document === "undefined") {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(dataUrl);
          return;
        }
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const targetW = Math.max(1, Math.round(w * scale));
        const targetH = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function PhotoScannerModal({ isOpen, onClose, foods, onConfirmLog }: PhotoScannerModalProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [isReviewStep, setIsReviewStep] = useState(false);
  const [saveIdentifiedToLibrary, setSaveIdentifiedToLibrary] = useState(false);

  // Gemini API Key state
  const [apiKey, setApiKey] = useState<string>("");
  const [showKeySetup, setShowKeySetup] = useState<boolean>(false);
  const [keySavedNotice, setKeySavedNotice] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("nutritrack_gemini_api_key") || "";
      setApiKey(stored);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveApiKey = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("nutritrack_gemini_api_key", apiKey.trim());
      setKeySavedNotice(true);
      setTimeout(() => {
        setKeySavedNotice(false);
        setShowKeySetup(false);
      }, 1200);
    }
  };

  const reset = () => {
    setImagePreview(null);
    setDescription("");
    setItems([]);
    setIsReviewStep(false);
    setErrorMsg(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(file);
      setImagePreview(compressed);
    } catch {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!imagePreview && !description.trim()) {
      setErrorMsg("Please upload a food image or describe your meal below.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    const clientKey = apiKey.trim() || (typeof window !== "undefined" ? localStorage.getItem("nutritrack_gemini_api_key") || "" : "");

    try {
      const res = await fetch("/api/ai/analyze-food", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(clientKey ? { "x-gemini-api-key": clientKey } : {}),
        },
        body: JSON.stringify({
          imageBase64: imagePreview || "data:image/jpeg;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
          description: description.trim(),
          clientApiKey: clientKey,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === "API_KEY_MISSING") {
          setShowKeySetup(true);
          setErrorMsg(
            "Gemini API key is required for AI photo analysis. You can paste your free Google AI key below!"
          );
        } else {
          setErrorMsg(data.error || "Failed to analyze image.");
        }
        return;
      }

      if (!data.items?.length) {
        setErrorMsg("No food items could be detected. Try a clearer angle or enter foods manually.");
        return;
      }

      setItems(
        data.items.map((i: any) => {
          const baseNutrients: NutrientValues = {
            ...createEmptyNutrients(),
            ...(i.estimatedNutrients || {}),
          };
          const qty = Number(i.estimatedQuantity) > 0 ? Number(i.estimatedQuantity) : 1;
          return {
            foodName: i.foodName,
            quantity: qty,
            baseQuantity: qty,
            unit: i.estimatedUnit || "piece",
            confidence: i.confidence,
            clarifyingQuestion: i.clarifyingQuestion,
            // Do NOT auto-map to the normal foods list — use the AI-identified food & its estimated nutrition!
            matchedFoodId: "",
            baseEstimatedNutrients: baseNutrients,
            customProtein: baseNutrients.protein != null ? String(baseNutrients.protein) : "",
            customCalories: baseNutrients.calories != null ? String(baseNutrients.calories) : "",
            customCarbs: baseNutrients.carbohydrates != null ? String(baseNutrients.carbohydrates) : "",
            customFat: baseNutrients.totalFat != null ? String(baseNutrients.totalFat) : "",
            customFibre: baseNutrients.fibre != null ? String(baseNutrients.fibre) : "",
          };
        })
      );
      setIsReviewStep(true);
    } catch {
      setErrorMsg("Could not connect to the analysis service. Please check your internet connection.");
    } finally {
      setIsLoading(false);
    }
  };

  // Instant fallback: match from description without requiring API call
  const handleQuickMatchFromDescription = () => {
    if (!description.trim()) {
      setErrorMsg("Enter a meal description (e.g. '2 boiled eggs and 1 cup curd') to match foods.");
      return;
    }

    const words = description.toLowerCase().split(/[\s,]+/);
    const matched: ReviewItem[] = [];

    for (const food of foods) {
      if (food.isArchived) continue;
      const fName = food.name.toLowerCase();
      if (words.some((w) => w.length > 2 && fName.includes(w))) {
        matched.push({
          foodName: food.name,
          quantity: food.defaultServingQuantity,
          baseQuantity: food.defaultServingQuantity,
          unit: food.defaultServingUnit,
          confidence: 0.9,
          clarifyingQuestion: null,
          matchedFoodId: food.id,
          baseEstimatedNutrients: food.nutrientValues,
          customProtein: food.nutrientValues.protein != null ? String(food.nutrientValues.protein) : "",
          customCalories: food.nutrientValues.calories != null ? String(food.nutrientValues.calories) : "",
          customCarbs: food.nutrientValues.carbohydrates != null ? String(food.nutrientValues.carbohydrates) : "",
          customFat: food.nutrientValues.totalFat != null ? String(food.nutrientValues.totalFat) : "",
          customFibre: food.nutrientValues.fibre != null ? String(food.nutrientValues.fibre) : "",
        });
      }
    }

    if (matched.length === 0) {
      matched.push({
        foodName: description.trim(),
        quantity: 1,
        baseQuantity: 1,
        unit: "piece",
        confidence: 0.5,
        clarifyingQuestion: "Verify portion and nutritional values before logging.",
        matchedFoodId: "",
        baseEstimatedNutrients: createEmptyNutrients(),
        customProtein: "",
        customCalories: "",
        customCarbs: "",
        customFat: "",
        customFibre: "",
      });
    }

    setItems(matched);
    setIsReviewStep(true);
  };

  const update = (i: number, patch: Partial<ReviewItem>) =>
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== i) return it;
        const next = { ...it, ...patch };
        // If user changed quantity while using AI-estimated nutrition, scale the displayed macros proportionally
        if (
          patch.quantity !== undefined &&
          !next.matchedFoodId &&
          next.baseQuantity > 0 &&
          patch.quantity > 0
        ) {
          const factor = patch.quantity / next.baseQuantity;
          const b = next.baseEstimatedNutrients;
          next.customProtein = b.protein != null ? String(Math.round(b.protein * factor * 10) / 10) : next.customProtein;
          next.customCalories = b.calories != null ? String(Math.round(b.calories * factor)) : next.customCalories;
          next.customCarbs =
            b.carbohydrates != null ? String(Math.round(b.carbohydrates * factor * 10) / 10) : next.customCarbs;
          next.customFat = b.totalFat != null ? String(Math.round(b.totalFat * factor * 10) / 10) : next.customFat;
          next.customFibre = b.fibre != null ? String(Math.round(b.fibre * factor * 10) / 10) : next.customFibre;
        }
        return next;
      })
    );

  const parseNumOrNull = (s: string): number | null => {
    const trimmed = (s ?? "").trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
  };

  const compute = (it: ReviewItem) => {
    if (!(it.quantity > 0)) return { nutrients: createEmptyNutrients(), error: "Quantity must be greater than 0" };
    if (it.matchedFoodId) {
      const food = foods.find((f) => f.id === it.matchedFoodId);
      if (food) {
        try {
          return { nutrients: createNutritionSnapshot(food, it.quantity, it.unit), error: null };
        } catch (e: any) {
          return { nutrients: createEmptyNutrients(), error: e.message as string };
        }
      }
    }

    // Build snapshot directly from the AI-estimated nutrients + user macro edits
    const factor = it.baseQuantity > 0 ? it.quantity / it.baseQuantity : 1;
    const b = it.baseEstimatedNutrients;
    const nutrients: NutrientValues = {
      protein: parseNumOrNull(it.customProtein),
      calories: parseNumOrNull(it.customCalories),
      carbohydrates: parseNumOrNull(it.customCarbs),
      totalFat: parseNumOrNull(it.customFat),
      saturatedFat: scaleNutrient(b.saturatedFat, factor),
      fibre: parseNumOrNull(it.customFibre),
      sugar: scaleNutrient(b.sugar, factor),
      sodium: scaleNutrient(b.sodium, factor),
      iron: scaleNutrient(b.iron, factor),
      calcium: scaleNutrient(b.calcium, factor),
      zinc: scaleNutrient(b.zinc, factor),
      vitB12: scaleNutrient(b.vitB12, factor),
      vitD: scaleNutrient(b.vitD, factor),
      folate: scaleNutrient(b.folate, factor),
      healthyFats: scaleNutrient(b.healthyFats, factor),
    };
    return { nutrients, error: null as string | null };
  };

  const computed = items.map(compute);
  const hasBlockingError = computed.some((c) => c.error);

  const handleConfirm = async () => {
    const date = localDateIso();
    const now = new Date().toISOString();
    const entries: Partial<FoodLogEntry>[] = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const snap = computed[i].nutrients;
      let foodIdToUse: string | null = it.matchedFoodId || null;

      if (!foodIdToUse && saveIdentifiedToLibrary && it.foodName.trim()) {
        const newFood: Food = {
          id: `food_ai_${Date.now()}_${i}`,
          ownerUserId: "default_user",
          name: it.foodName.trim(),
          brand: null,
          category: "AI Scanned",
          referenceType: "per_serving",
          defaultServingQuantity: it.quantity,
          defaultServingUnit: it.unit,
          referenceQuantity: it.quantity,
          referenceUnit: it.unit,
          nutrientValues: snap,
          dataSource: "ai_vision",
          verificationStatus: "unverified",
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        };
        await saveFood(newFood);
        foodIdToUse = newFood.id;
      }

      entries.push({
        foodId: foodIdToUse,
        foodNameSnapshot: it.foodName.trim() || "Meal Item",
        servingQuantity: it.quantity,
        servingUnit: it.unit,
        nutritionSnapshot: snap,
        mealType,
        entrySource: "photo" as const,
        confidence: it.confidence,
        loggedAt: date,
        createdAt: now,
      });
    }

    onConfirmLog(entries);
    close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-[#141417] border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[92vh]">
        {/* Mobile bottom-sheet handle */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
          <span className="w-10 h-1 rounded-full bg-zinc-700" />
        </div>
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent-cyan" />
            <h2 className="text-lg font-bold text-white">AI Meal Photo Scanner</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowKeySetup(!showKeySetup)}
              className="p-1.5 rounded-xl bg-gray-800/80 text-gray-300 hover:text-white hover:bg-gray-700 text-xs flex items-center gap-1"
              title="API Key Settings"
            >
              <Key className="w-3.5 h-3.5 text-accent-cyan" />
              <span className="hidden sm:inline">API Key</span>
            </button>
            <button
              onClick={close}
              aria-label="Close"
              className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* API Key Configuration Dropdown / Banner */}
          {showKeySetup && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-gray-800/90 to-gray-800/40 border border-accent-cyan/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-accent-cyan" /> Google Gemini API Key
                </span>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-accent-cyan hover:underline flex items-center gap-1 font-medium"
                >
                  Get free key <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <p className="text-[11px] text-gray-300">
                To analyze food photographs, paste your free Gemini API key below. It is stored securely in your browser's
                local storage only.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-accent-cyan"
                />
                <button
                  onClick={handleSaveApiKey}
                  className="px-4 py-2 rounded-xl bg-accent-cyan text-gray-900 font-bold text-xs hover:bg-cyan-300 transition-colors"
                >
                  {keySavedNotice ? "Saved! ✓" : "Save Key"}
                </button>
              </div>
            </div>
          )}

          {!isReviewStep ? (
            <>
              {/* Photo Upload Area */}
              <div className="border-2 border-dashed border-gray-700 hover:border-brand-500/50 rounded-2xl p-6 text-center bg-gray-800/30 transition-colors">
                {imagePreview ? (
                  <div className="space-y-3">
                    <img
                      src={imagePreview}
                      alt="Meal preview"
                      className="max-h-52 mx-auto rounded-xl object-cover shadow-lg border border-gray-700"
                    />
                    <button
                      onClick={() => setImagePreview(null)}
                      className="text-xs text-rose-400 hover:underline"
                    >
                      Remove photo
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3.5">
                    <div className="w-12 h-12 rounded-full bg-brand-500/15 text-brand-400 flex items-center justify-center shadow-inner">
                      <Camera className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Choose a meal photo or take a picture</p>
                      <p className="text-xs text-gray-400 mt-0.5">Supports Gallery upload, Camera, JPG, PNG or WEBP</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-1">
                      {/* Gallery / File Picker (no capture attribute so mobile opens Gallery/Photos) */}
                      <label className="cursor-pointer py-2.5 px-4 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition active:scale-95">
                        <Upload className="w-4 h-4" />
                        <span>Upload from Gallery</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>

                      {/* Direct Camera Capture */}
                      <label className="cursor-pointer py-2.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-semibold text-xs flex items-center justify-center gap-2 transition active:scale-95">
                        <Camera className="w-4 h-4 text-accent-cyan" />
                        <span>Take Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Text Context */}
              <div>
                <label htmlFor="photo-desc" className="block text-xs font-semibold text-gray-300 mb-1">
                  Optional description / ingredients
                </label>
                <input
                  id="photo-desc"
                  type="text"
                  maxLength={300}
                  placeholder="e.g. 2 boiled eggs with green gram sprouts and 1 tsp oil"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-gray-800/70 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-2"
                >
                  <div className="flex items-center gap-2 font-semibold text-rose-400">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>How to fix this:</span>
                  </div>
                  <p>{errorMsg}</p>
                  {!apiKey && (
                    <button
                      onClick={() => setShowKeySetup(true)}
                      className="text-xs underline text-accent-cyan font-medium block"
                    >
                      Click here to paste your free Gemini API key
                    </button>
                  )}
                </div>
              )}

              {/* Alternative Fallback & Demo Options if API key not available */}
              <div className="p-3.5 rounded-2xl bg-gray-800/40 border border-gray-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <span className="text-gray-400">No API key? Type what you ate above.</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleQuickMatchFromDescription}
                    className="px-2.5 py-1.5 rounded-xl bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-brand-400 text-xs font-semibold transition-all"
                  >
                    Match from text →
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Review & Verification Step */
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 rounded-xl text-amber-300 text-xs font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>AI-estimated — review food items and portions before logging</span>
              </div>

              {/* Meal Category Select */}
              <div className="flex gap-2">
                {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMealType(m)}
                    className={`flex-1 py-1.5 rounded-lg text-xs capitalize transition-all ${
                      mealType === m
                        ? "bg-brand-500/20 text-brand-400 border border-brand-500/40 font-semibold"
                        : "bg-gray-800 text-gray-400 border border-gray-700"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Detected Items List */}
              <div className="space-y-3">
                {items.map((it, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-gray-800/60 border border-gray-700/80 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        aria-label="Detected food name"
                        type="text"
                        value={it.foodName}
                        onChange={(e) => update(idx, { foodName: e.target.value })}
                        className="bg-transparent font-semibold text-white text-sm focus:outline-none flex-1 border-b border-transparent focus:border-brand-500"
                      />
                      <span className="text-[10px] text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                        {Math.round(it.confidence * 100)}% AI confidence
                      </span>
                      <button
                        onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                        aria-label="Remove item"
                        className="text-gray-500 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {it.clarifyingQuestion && (
                      <p className="flex gap-1.5 text-[11px] text-amber-300">
                        <HelpCircle className="w-3.5 h-3.5 flex-shrink-0" /> {it.clarifyingQuestion}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="text-gray-400 text-[10px]">Estimated Quantity</label>
                        <input
                          type="number"
                          min="0.1"
                          step="any"
                          value={it.quantity}
                          onChange={(e) => update(idx, { quantity: Number(e.target.value) })}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white font-semibold"
                        />
                      </div>
                      <div>
                        <label className="text-gray-400 text-[10px]">Unit</label>
                        <select
                          value={it.unit}
                          onChange={(e) => update(idx, { unit: e.target.value as ServingUnit })}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-white"
                        >
                          {(["g", "ml", "piece", "cup", "tbsp", "scoop"] as ServingUnit[]).map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Editable AI-Estimated Nutritional Values */}
                    <div className="p-3 rounded-xl bg-gray-900/80 border border-gray-700/70 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-accent-cyan">
                          Estimated Nutrition (for this portion)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const est = estimateNutritionByName(it.foodName, it.quantity, it.unit, "per_serving");
                            update(idx, {
                              baseQuantity: it.quantity,
                              baseEstimatedNutrients: est.nutrients,
                              customProtein: est.nutrients.protein != null ? String(est.nutrients.protein) : "",
                              customCalories: est.nutrients.calories != null ? String(est.nutrients.calories) : "",
                              customCarbs:
                                est.nutrients.carbohydrates != null ? String(est.nutrients.carbohydrates) : "",
                              customFat: est.nutrients.totalFat != null ? String(est.nutrients.totalFat) : "",
                              customFibre: est.nutrients.fibre != null ? String(est.nutrients.fibre) : "",
                              clarifyingQuestion: null,
                            });
                          }}
                          className="px-2 py-0.5 rounded-md bg-brand-500/20 hover:bg-brand-500/30 border border-brand-500/40 text-[10px] font-bold text-brand-300 flex items-center gap-1 transition"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>✨ Auto-Estimate from Name</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] text-brand-400 block">Protein (g)</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="—"
                            value={it.customProtein}
                            onChange={(e) => update(idx, { customProtein: e.target.value })}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white font-semibold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-amber-400 block">Calories</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="—"
                            value={it.customCalories}
                            onChange={(e) => update(idx, { customCalories: e.target.value })}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white font-semibold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-sky-400 block">Carbs (g)</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="—"
                            value={it.customCarbs}
                            onChange={(e) => update(idx, { customCarbs: e.target.value })}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white font-semibold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-purple-400 block">Fat (g)</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="—"
                            value={it.customFat}
                            onChange={(e) => update(idx, { customFat: e.target.value })}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white font-semibold"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-emerald-400 block">Fibre (g)</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="—"
                            value={it.customFibre}
                            onChange={(e) => update(idx, { customFibre: e.target.value })}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white font-semibold"
                          />
                        </div>
                      </div>
                    </div>

                    {computed[idx].error && (
                      <p role="alert" className="text-[11px] text-rose-400">
                        {computed[idx].error}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveIdentifiedToLibrary}
                  onChange={(e) => setSaveIdentifiedToLibrary(e.target.checked)}
                  className="rounded border-gray-700 bg-gray-800 text-brand-500"
                />
                Also save identified item(s) to &ldquo;My Saved Foods&rdquo; for future reuse
              </label>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/90 flex justify-end gap-3">
          <button onClick={close} className="px-4 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white">
            Cancel
          </button>
          {!isReviewStep ? (
            <button
              onClick={handleAnalyze}
              disabled={(!imagePreview && !description.trim()) || isLoading}
              className="flex items-center gap-2 bg-gradient-to-r from-brand-500 to-accent-cyan disabled:opacity-50 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-brand-500/20"
            >
              <Sparkles className="w-4 h-4" />
              {isLoading ? "Analyzing Photo..." : "Analyze Meal"}
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={items.length === 0 || hasBlockingError}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-brand-500/20"
            >
              <Check className="w-4 h-4" /> Confirm & Log Items
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
