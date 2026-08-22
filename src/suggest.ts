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
  type Component,
  type Effort,
  type Item,
} from './db.ts';
import { daysBetween, weekday } from './dates.ts';
import { vegetarianOk } from './week.ts';

export type Reason =
  | { axis: 'effort'; effort: Effort }
  /** An evening on its own: it leads an empty plate and stays off a started one. */
  | { axis: 'alone' }
  /** The plate already has one of these. */
  | { axis: 'doubled'; component: Component }
  /** It has been on a plate with `partner` before — most recently, if often. */
  | { axis: 'pair'; partner: string }
  /** The plate is still missing this part. */
  | { axis: 'gap'; component: Component }
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
  fillsGap: 2,
  pairedBefore: 1,
  standsAlone: 1,
  crowdsThePlate: -2,
  doubled: -1,
  neverPlanned: 1.5,
  longAgo: 1,
  aWhileAgo: 0.5,
  justHad: -2,
};

/** One shared evening is worth about as much as novelty, two outweigh it. */
const PAIR_CAP = 2;

/** As many items as the history and the plate can point at. The two outrank it. */
const PLATE_MAX = 3;

/** What a plate is short of. `extra` is never missing, `whole` is never a part. */
const WANTED: Component[] = ['base', 'vegetable', 'protein'];

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

/** The shape of the evening every item is weighed against. */
type Evening = {
  date: string;
  effort: Effort;
  empty: boolean;
  /** The plate has something on it, and nothing meatless. */
  vegGap: boolean;
  /** The parts the plate already carries. */
  covered: Set<Component>;
  /** The parts it is still short of — empty before it starts and once it is finished. */
  missing: Set<Component>;
};

/**
 * Precedence decides which reason is shown, not the weight: why you would
 * hesitate outranks why you would bother, and what the family has actually
 * cooked outranks what the plate is structurally short of.
 */
function weigh(item: Item, evening: Evening, pairing?: Pairing): Ranked {
  let score = 0;
  let reason: Reason | null = null;

  if (EFFORT_ORDER.indexOf(item.effort) > EFFORT_ORDER.indexOf(evening.effort)) {
    score += WEIGHT.tooMuch;
    reason = { axis: 'effort', effort: evening.effort };
  }

  // `whole` is an evening, not a part of one — the same sentence explains why
  // it leads an empty plate and why it stays off a plate that has started.
  if (item.component === 'whole') {
    score += evening.empty ? WEIGHT.standsAlone : WEIGHT.crowdsThePlate;
    reason ??= { axis: 'alone' };
  } else if (item.component !== null && evening.covered.has(item.component)) {
    score += WEIGHT.doubled;
    reason ??= { axis: 'doubled', component: item.component };
  }

  const pairs = pairing?.evenings ?? 0;
  if (pairs > 0) {
    score += Math.min(pairs * WEIGHT.pairedBefore, PAIR_CAP);
    reason ??= { axis: 'pair', partner: pairing!.partner };
  }

  const fills = item.component !== null && evening.missing.has(item.component);
  if (fills) {
    score += WEIGHT.fillsGap;
    reason ??= { axis: 'gap', component: item.component! };
  }

  if (evening.vegGap && item.vegetarian) {
    score += WEIGHT.fillsVegGap;
    reason ??= { axis: 'veg' };
  }

  if (item.last_used === null) {
    score += WEIGHT.neverPlanned;
    reason ??= { axis: 'fresh' };
  } else {
    // An evening three days ahead repeats as much as one three days back, so
    // the distance counts and the direction does not.
    const days = daysBetween(item.last_used, evening.date);
    const apart = Math.abs(days);
    score +=
      apart >= LONG_AGO ? WEIGHT.longAgo : apart >= A_WHILE ? WEIGHT.aWhileAgo : apart < JUST_HAD ? WEIGHT.justHad : 0;
    reason ??= { axis: 'recency', days };
  }

  return { item, reason, score, pairs, fills };
}

/** What the ranking knows. Only the item and its reason leave this file. */
type Ranked = Suggestion & { score: number; pairs: number; fills: boolean };

function rank(date: string): Ranked[] {
  const plate = planBetween(date, date).get(date) ?? [];
  const onPlate = new Set(plate.map((item) => item.id));
  const items = listItems();
  const names = new Map(items.map((item) => [item.id, item.name]));
  const paired = pairings(plate, (id) => names.get(id) ?? '');
  const covered = new Set(plate.map((item) => item.component).filter((c) => c !== null));

  const evening: Evening = {
    date,
    effort: effortGrid()[weekday(date)]!,
    empty: plate.length === 0,
    // An empty evening has no gap yet — every evening starts without one, and a
    // permanent bonus for meatless items would be a thumb on the scale.
    vegGap: plate.length > 0 && !vegetarianOk(plate),
    covered,
    // A plate that has not started is short of nothing, and neither is one a
    // `whole` item has finished — that is all `whole` means.
    missing: new Set(
      plate.length === 0 || covered.has('whole') ? [] : WANTED.filter((part) => !covered.has(part)),
    ),
  };

  return items
    .filter((item) => !onPlate.has(item.id))
    .map((item) => weigh(item, evening, paired.get(item.id)))
    .sort(
      (a, b) =>
        b.score - a.score ||
        // Where the score cannot tell two items apart, the one that has been
        // away longest wins. A name is an arbitrary tiebreak; time is not.
        (a.item.last_used ?? '').localeCompare(b.item.last_used ?? '') ||
        a.item.name.localeCompare(b.item.name, 'de'),
    );
}

/** The whole inventory minus what is already on the plate, best first. */
export const suggest = (date: string): Suggestion[] =>
  rank(date).map(({ item, reason }) => ({ item, reason }));

const plateOf = (date: string): Item[] => planBetween(date, date).get(date) ?? [];

/**
 * Fill an empty evening: the best item, then whatever that item has shared a
 * plate with before or the plate is still short of, until it points nowhere.
 * An evening that already has something on it is left alone — clearing a day
 * is how you ask again.
 *
 * How far it fills is decided by the history and the plate, not by a number of
 * items: a `whole` item is the evening, and a combination nobody has cooked
 * out of items nobody has sorted gets one item. That is honest.
 */
export function fillEvening(date: string): Item[] {
  if (plateOf(date).length > 0) return plateOf(date);

  const first = rank(date)[0]?.item;
  if (!first) return [];
  addToPlan(date, first.id);

  // A `whole` item is the evening; nothing else belongs on that plate.
  while (first.component !== 'whole' && plateOf(date).length < PLATE_MAX) {
    // The best candidate the plate actually points at — not simply the best
    // one, or the evening would fill itself with unrelated favourites.
    const next = rank(date).find((candidate) => candidate.pairs > 0 || candidate.fills);
    if (!next) break;
    addToPlan(date, next.item.id);
  }

  // The one hard rule in the app, so it outranks the size of the plate.
  if (!vegetarianOk(plateOf(date))) {
    const meatless = rank(date).find(({ item }) => item.vegetarian)?.item;
    if (meatless) addToPlan(date, meatless.id);
  }

  return plateOf(date);
}
