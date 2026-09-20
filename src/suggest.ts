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
  planHistory,
  sharedEvenings,
  type Component,
  type Effort,
  type Item,
} from './db.ts';
import { daysBetween, weekday } from './dates.ts';

export type Reason =
  /** Out of rotation. Still reachable through the search field, never offered. */
  | { axis: 'retired' }
  | { axis: 'effort'; effort: Effort }
  /** An evening on its own: it leads an empty plate and stays off a started one. */
  | { axis: 'alone' }
  /** The plate already has one of these. */
  | { axis: 'doubled'; component: Component }
  /** It has been on a plate with `partner` before — most recently, if often. */
  | { axis: 'pair'; partner: string }
  /** The plate is still missing this part. */
  | { axis: 'gap'; component: Component }
  | { axis: 'fresh' }
  /** Back in the rhythm this item keeps for itself. */
  | { axis: 'due'; days: number }
  /** Days between that evening and this one; negative when it is still ahead. */
  | { axis: 'recency'; days: number };

export type Suggestion = { item: Item; reason: Reason | null };

/**
 * One place to tune. Nothing here is a veto — the most unsuitable item in the
 * inventory still shows up, it just shows up last.
 */
const WEIGHT = {
  // Enough that nothing outweighs it. Retiring is not a hint, it is an answer
  // the family already gave — but it sinks the item, it does not hide it.
  retired: -10,
  tooMuch: -3,
  fillsGap: 2,
  pairedBefore: 1,
  standsAlone: 0.5,
  crowdsThePlate: -2,
  doubled: -1,
  // What the family has actually eaten outranks what it has never tried: one
  // shared evening is worth two untouched items, and a staple that is due
  // outranks both.
  neverPlanned: 0.5,
  /** Per cadence an item has been away — see `DUE_CAP`. */
  overdue: 0.5,
  justHad: -2,
};

/** Three shared evenings are as much as the pair axis can say. */
const PAIR_CAP = 3;

/** As many items as the history and the plate can point at, and no more. */
const PLATE_MAX = 3;

/** What a plate is short of. `extra` is never missing, `whole` is never a part. */
const WANTED: Component[] = ['base', 'vegetable', 'protein'];

/**
 * An item's rhythm is read off its own gaps, and two gaps are the fewest that
 * can be told apart from an accident: eaten twice in one week is leftovers,
 * eaten in the same gap three times is a habit.
 */
const ENOUGH_EVENINGS = 3;

/** What an item nobody has repeated is taken to want: three weeks. */
const USUAL_CADENCE = 21;

/** Of its own cadence: under half is too soon, from nine tenths it is due. */
const TOO_SOON = 0.5;
const DUE = 0.9;

/**
 * How many of its own cadences being away can still speak for an item. It is
 * what tells a staple from a one-off: bread three days late has been away one
 * cadence over and over, a dish eaten once a month ago has been away 1.4 of
 * the three weeks it borrowed.
 */
const DUE_CAP = 3;

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
 * What an item's own history says about this evening: how far the nearest
 * evening it has is, and the rhythm it keeps. `days` counts forward from that
 * evening, so an item still ahead is negative.
 */
type Rhythm = { days: number; cadence: number };

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/**
 * The rhythm of every item that has one, for this evening. The nearest evening
 * is what counts, not the last one: a week being filled puts evenings on both
 * sides of the one being ranked, and the one three days back is what says the
 * item was just had.
 *
 * The cadence is the middle gap of the item's own history — the median, so the
 * one holiday week the family ate nothing but bread does not become the rule.
 * Fewer than `ENOUGH_EVENINGS` says nothing yet, and the item borrows the
 * household's usual three weeks.
 */
