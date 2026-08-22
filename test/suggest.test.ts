import { beforeEach, expect, test } from 'bun:test';
import { addToPlan, createItem, db, setWeekdayEffort } from '../src/db.ts';
import { fillEvening, suggest } from '../src/suggest.ts';

const MONDAY = '2026-08-17';
const THURSDAY = '2026-08-20';

const names = (date: string) => suggest(date).map(({ item }) => item.name);
const reasonFor = (date: string, name: string) => suggest(date).find(({ item }) => item.name === name)?.reason;

beforeEach(() => {
  db.exec('DELETE FROM plan; DELETE FROM items; DELETE FROM weekday_effort');
});

test('what was on the table yesterday goes last, what was never on it goes first', () => {
  addToPlan('2026-08-16', createItem('Nudeln', true, 'kurz').id);
  addToPlan('2026-07-10', createItem('Linsen', true, 'normal').id); // five weeks back
  createItem('Reis', true, 'kurz');

  expect(names(MONDAY)).toEqual(['Reis', 'Linsen', 'Nudeln']);
  expect(reasonFor(MONDAY, 'Reis')).toEqual({ axis: 'fresh' });
  expect(reasonFor(MONDAY, 'Nudeln')).toEqual({ axis: 'recency', days: 1 });
});

test('an evening still ahead repeats just as much as one already past', () => {
  addToPlan(THURSDAY, createItem('Nudeln', true, 'kurz').id);
  createItem('Reis', true, 'kurz');

  expect(names(MONDAY)).toEqual(['Reis', 'Nudeln']);
  expect(reasonFor(MONDAY, 'Nudeln')).toEqual({ axis: 'recency', days: -3 });
});

test('too much for the day sinks an item without taking it off the list', () => {
  setWeekdayEffort(1, 'kurz');
  createItem('Lasagne', true, 'entspannt');
  createItem('Reis', true, 'kurz');

  expect(names(MONDAY)).toEqual(['Reis', 'Lasagne']);
  expect(reasonFor(MONDAY, 'Lasagne')).toEqual({ axis: 'effort', effort: 'kurz' });
});

test('the meatless boost waits until the plate has something on it', () => {
  createItem('Kartoffeln', true, 'normal');
  const sausage = createItem('Bratwurst', false, 'kurz');

  // An empty evening has no gap yet.
  expect(reasonFor(MONDAY, 'Kartoffeln')).toEqual({ axis: 'fresh' });

  addToPlan(MONDAY, sausage.id);
  expect(names(MONDAY)).toEqual(['Kartoffeln']); // the sausage is on the plate now
  expect(reasonFor(MONDAY, 'Kartoffeln')).toEqual({ axis: 'veg' });
});

test('hesitation outranks enthusiasm when both have something to say', () => {
  setWeekdayEffort(1, 'kurz');
  addToPlan(MONDAY, createItem('Bratwurst', false, 'kurz').id);
  createItem('Ofengemüse', true, 'entspannt'); // meatless, and too much for a short day

  expect(reasonFor(MONDAY, 'Ofengemüse')).toEqual({ axis: 'effort', effort: 'kurz' });
});

test('a proposed evening leaves the two vegetarians a plate', () => {
  addToPlan('2026-07-10', createItem('Kartoffeln', true, 'normal').id);
  const sausage = createItem('Bratwurst', false, 'kurz'); // never planned, so it leads

  const plate = fillEvening(MONDAY);
  expect(plate.map((item) => item.name)).toEqual(['Bratwurst', 'Kartoffeln']);
  expect(plate[0]!.id).toBe(sausage.id);
});

test('a proposal that already works stays a single item', () => {
  createItem('Käsespätzle', true, 'normal');
  expect(fillEvening(MONDAY).map((item) => item.name)).toEqual(['Käsespätzle']);
});

test('an evening that was planned by hand is left alone', () => {
  const noodles = createItem('Nudeln', true, 'kurz');
  createItem('Reis', true, 'kurz');
  addToPlan(MONDAY, noodles.id);

  expect(fillEvening(MONDAY).map((item) => item.name)).toEqual(['Nudeln']);
});

test('an empty inventory proposes nothing rather than failing', () => {
  expect(fillEvening(MONDAY)).toEqual([]);
});
