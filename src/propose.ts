// A week of familiar, complete past meals. Future plans discourage repetition
// but never teach combinations. The original proposal is kept for human review.
import { addToPlan, asksTooMuch, db, effortGrid, planBetween, saveDraft, type Item } from './db.ts';
import { daysBetween, today, weekDays, weekStart, weekday } from './dates.ts';

type Meal = { key: string; items: Item[]; count: number; last: string };
type Choice = { date: string; meal: Meal };
type PartialWeek = { score: number; choices: Choice[]; used: Map<number, number>; meals: Set<string> };

const mealKey = (items: Item[]): string => items.map(({ id }) => id).sort((a, b) => a - b).join(',');

function pastMeals(plan: Map<string, Item[]>, before: string): Meal[] {
  const meals = new Map<string, Meal>();
  for (const [date, items] of plan) {
    if (date >= before || items.some((item) => item.retired)) continue;
    const key = mealKey(items);
    const previous = meals.get(key);
    meals.set(key, { key, items, count: (previous?.count ?? 0) + 1, last: date });
  }
  return [...meals.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function countItems(used: Map<number, number>, items: Item[]): Map<number, number> {
  const next = new Map(used);
  for (const item of items) next.set(item.id, (next.get(item.id) ?? 0) + 1);
  return next;
}

/**
 * Familiar meals lead (draft B of the November 2026 experiment): eaten often
 * first, time away second, nearby repeats sink.
 */
function preference(meal: Meal, date: string, outside: Map<string, Item[]>): number {
  let score = 2.5 * Math.min(meal.count, 5) + 0.45 * Math.min(daysBetween(meal.last, date), 60) / 14;
  for (const item of meal.items) {
    let nearest = Infinity;
    for (const [other, items] of outside) {
      if (items.some(({ id }) => id === item.id)) nearest = Math.min(nearest, Math.abs(daysBetween(other, date)));
    }
    score -= Math.max(0, 10 - nearest) * 0.7;
  }
  return score;
}

/** Fill only today or later, only empty dates, atomically with a draft of each proposal. */
export function proposeWeek(start: string, current = today()): { filled: number; remaining: number } {
  return db.transaction(() => {
    const dates = weekDays(weekStart(start));
    const plan = planBetween('0000-01-01', '9999-12-31');
    const meals = pastMeals(plan, current);
    const grid = effortGrid();
    const outside = new Map([...plan].filter(([date]) => !dates.includes(date)));
    const initial: PartialWeek = { score: 0, choices: [], used: new Map(), meals: new Set() };
    for (const date of dates) {
      const items = plan.get(date);
      if (!items) continue;
      initial.used = countItems(initial.used, items);
      initial.meals.add(mealKey(items));
    }

    const empty = dates.filter((date) => date >= current && !plan.has(date));
    let alternatives = [initial];
    for (const date of empty) {
      const candidates = meals
        .filter((meal) => meal.items.every((item) => !asksTooMuch(item, grid[weekday(date)]!)))
        .map((meal) => ({ meal, score: preference(meal, date, outside) }));
      const next: PartialWeek[] = [];
      for (const partial of alternatives) {
        // Leaving a day empty lets scarce suitable meals go to another day.
        next.push(partial);
        for (const candidate of candidates) {
          const { meal } = candidate;
          if (partial.meals.has(meal.key)) continue;
          const repeats = meal.items.reduce((sum, item) => sum + (partial.used.get(item.id) ?? 0), 0);
          next.push({
            score: partial.score + candidate.score - 6 * repeats,
            choices: [...partial.choices, { date, meal }],
            used: countItems(partial.used, meal.items),
            meals: new Set([...partial.meals, meal.key]),
          });
        }
      }
      // Keep a bounded set of partial weeks rather than commit to Monday's winner.
      next.sort((a, b) => b.choices.length - a.choices.length || b.score - a.score);
      alternatives = next.slice(0, 160);
    }
    const choices = alternatives[0]!.choices;
    for (const { date, meal } of choices) {
      saveDraft(date, current, meal.items);
      for (const item of meal.items) addToPlan(date, item.id);
    }
    return { filled: choices.length, remaining: empty.length - choices.length };
  })();
}