function rhythms(date: string, history: Map<number, string[]>): Map<number, Rhythm> {
  const rhythms = new Map<number, Rhythm>();

  for (const [id, dates] of history) {
    let days = daysBetween(dates[0]!, date);
    for (const evening of dates) {
      const distance = daysBetween(evening, date);
      // Ties go to the evening already eaten: it is the one that is certain.
      if (Math.abs(distance) < Math.abs(days) || (Math.abs(distance) === Math.abs(days) && distance > 0)) {
        days = distance;
      }
    }

    const gaps = dates.slice(1).map((evening, index) => daysBetween(dates[index]!, evening));
    rhythms.set(id, { days, cadence: dates.length >= ENOUGH_EVENINGS ? median(gaps) : USUAL_CADENCE });
  }

  return rhythms;
}

/** The shape of the evening every item is weighed against. */
type Evening = {
  date: string;
  effort: Effort;
  empty: boolean;
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
function weigh(item: Item, evening: Evening, pairing?: Pairing, rhythm?: Rhythm): Ranked {
  let score = 0;
  let reason: Reason | null = null;

  if (item.retired) {
    score += WEIGHT.retired;
    reason = { axis: 'retired' };
  }

  if (EFFORT_ORDER.indexOf(item.effort) > EFFORT_ORDER.indexOf(evening.effort)) {
    score += WEIGHT.tooMuch;
    reason ??= { axis: 'effort', effort: evening.effort };
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

  if (item.component !== null && evening.missing.has(item.component)) {
    score += WEIGHT.fillsGap;
    reason ??= { axis: 'gap', component: item.component! };
  }

  if (!rhythm) {
    score += WEIGHT.neverPlanned;
    reason ??= { axis: 'fresh' };
  } else {
    // An evening three days ahead repeats as much as one three days back, so
    // the penalty counts the distance and not the direction. Being due is the
    // other way round: only an evening already eaten can say the rhythm is up.
    const ratio = Math.abs(rhythm.days) / rhythm.cadence;
    if (ratio < TOO_SOON) {
      score += WEIGHT.justHad;
      reason ??= { axis: 'recency', days: rhythm.days };
    } else if (ratio >= DUE && rhythm.days > 0) {
      score += Math.min(ratio, DUE_CAP) * WEIGHT.overdue;
      reason ??= { axis: 'due', days: rhythm.days };
    } else {
      reason ??= { axis: 'recency', days: rhythm.days };
    }
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
  const rhythm = rhythms(date, planHistory());
  const covered = new Set(plate.map((item) => item.component).filter((c) => c !== null));

  const evening: Evening = {
    date,
    effort: effortGrid()[weekday(date)]!,
    empty: plate.length === 0,
    covered,
    // A plate that has not started is short of nothing, and neither is one a
    // `whole` item has finished — that is all `whole` means.
    missing: new Set(
      plate.length === 0 || covered.has('whole') ? [] : WANTED.filter((part) => !covered.has(part)),
    ),
  };

  return items
    .filter((item) => !onPlate.has(item.id))
    .map((item) => weigh(item, evening, paired.get(item.id), rhythm.get(item.id)))
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
 * Fill an empty evening: the best item, then whatever that item has actually
 * been on a plate with, until it points nowhere. An evening that already has
 * something on it is left alone — clearing a day is how you ask again.
 *
 * How far it fills is decided by the history, not by a number of items: a
 * `whole` item is the evening, and an item nobody has combined with anything
 * gets the evening to itself. That is honest.
 */
export function fillEvening(date: string): Item[] {
  if (plateOf(date).length > 0) return plateOf(date);

  // Proposing is the one place that decides rather than suggests, so a retired
  // item is out of it entirely — in the list it merely sits last.
  const candidates = () => rank(date).filter(({ item }) => !item.retired);

  const first = candidates()[0]?.item;
  if (!first) return [];
  addToPlan(date, first.id);

  // A `whole` item is the evening; nothing else belongs on that plate.
  while (first.component !== 'whole' && plateOf(date).length < PLATE_MAX) {
    // Only what the family has actually put on one plate. A part the plate is
    // structurally short of is a hint for the list, not a licence to combine:
    // that is how three items that have never met end up on one evening.
    const next = candidates().find((candidate) => candidate.pairs > 0);
    if (!next) break;
    addToPlan(date, next.item.id);
  }

  return plateOf(date);
}
