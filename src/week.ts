// What the board shows for one week: the plate of every evening plus the one
// hint the board draws — the effort warning. It is a hint, never a veto:
// nothing here refuses to store anything.
import { EFFORT_ORDER, effortGrid, planBetween, type Effort, type Item } from './db.ts';
import { isoWeek, weekDays, weekday } from './dates.ts';

export type Evening = {
  date: string;
  /** 1 = Monday … 7 = Sunday. */
  weekday: number;
  effort: Effort;
  items: Item[];
  /** The plate asks for more than the evening has time for. */
  overEffort: boolean;
};

export type Week = { start: string; end: string; week: number; days: Evening[] };

/** An evening blows its level when one item asks for more than the day allows. */
export const overEffort = (items: Item[], level: Effort): boolean =>
  items.some((item) => EFFORT_ORDER.indexOf(item.effort) > EFFORT_ORDER.indexOf(level));

export function buildWeek(start: string): Week {
  const dates = weekDays(start);
  const grid = effortGrid();
  const plan = planBetween(dates[0]!, dates[6]!);

  return {
    start: dates[0]!,
    end: dates[6]!,
    week: isoWeek(start),
    days: dates.map((date) => {
      const items = plan.get(date) ?? [];
      const effort = grid[weekday(date)]!;
      return {
        date,
        weekday: weekday(date),
        effort,
        items,
        overEffort: overEffort(items, effort),
      };
    }),
  };
}
