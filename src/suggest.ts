// Which items to offer for one evening, and why. Every axis is a nudge with a
// reason, never a filter: the whole inventory stays reachable and only the
// order changes — the app suggests, it does not decide.
//
// Reasons travel structured. The German words for them live in the frontend,
// like every other word the family reads.
import {
  EFFORT_ORDER,
  addToPlan,
  effortGrid,
  listItems,
  planBetween,
  sharedEvenings,
  type Effort,
  type Item,
} from './db.ts';
import { daysBetween, weekday } from './dates.ts';
import { vegetarianOk } from './week.ts';

export type Reason =
  | { axis: 'effort'; effort: Effort }
  /** It has been on a plate with `partner` before — most recently, if often. */
  | { axis: 'pair'; partner: string }
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
  pairedBefore: 1,
  neverPlanned: 1.5,
  longAgo: 1,
  aWhileAgo: 0.5,
  justHad: -2,
};

/** One shared evening is worth about as much as novelty, two outweigh it. */
const PAIR_CAP = 2;

/** As many items as the history can point at. The vegetarians outrank it. */
const PLATE_MAX = 3;

const LONG_AGO = 28;
const A_WHILE = 14;
const JUST_HAD = 7;

/** How often an item has shared a plate with the evening, and with what. */
type Pairing = { evenings: number; partner: string };

/**
 * What the plate points at. An item counts once per shared evening, and the
 * partner named is the one from the most recent of them.
 */
function pairings(plate: Item[], nameOf: (id: number) => string): Map<number, Pairing> {
  const evenings = new Map<number, Set<string>>();
  const partner = new Map<number, string>();

  for (const row of sharedEvenings(plate.map((item) => item.id))) {
    let dates = evenings.get(row.id);
    if (!dates) evenings.set(row.id, (dates = new Set()));
    dates.add(row.date);
    partner.set(row.id, nameOf(row.partner_id)); // oldest first, so the last write is the latest evening
  }

  return new Map([...evenings].map(([id, dates]) => [id, { evenings: dates.size, partner: partner.get(id)! }]));
}

/**
 * Precedence decides which reason is shown, not the weight: why you would
 * hesitate outranks why you would bother.
 */
function weigh(item: Item, date: string, effort: Effort, vegGap: boolean, pairing?: Pairing): Ranked {
  let score = 0;
  let reason: Reason | null = null;

  if (EFFORT_ORDER.indexOf(item.effort) > EFFORT_ORDER.indexOf(effort)) {
    score += WEIGHT.tooMuch;
    reason = { axis: 'effort', effort };
  }

  const pairs = pairing?.evenings ?? 0;
  if (pairs > 0) {
    score += Math.min(pairs * WEIGHT.pairedBefore, PAIR_CAP);
    reason ??= { axis: 'pair', partner: pairing!.partner };
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

  return { item, reason, score, pairs };
}

/** What the ranking knows. Only the item and its reason leave this file. */
type Ranked = Suggestion & { score: number; pairs: number };

function rank(date: string): Ranked[] {
  const plate = planBetween(date, date).get(date) ?? [];
  const onPlate = new Set(plate.map((item) => item.id));
  const items = listItems();
  const names = new Map(items.map((item) => [item.id, item.name]));
  const paired = pairings(plate, (id) => names.get(id) ?? '');
  const effort = effortGrid()[weekday(date)]!;
  // An empty evening has no gap yet — every evening starts without one, and a
  // permanent bonus for meatless items would be a thumb on the scale.
  const vegGap = plate.length > 0 && !vegetarianOk(plate);

  return items
    .filter((item) => !onPlate.has(item.id))
    .map((item) => weigh(item, date, effort, vegGap, paired.get(item.id)))
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'de'));
}

/** The whole inventory minus what is already on the plate, best first. */
export const suggest = (date: string): Suggestion[] =>
  rank(date).map(({ item, reason }) => ({ item, reason }));

const plateOf = (date: string): Item[] => planBetween(date, date).get(date) ?? [];

/**
 * Fill an empty evening: the best item, then whatever that item has shared a
 * plate with before, until the plate stops pointing at anything. An evening
 * that already has something on it is left alone — clearing a day is how you
 * ask again.
 *
 * How far it fills is decided by the history, not by a number of items: a
 * combination nobody has cooked yet gets one item, and that is honest.
 */
export function fillEvening(date: string): Item[] {
  if (plateOf(date).length > 0) return plateOf(date);

  const first = rank(date)[0]?.item;
  if (!first) return [];
  addToPlan(date, first.id);

  while (plateOf(date).length < PLATE_MAX) {
    // The best candidate the plate actually points at — not simply the best
    // one, or the evening would fill itself with unrelated favourites.
    const partner = rank(date).find((candidate) => candidate.pairs > 0);
    if (!partner) break;
    addToPlan(date, partner.item.id);
  }

  // The one hard rule in the app, so it outranks the size of the plate.
  if (!vegetarianOk(plateOf(date))) {
    const meatless = rank(date).find(({ item }) => item.vegetarian)?.item;
    if (meatless) addToPlan(date, meatless.id);
  }

  return plateOf(date);
}
