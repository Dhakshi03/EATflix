import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { estimateNutritionByName } from "@/lib/nutrition/estimator";

const ALLOWED_UNITS = ["g", "ml", "piece", "cup", "tbsp", "scoop"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  let note = "";
  try {
    const body = await req.json();
    const { imageBase64, description, clientApiKey } = body;

    note = typeof description === "string" ? description.slice(0, 300).trim() : "";

    // Support data URL or raw base64
    let mimeType = "image/jpeg";
    let data = typeof imageBase64 === "string" ? imageBase64 : "";
    let hasImage = false;

    if (data && !data.includes("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")) {
      const match = data.match(/^data:(image\/(?:jpeg|png|webp|heic|jpg));base64,(.+)$/i);
      if (match) {
        mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1];
        data = match[2];
        hasImage = true;
      } else if (data.length > 100) {
        hasImage = true;
      }
    }

    if (!hasImage && !note) {
      return NextResponse.json(
        { error: "Please provide a meal image or enter a description of what you ate.", code: "BAD_REQUEST" },
        { status: 400 }
      );
    }

    const headerKey = req.headers.get("x-gemini-api-key");
    const apiKey = (clientApiKey || headerKey || process.env.GEMINI_API_KEY || "").trim();

    if (!apiKey) {
      const fallbackFood = note || "Meal Item";
      const est = estimateNutritionByName(fallbackFood);
      return NextResponse.json({
        success: true,
        source: "smart_estimator",
        items: [
          {
            foodName: est.foodName,
            estimatedQuantity: est.suggestedQuantity,
            estimatedUnit: est.suggestedUnit,
            confidence: 0.85,
            clarifyingQuestion: hasImage
              ? "Tip: Type the dish name above and tap '✨ Recalculate' to refine macros."
              : null,
            estimatedNutrients: est.nutrients,
          },
        ],
        label: "Smart nutrition estimate — review before logging",
        timestamp: new Date().toISOString(),
      });
    }

    if (hasImage && data.length * 0.75 > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image file is too large (max 10 MB).", code: "BAD_REQUEST" }, { status: 413 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Ordered from fastest + least congested capacity pools to standard pools
    const candidateModels = Array.from(
      new Set(
        [
          "gemini-2.0-flash-lite",
          "gemini-2.0-flash",
          "gemini-2.5-flash-lite",
          "gemini-2.5-flash",
          "gemini-1.5-flash",
          process.env.GEMINI_MODEL,
          "gemini-flash-latest",
        ].filter(Boolean) as string[]
      )
    );

    let lastError: any = null;
    let responseText = "";

    const prompt = `Identify each food item in this meal${note ? ` (Note: "${note}")` : ""}.
Return JSON ONLY:
{"items":[{"foodName":"Exact Dish Name","estimatedQuantity":1,"estimatedUnit":"piece|g|ml|cup|tbsp|scoop","confidence":0.9,"clarifyingQuestion":null,"estimatedNutrients":{"protein":8.5,"calories":320,"carbohydrates":48,"totalFat":10.5,"saturatedFat":3.2,"fibre":3.5,"sugar":1.5,"sodium":420,"iron":2.1,"calcium":45,"zinc":0.9,"vitB12":0.1,"vitD":0,"folate":35,"healthyFats":4.0}}]}`;

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
            maxOutputTokens: 700,
          },
        });

        const result = hasImage
          ? await model.generateContent([prompt, { inlineData: { data, mimeType } }])
          : await model.generateContent(prompt);

        responseText = result.response.text();
        if (responseText) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} attempt failed:`, err?.message || err);
      }
    }

    // Graceful fallback if all Gemini models are experiencing 503 High Demand or 429 Quota spikes
    if (!responseText) {
      const fallbackName = note || "Roasted Peanuts / Snack";
      const est = estimateNutritionByName(fallbackName);
      return NextResponse.json({
        success: true,
        source: "smart_estimator",
        items: [
          {
            foodName: est.foodName,
            estimatedQuantity: est.suggestedQuantity,
            estimatedUnit: est.suggestedUnit,
            confidence: 0.82,
            clarifyingQuestion:
              "Google AI Vision is experiencing high traffic — confirm or edit the food name above and tap '✨ Auto-Estimate' to update macros instantly.",
            estimatedNutrients: est.nutrients,
          },
        ],
        label: "Smart fallback estimate — review before logging",
        timestamp: new Date().toISOString(),
      });
    }

    const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);

    const numOrNull = (v: any): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
    };

    const items = (Array.isArray(parsed?.items) ? parsed.items : [])
      .filter((i: any) => typeof i?.foodName === "string" && i.foodName.trim().length > 0)
      .slice(0, 10)
      .map((i: any) => {
        const en = i.estimatedNutrients || {};
        return {
          foodName: String(i.foodName).trim().slice(0, 80),
          estimatedQuantity:
            Number.isFinite(Number(i.estimatedQuantity)) && Number(i.estimatedQuantity) > 0
              ? Math.round(Number(i.estimatedQuantity) * 10) / 10
              : 1,
          estimatedUnit: ALLOWED_UNITS.includes(i.estimatedUnit) ? i.estimatedUnit : "piece",
          confidence: Math.min(1, Math.max(0.1, Number(i.confidence) || 0.85)),
          clarifyingQuestion: typeof i.clarifyingQuestion === "string" ? i.clarifyingQuestion : null,
          estimatedNutrients: {
            protein: numOrNull(en.protein),
            calories: numOrNull(en.calories),
            carbohydrates: numOrNull(en.carbohydrates),
            totalFat: numOrNull(en.totalFat),
            saturatedFat: numOrNull(en.saturatedFat),
            fibre: numOrNull(en.fibre),
            sugar: numOrNull(en.sugar),
            sodium: numOrNull(en.sodium),
            iron: numOrNull(en.iron),
            calcium: numOrNull(en.calcium),
            zinc: numOrNull(en.zinc),
            vitB12: numOrNull(en.vitB12),
            vitD: numOrNull(en.vitD),
            folate: numOrNull(en.folate),
            healthyFats: numOrNull(en.healthyFats),
          },
        };
      });

    return NextResponse.json({
      success: true,
      items,
      label: "AI-estimated — review before logging",
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("AI photo analyze route error:", err);
    // Even on unexpected error, return a graceful editable fallback item instead of blocking the user
    const est = estimateNutritionByName(note || "Snack / Meal");
    return NextResponse.json({
      success: true,
      source: "smart_estimator",
      items: [
        {
          foodName: est.foodName,
          estimatedQuantity: est.suggestedQuantity,
          estimatedUnit: est.suggestedUnit,
          confidence: 0.8,
          clarifyingQuestion: "Edit the food name above and tap '✨ Auto-Estimate' to update nutrition.",
          estimatedNutrients: est.nutrients,
        },
      ],
      label: "Smart fallback estimate — review before logging",
      timestamp: new Date().toISOString(),
    });
  }
}
