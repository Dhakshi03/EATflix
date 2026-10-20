import { describe, it, expect } from "vitest";
import { summarizeRange } from "./progress";
import { createEmptyNutrients } from "./calculator";
import { DEFAULT_GOALS } from "../storage/indexed-db";
import { FoodLogEntry } from "./types";

const entry = (date: string, name: string, protein: number | null, extra: Partial<FoodLogEntry["nutritionSnapshot"]> = {}): FoodLogEntry => ({
  id: `${date}-${name}-${Math.random()}`,
  userId: "u",
  foodId: null,
  foodNameSnapshot: name,
  servingQuantity: 1,
  servingUnit: "piece",
  nutritionSnapshot: { ...createEmptyNutrients(), protein, calories: 100, ...extra },
  mealType: "lunch",
  entrySource: "manual",
  loggedAt: date,
  createdAt: "",
});

describe("summarizeRange", () => {
  const goals = { ...DEFAULT_GOALS, protein: 80 };

  it("excludes unlogged days from averages instead of counting them as 0", () => {
    const s = summarizeRange([entry("2026-10-09", "Eggs", 90), entry("2026-10-07", "Dal", 50)], goals, "2026-10-09", 7);
    expect(s.days).toHaveLength(7);
    expect(s.loggedDays).toBe(2);
    expect(s.averageProtein).toBe(70);
    expect(s.proteinGoalDays).toBe(1);
    expect(s.proteinGoalPercent).toBe(50);
  });

  it("covers range boundaries inclusively and ignores entries outside", () => {
    const s = summarizeRange([entry("2026-10-02", "Out", 80), entry("2026-10-03", "In", 80)], goals, "2026-10-09", 7);
    expect(s.days[0].date).toBe("2026-10-03");
    expect(s.days[6].date).toBe("2026-10-09");
    expect(s.loggedDays).toBe(1);
  });

  it("spans month boundaries", () => {
    const s = summarizeRange([], goals, "2026-03-02", 4);
    expect(s.days.map((d) => d.date)).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(s.averageProtein).toBeNull();
    expect(s.proteinGoalPercent).toBeNull();
  });

  it("keeps unknown protein as unknown, not zero", () => {
    const s = summarizeRange([entry("2026-10-09", "Mystery", null)], goals, "2026-10-09", 1);
    expect(s.days[0].protein).toBeNull();
    expect(s.averageProtein).toBeNull();
    expect(s.proteinGoalDays).toBe(0);
  });

  it("ranks frequent foods and flags common gaps only where data exists", () => {
    const logs = [entry("2026-10-08", "Eggs", 20, { iron: 2 }), entry("2026-10-09", "Eggs", 20, { iron: 2 }), entry("2026-10-09", "Dal", 10)];
    const s = summarizeRange(logs, goals, "2026-10-09", 2);
    expect(s.frequentFoods[0]).toEqual({ name: "Eggs", count: 2 });
    expect(s.commonGaps.find((g) => g.key === "iron")).toBeTruthy();
    expect(s.commonGaps.find((g) => g.key === "zinc")).toBeUndefined(); // no zinc data at all
  });
});
