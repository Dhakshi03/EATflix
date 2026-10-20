import { describe, it, expect } from "vitest";
import { validateBackupJSON, ExportBackupData } from "./export-import";
import { DEFAULT_GOALS, DEFAULT_PROFILE } from "./indexed-db";

describe("Storage Export/Import & Data Validation Tests", () => {
  it("validates a correctly formatted backup JSON string", () => {
    const validBackup: ExportBackupData = {
      version: "1.0",
      exportedAt: "2026-10-09T20:00:00Z",
      profile: DEFAULT_PROFILE,
      goals: DEFAULT_GOALS,
      foods: [
        {
          id: "food_sample",
          ownerUserId: "user_1",
          name: "Sample Food",
          brand: null,
          category: "Proteins",
          referenceType: "per_100g",
          defaultServingQuantity: 100,
          defaultServingUnit: "g",
          referenceQuantity: 100,
          referenceUnit: "g",
          nutrientValues: {
            protein: 20,
            calories: 150,
            carbohydrates: 0,
            totalFat: 5,
            saturatedFat: null,
            fibre: null,
            sugar: null,
            sodium: null,
            iron: null,
            calcium: null,
            zinc: null,
            vitB12: null,
            vitD: null,
            folate: null,
            healthyFats: null,
          },
          dataSource: "user_created",
          verificationStatus: "verified",
          isArchived: false,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
      combinations: [],
      logs: [],
    };

    const jsonStr = JSON.stringify(validBackup);
    const parsed = validateBackupJSON(jsonStr);

    expect(parsed.version).toBe("1.0");
    expect(parsed.foods.length).toBe(1);
    expect(parsed.foods[0].name).toBe("Sample Food");
  });

  it("rejects invalid JSON or malformed structures with clear error messages", () => {
    expect(() => validateBackupJSON("not a json")).toThrow("Invalid JSON format.");

    expect(() => validateBackupJSON(JSON.stringify({ profile: {} }))).toThrow("Missing or invalid 'goals' section in backup.");

    expect(() =>
      validateBackupJSON(
        JSON.stringify({
          profile: DEFAULT_PROFILE,
          goals: DEFAULT_GOALS,
          foods: [{ id: "food_bad" }], // missing name & nutrientValues
          combinations: [],
          logs: [],
        })
      )
    ).toThrow("Invalid food item structure in backup");
  });
});
