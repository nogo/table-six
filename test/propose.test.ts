import { beforeEach, expect, test } from 'bun:test';
import { addToPlan, createItem, db, draftsBetween, planBetween, removeFromPlan, setWeekdayEffort, updateItem } from '../src/db.ts';
import { proposeWeek } from '../src/propose.ts';
import { weekDays } from '../src/dates.ts';

const MONDAY = '2026-11-02';
const NOW = '2026-10-27';
const plates = () => planBetween(MONDAY, '2026-11-08');
const drafts = () => draftsBetween(MONDAY, '2026-11-08');

beforeEach(() => {
  db.exec('DELETE FROM drafts; DELETE FROM plan; DELETE FROM items; DELETE FROM weekday_effort');
});

function history(count = 8) {
  return Array.from({ length: count }, (_, i) => {
    const item = createItem(`Meal ${i}`, 'kurz', 'whole');
    addToPlan(`2026-09-${String(i + 1).padStart(2, '0')}`, item.id);
    return item;
  });
}

test('a proposal fills the selected week with distinct past meals and keeps its first draft', () => {
  history();
  expect(proposeWeek('2026-11-04', NOW)).toEqual({ filled: 7, remaining: 0 });
  expect(plates().size).toBe(7);
  expect(new Set([...plates().values()].flat().map((item) => item.id)).size).toBe(7);
  expect(drafts().size).toBe(7);
  const original = [...drafts()];
  expect(proposeWeek(MONDAY, NOW)).toEqual({ filled: 0, remaining: 0 });
  expect([...drafts()]).toEqual(original);
});

test('past days and hand planned evenings stay unchanged, including later days in the week', () => {
  const items = history();
  addToPlan('2026-11-08', items[0]!.id);
  expect(proposeWeek(MONDAY, '2026-11-04')).toEqual({ filled: 4, remaining: 0 });
  expect(plates().has(MONDAY)).toBe(false);
  expect(plates().has('2026-11-03')).toBe(false);
  expect(plates().get('2026-11-08')!.map((item) => item.id)).toEqual([items[0]!.id]);
  expect(drafts().has('2026-11-08')).toBe(false);
  expect([...plates().values()].flat().filter((item) => item.id === items[0]!.id)).toHaveLength(1);
});

test('future and today plans never teach new meals', () => {
  const future = createItem('Not eaten', 'kurz');
  addToPlan(NOW, future.id);
  addToPlan('2026-12-01', future.id);
  expect(proposeWeek(MONDAY, NOW)).toEqual({ filled: 0, remaining: 7 });
  expect(drafts().size).toBe(0);
});

test('a meal is the complete historical plate, never a chain of pairs', () => {
  const a = createItem('A', 'kurz');
  const b = createItem('B', 'kurz');
  const c = createItem('C', 'kurz');
  for (const item of [a, b]) addToPlan('2026-09-01', item.id);
  for (const item of [b, c]) addToPlan('2026-09-02', item.id);
  expect(proposeWeek(MONDAY, NOW)).toEqual({ filled: 2, remaining: 5 });
  expect([...plates().values()].map((items) => items.map((item) => item.id).sort()).sort())
    .toEqual([[a.id, b.id], [b.id, c.id]]);
});

test('effort and paused items exclude whole plates without silently dropping a side', () => {
  const quick = createItem('Quick', 'kurz');
  const slow = createItem('Slow', 'entspannt');
  const paused = createItem('Paused', 'kurz');
  addToPlan('2026-09-01', quick.id);
  addToPlan('2026-09-01', slow.id);
  addToPlan('2026-09-02', quick.id);
  addToPlan('2026-09-02', paused.id);
  updateItem(paused.id, { ...paused, retired: true });
  for (let day = 1; day <= 7; day++) setWeekdayEffort(day, 'kurz');
  expect(proposeWeek(MONDAY, NOW)).toEqual({ filled: 0, remaining: 7 });
  setWeekdayEffort(7, 'entspannt');
  expect(proposeWeek(MONDAY, NOW)).toEqual({ filled: 1, remaining: 6 });
  expect(plates().get('2026-11-08')!.map((item) => item.id)).toEqual([quick.id, slow.id]);
});

test('familiar meals lead when repetition and effort do not distinguish them', () => {
  const items = history();
  for (const date of ['2026-09-20', '2026-09-21', '2026-09-22']) addToPlan(date, items[7]!.id);
  for (const date of weekDays(MONDAY).slice(1)) addToPlan(date, createItem(`Fixed ${date}`, 'kurz').id);
  proposeWeek(MONDAY, NOW);
  expect(plates().get(MONDAY)![0]!.id).toBe(items[7]!.id);
});

test('a draft survives corrections and renames, and proposing again adds one beside it', () => {
  history();
  proposeWeek(MONDAY, NOW);
  const [original] = drafts().get(MONDAY)!;
  const first = plates().get(MONDAY)![0]!;
  removeFromPlan(MONDAY, first.id);
  updateItem(first.id, { ...first, name: 'Renamed', retired: true });
  proposeWeek(MONDAY, NOW);

  const [kept, again] = drafts().get(MONDAY)!;
  expect(kept).toEqual(original!);
  expect(again!.items.map((item) => item.id)).toEqual([plates().get(MONDAY)![0]!.id]);
  expect(plates().get(MONDAY)![0]!.id).not.toBe(first.id);
});

test('saving the draft and plan succeeds together or rolls back together', () => {
  history();
  db.exec("CREATE TEMP TRIGGER refuse_plan BEFORE INSERT ON plan BEGIN SELECT RAISE(ABORT, 'refused'); END");
  try {
    expect(() => proposeWeek(MONDAY, NOW)).toThrow('refused');
    expect(plates().size).toBe(0);
    expect(drafts().size).toBe(0);
  } finally {
    db.exec('DROP TRIGGER refuse_plan');
  }
});

test('a nearby future plan discourages repetition without teaching its frequency', () => {
  const items = history(2);
  for (const date of weekDays(MONDAY).slice(1)) addToPlan(date, createItem(`Fixed ${date}`, 'kurz').id);
  addToPlan('2026-11-01', items[0]!.id);
  proposeWeek(MONDAY, NOW);
  expect(plates().get(MONDAY)![0]!.id).toBe(items[1]!.id);
});

test('the week leaves the only quick meal for the day that needs it', () => {
  const quick = createItem('Quick', 'kurz');
  const normal = createItem('Normal', 'normal');
  addToPlan('2026-09-01', quick.id);
  addToPlan('2026-09-02', quick.id);
  addToPlan('2026-09-03', normal.id);
  setWeekdayEffort(2, 'kurz');
  for (const date of weekDays(MONDAY).slice(2)) addToPlan(date, createItem(`Fixed ${date}`, 'kurz').id);
  expect(proposeWeek(MONDAY, NOW).filled).toBe(2);
  expect(plates().get(MONDAY)![0]!.id).toBe(normal.id);
  expect(plates().get('2026-11-03')![0]!.id).toBe(quick.id);
});
