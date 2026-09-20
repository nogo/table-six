import { beforeEach, expect, test } from 'bun:test';
import { addToPlan, createItem, db, setWeekdayEffort } from '../src/db.ts';
import { buildWeek } from '../src/week.ts';

const MONDAY = '2026-08-17';
const WEDNESDAY = '2026-08-19';

beforeEach(() => {
  db.exec('DELETE FROM plan; DELETE FROM items; DELETE FROM weekday_effort');
});

test('an empty week is seven evenings with nothing on them', () => {
  const week = buildWeek(MONDAY);
  expect(week).toMatchObject({ start: MONDAY, end: '2026-08-23', week: 34 });
  expect(week.days).toHaveLength(7);
  expect(week.days.every((day) => day.items.length === 0)).toBe(true);
  expect(week.days.every((day) => day.effort === 'normal')).toBe(true); // untouched weekdays
});

test('a plate keeps the order it was filled in', () => {
  const potatoes = createItem('Kartoffeln', 'normal');
  const broccoli = createItem('Broccoli', 'kurz');
  const sausage = createItem('Bratwurst', 'kurz');
  for (const item of [potatoes, broccoli, sausage]) addToPlan(WEDNESDAY, item.id);

  const wednesday = buildWeek(MONDAY).days[2]!;
  expect(wednesday.date).toBe(WEDNESDAY);
  expect(wednesday.items.map((item) => item.name)).toEqual(['Kartoffeln', 'Broccoli', 'Bratwurst']);
});

test('the effort grid recurs by weekday, not by date', () => {
  setWeekdayEffort(3, 'kurz'); // Wednesday, every week
  expect(buildWeek(MONDAY).days[2]!.effort).toBe('kurz');
  expect(buildWeek('2026-08-24').days[2]!.effort).toBe('kurz');
  expect(buildWeek(MONDAY).days[1]!.effort).toBe('normal');
});

test('an evening blows a short day as soon as one item asks for more', () => {
  setWeekdayEffort(3, 'kurz');
  addToPlan(WEDNESDAY, createItem('Nudeln', 'kurz').id);
  expect(buildWeek(MONDAY).days[2]!.overEffort).toBe(false);

  addToPlan(WEDNESDAY, createItem('Lasagne', 'entspannt').id);
  expect(buildWeek(MONDAY).days[2]!.overEffort).toBe(true);
});

test('an empty evening is not a warning', () => {
  setWeekdayEffort(3, 'kurz');
  expect(buildWeek(MONDAY).days[2]!.overEffort).toBe(false);
});
