// Which items to offer for one evening, and why. Every axis is a nudge with a
// reason, never a filter: the whole inventory stays reachable and only the
// order changes — the app suggests, it does not decide.
//
// Reasons travel structured. The German words for them live in the frontend,
// like every other word the family reads.
import { EFFORT_ORDER, addToPlan, effortGrid, listItems, planBetween, type Effort, type Item } from './db.ts';
import { daysBetween, weekday } from './dates.ts';
import { vegetarianOk } from './week.ts';

export type Reason =
  | { axis: 'effort'; effort: Effort }
  | { axis: 'veg' }
  | { axis: 'fresh' }
  /** Days between that evening and this one; negative when it is still ahead. */
  | { axis: 'recency'; days: number };

export type Suggestion = { item: Item; reason: Reason | null };

/**
 * One place to tune. Nothing here is a veto — the most unsuitable item in the
 * inventory still shows up, it just shows up last.
 */
const WEIGHT = {
  tooMuch: -3,
  fillsVegGap: 2,
  neverPlanned: 1.5,
  longAgo: 1,
  aWhileAgo: 0.5,
  justHad: -2,
};

const LONG_AGO = 28;
const A_WHILE = 14;
const JUST_HAD = 7;

/**
 * Precedence decides which reason is shown, not the weight: why you would
 * hesitate outranks why you would bother.
 */
function weigh(item: Item, date: string, effort: Effort, vegGap: boolean): Suggestion & { score: number } {
  let score = 0;
  let reason: Reason | null = null;

  if (EFFORT_ORDER.indexOf(item.effort) > EFFORT_ORDER.indexOf(effort)) {
    score += WEIGHT.tooMuch;
    reason = { axis: 'effort', effort };
  }

  if (vegGap && item.vegetarian) {
    score += WEIGHT.fillsVegGap;
    reason ??= { axis: 'veg' };
  }

  if (item.last_used === null) {
    score += WEIGHT.neverPlanned;
    reason ??= { axis: 'fresh' };
  } else {
    // An evening three days ahead repeats as much as one three days back, so
    // the distance counts and the direction does not.
    const days = daysBetween(item.last_used, date);
    const apart = Math.abs(days);
    score +=
      apart >= LONG_AGO ? WEIGHT.longAgo : apart >= A_WHILE ? WEIGHT.aWhileAgo : apart < JUST_HAD ? WEIGHT.justHad : 0;
    reason ??= { axis: 'recency', days };
  }

  return { item, reason, score };
}

/** The whole inventory minus what is already on the plate, best first. */
export function suggest(date: string): Suggestion[] {
  const plate = planBetween(date, date).get(date) ?? [];
  const onPlate = new Set(plate.map((item) => item.id));
  const effort = effortGrid()[weekday(date)]!;
  // An empty evening has no gap yet — every evening starts without one, and a
  // permanent bonus for meatless items would be a thumb on the scale.
  const vegGap = plate.length > 0 && !vegetarianOk(plate);

  return listItems()
    .filter((item) => !onPlate.has(item.id))
    .map((item) => weigh(item, date, effort, vegGap))
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'de'))
    .map(({ item, reason }) => ({ item, reason }));
}

/**
 * Fill an empty evening: the best item, and a meatless one beside it if that
 * would otherwise leave the two vegetarians without a plate. An evening that
 * already has something on it is left alone — clearing a day is how you ask
 * again.
 *
 * Two items is all the axes can honestly justify today. What decides how far
 * this fills is the plate itself, and the plate does not speak yet.
 */
export function fillEvening(date: string): Item[] {
  const plate = planBetween(date, date).get(date) ?? [];
  if (plate.length > 0) return plate;

  const ranked = suggest(date);
  const first = ranked[0]?.item;
  if (!first) return [];
  addToPlan(date, first.id);

  if (!first.vegetarian) {
    const meatless = ranked.find(({ item }) => item.vegetarian)?.item;
    if (meatless) addToPlan(date, meatless.id);
  }

  return planBetween(date, date).get(date) ?? [];
}
