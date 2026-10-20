import { FoodLogEntry, NutrientValues, NutritionGoal } from "./types";
import { aggregateDailyNutrients } from "./calculator";
import { shiftDateIso } from "./combination";

export interface DaySummary {
  date: string;
  entryCount: number;
  protein: number | null;
  calories: number | null;
  proteinGoalMet: boolean;
}

export interface RangeSummary {
  days: DaySummary[];
  /** Days that have at least one entry. Empty days are "not logged", not "0 g". */
  loggedDays: number;
  averageProtein: number | null;
  averageCalories: number | null;
  proteinGoalDays: number;
  /** % of logged days on which the protein target was reached. */
  proteinGoalPercent: number | null;
  frequentFoods: { name: string; count: number }[];
  /** Nutrients averaging under 70% of target across logged days (only those with data). */
  commonGaps: { key: keyof NutrientValues; averagePercent: number }[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function summarizeRange(logs: FoodLogEntry[], goals: NutritionGoal, endDate: string, dayCount: number): RangeSummary {
  const dates: string[] = [];
  for (let i = dayCount - 1; i >= 0; i--) dates.push(shiftDateIso(endDate, -i));

  const byDate = new Map<string, FoodLogEntry[]>();
  for (const l of logs) {
    if (!byDate.has(l.loggedAt)) byDate.set(l.loggedAt, []);
    byDate.get(l.loggedAt)!.push(l);
  }

  const gapKeys: (keyof NutrientValues & keyof NutritionGoal)[] = ["protein", "fibre", "iron", "calcium", "zinc", "vitB12", "vitD", "folate"];
  const pctSums: Record<string, { sum: number; n: number }> = {};
  const foodCounts = new Map<string, number>();

  const days: DaySummary[] = dates.map((date) => {
    const entries = byDate.get(date) ?? [];
    const { totals } = aggregateDailyNutrients(entries);
    for (const e of entries) foodCounts.set(e.foodNameSnapshot, (foodCounts.get(e.foodNameSnapshot) ?? 0) + 1);
    if (entries.length) {
      for (const k of gapKeys) {
        const target = goals[k];
        const v = totals[k];
        if (target && v !== null) {
          pctSums[k] ??= { sum: 0, n: 0 };
          pctSums[k].sum += (v / target) * 100;
          pctSums[k].n += 1;
        }
      }
    }
    return {
      date,
      entryCount: entries.length,
      protein: totals.protein,
      calories: totals.calories,
      proteinGoalMet: entries.length > 0 && (totals.protein ?? 0) >= goals.protein,
    };
  });

  const logged = days.filter((d) => d.entryCount > 0);
  const avg = (pick: (d: DaySummary) => number | null) => {
    const vals = logged.map(pick).filter((v): v is number => v !== null);
    return vals.length ? r1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const goalDays = logged.filter((d) => d.proteinGoalMet).length;

  return {
    days,
    loggedDays: logged.length,
    averageProtein: avg((d) => d.protein),
    averageCalories: avg((d) => d.calories),
    proteinGoalDays: goalDays,
    proteinGoalPercent: logged.length ? Math.round((goalDays / logged.length) * 100) : null,
    frequentFoods: [...foodCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5),
    commonGaps: Object.entries(pctSums)
      .map(([key, v]) => ({ key: key as keyof NutrientValues, averagePercent: Math.round(v.sum / v.n) }))
      .filter((g) => g.averagePercent < 70)
      .sort((a, b) => a.averagePercent - b.averagePercent),
  };
}
