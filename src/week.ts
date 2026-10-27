// What the board shows for one week: the plate of every evening plus the one
// hint the board draws — the effort warning. It is a hint, never a veto:
// nothing here refuses to store anything.
import { asksTooMuch, effortGrid, planBetween, type Effort, type Item } from './db.ts';
import { isoWeek, today, weekDays, weekday } from './dates.ts';

export type Evening = {
  date: string;
  /** 1 = Monday … 7 = Sunday. */
  weekday: number;
  effort: Effort;
  items: Item[];
  /** Names of the items that ask for more than the evening has time for; empty when it fits. */
  tooMuch: string[];
};

export type Week = {
  start: string;
  end: string;
  week: number;
  days: Evening[];
  /** Some evening from `current` on is still empty — what a week proposal fills. */
  canPropose: boolean;
};

export function buildWeek(start: string, current = today()): Week {
  const dates = weekDays(start);
  const grid = effortGrid();
  const plan = planBetween(dates[0]!, dates[6]!);

  return {
    start: dates[0]!,
    end: dates[6]!,
    week: isoWeek(start),
    canPropose: dates.some((date) => date >= current && !plan.has(date)),
    days: dates.map((date) => {
      const items = plan.get(date) ?? [];
      const effort = grid[weekday(date)]!;
      return {
        date,
        weekday: weekday(date),
        effort,
        items,
        tooMuch: items.filter((item) => asksTooMuch(item, effort)).map((item) => item.name),
      };
    }),
  };
}
