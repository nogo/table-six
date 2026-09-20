import { beforeEach, expect, test } from 'bun:test';
import { addToPlan, createItem, db, setWeekdayEffort, updateItem, type Component } from '../src/db.ts';
import { fillEvening, suggest } from '../src/suggest.ts';
import { buildWeek } from '../src/week.ts';

const MONDAY = '2026-08-17';
const THURSDAY = '2026-08-20';

const names = (date: string) => suggest(date).map(({ item }) => item.name);
const reasonFor = (date: string, name: string) => suggest(date).find(({ item }) => item.name === name)?.reason;

beforeEach(() => {
  db.exec('DELETE FROM plan; DELETE FROM items; DELETE FROM weekday_effort');
});

test('what is due comes first, what was on the table yesterday last', () => {
  addToPlan('2026-08-16', createItem('Nudeln', 'kurz').id);
  addToPlan('2026-07-10', createItem('Linsen', 'normal').id); // five weeks back
  createItem('Reis', 'kurz');

  // Something the family has eaten and is due outranks something it has never
  // tried; yesterday's evening sinks whatever else it has going for it.
  expect(names(MONDAY)).toEqual(['Linsen', 'Reis', 'Nudeln']);
  expect(reasonFor(MONDAY, 'Linsen')).toEqual({ axis: 'due', days: 38 });
  expect(reasonFor(MONDAY, 'Reis')).toEqual({ axis: 'fresh' });
  expect(reasonFor(MONDAY, 'Nudeln')).toEqual({ axis: 'recency', days: 1 });
});

test('an evening still ahead repeats just as much as one already past', () => {
  addToPlan(THURSDAY, createItem('Nudeln', 'kurz').id);
  createItem('Reis', 'kurz');

  // Three days ahead is as close as three days back, and neither is due.
  expect(names(MONDAY)).toEqual(['Reis', 'Nudeln']);
  expect(reasonFor(MONDAY, 'Nudeln')).toEqual({ axis: 'recency', days: -3 });
});

test('a rhythm is read off the item, leftovers are not a rhythm', () => {
  const bread = createItem('Brot', 'kurz');
  for (const date of ['2026-08-05', '2026-08-08', '2026-08-11']) addToPlan(date, bread.id);
  const pizza = createItem('Pizza', 'normal');
  for (const date of ['2026-08-10', '2026-08-11']) addToPlan(date, pizza.id); // eaten up the next day

  // Bread keeps three-day gaps over three evenings, so six days on it is due.
  // The pizza has one gap, which says nothing yet — six days is too soon for
  // the three weeks an item without a rhythm of its own borrows.
  expect(names(MONDAY)).toEqual(['Brot', 'Pizza']);
  expect(reasonFor(MONDAY, 'Brot')).toEqual({ axis: 'due', days: 6 });
  expect(reasonFor(MONDAY, 'Pizza')).toEqual({ axis: 'recency', days: 6 });
});

test('the nearest evening decides, not the last one', () => {
  const nudeln = createItem('Nudeln', 'kurz');
  addToPlan('2026-08-16', nudeln.id); // yesterday
  addToPlan('2026-09-20', nudeln.id); // and again in five weeks, filled in later

  // The evening five weeks out is the item's last one, and says nothing about
  // this Monday — the one yesterday does.
  expect(reasonFor(MONDAY, 'Nudeln')).toEqual({ axis: 'recency', days: 1 });
});

test('too much for the day sinks an item without taking it off the list', () => {
  setWeekdayEffort(1, 'kurz');
  createItem('Lasagne', 'entspannt');
  createItem('Reis', 'kurz');

  expect(names(MONDAY)).toEqual(['Reis', 'Lasagne']);
  expect(reasonFor(MONDAY, 'Lasagne')).toEqual({ axis: 'effort', effort: 'kurz' });
});

test('hesitation outranks enthusiasm when both have something to say', () => {
  setWeekdayEffort(1, 'kurz');
  addToPlan(MONDAY, createItem('Bratwurst', 'kurz').id);
  createItem('Ofengemüse', 'entspannt'); // never planned, and too much for a short day

  expect(reasonFor(MONDAY, 'Ofengemüse')).toEqual({ axis: 'effort', effort: 'kurz' });
});

test('what has shared a plate before comes up, and says with what', () => {
  const gnocchi = createItem('Gnocchi', 'kurz');
  const sauce = createItem('Tomatensoße', 'kurz');
  createItem('Reis', 'kurz');
  for (const item of [gnocchi, sauce]) addToPlan('2026-07-10', item.id);

  expect(names(MONDAY).at(-1)).toBe('Reis'); // nothing on the plate to point anywhere yet

  addToPlan(MONDAY, gnocchi.id);
  expect(names(MONDAY)).toEqual(['Tomatensoße', 'Reis']);
  expect(reasonFor(MONDAY, 'Tomatensoße')).toEqual({ axis: 'pair', partner: 'Gnocchi' });
});

test('the partner named is the one from the most recent shared evening', () => {
  const gnocchi = createItem('Gnocchi', 'kurz');
  const noodles = createItem('Nudeln', 'kurz');
  const sauce = createItem('Tomatensoße', 'kurz');
  addToPlan('2026-06-01', gnocchi.id);
  addToPlan('2026-06-01', sauce.id);
  addToPlan('2026-07-10', noodles.id);
  addToPlan('2026-07-10', sauce.id);

  addToPlan(MONDAY, gnocchi.id);
  addToPlan(MONDAY, noodles.id);
  expect(reasonFor(MONDAY, 'Tomatensoße')).toEqual({ axis: 'pair', partner: 'Nudeln' });
});

test('a proposed evening follows what the plate points at', () => {
  const gnocchi = createItem('Gnocchi', 'kurz');
  const sauce = createItem('Tomatensoße', 'kurz');
  for (const item of [gnocchi, sauce]) addToPlan('2026-07-10', item.id);
  addToPlan('2026-08-14', createItem('Reis', 'kurz').id); // three days ago, so it sinks

  expect(fillEvening(MONDAY).map((item) => item.name)).toEqual(['Gnocchi', 'Tomatensoße']);
});

test('a proposal grows as far as the pairs reach and no further', () => {
  const eaten = ['Bratwurst', 'Broccoli', 'Kartoffeln', 'Tomatensoße'];
  for (const name of eaten) addToPlan('2026-06-01', createItem(name, 'kurz').id);

  // Four items have shared that evening; the plate takes three of them.
  expect(fillEvening(MONDAY).map((item) => item.name)).toEqual(['Bratwurst', 'Broccoli', 'Kartoffeln']);
});

/** An item that has been sorted, which is what these tests are about. */
const part = (name: string, component: Component) => createItem(name, 'kurz', component);

test('what the plate is short of comes up, and a second helping sinks', () => {
  const potatoes = part('Kartoffeln', 'base');
  part('Broccoli', 'vegetable');
  part('Reis', 'base');

  // Nothing is missing from an evening that has not started.
  expect(reasonFor(MONDAY, 'Broccoli')).toEqual({ axis: 'fresh' });

  addToPlan(MONDAY, potatoes.id);
  expect(names(MONDAY)).toEqual(['Broccoli', 'Reis']);
  expect(reasonFor(MONDAY, 'Broccoli')).toEqual({ axis: 'gap', component: 'vegetable' });
  expect(reasonFor(MONDAY, 'Reis')).toEqual({ axis: 'doubled', component: 'base' });
});

test('an evening on its own leads an empty plate and stays off a started one', () => {
  part('Lasagne', 'whole');
  part('Reis', 'base');

  expect(names(MONDAY)).toEqual(['Lasagne', 'Reis']);
  expect(reasonFor(MONDAY, 'Lasagne')).toEqual({ axis: 'alone' });

  addToPlan(MONDAY, part('Kartoffeln', 'base').id);
  expect(names(MONDAY).at(-1)).toBe('Lasagne'); // last now, and for the same reason
  expect(reasonFor(MONDAY, 'Lasagne')).toEqual({ axis: 'alone' });
});

test('a plate a whole item has finished is short of nothing', () => {
  addToPlan(MONDAY, part('Lasagne', 'whole').id);
  part('Reis', 'base');
  part('Broccoli', 'vegetable');

  expect(reasonFor(MONDAY, 'Reis')).toEqual({ axis: 'fresh' }); // no gap to fill
  expect(reasonFor(MONDAY, 'Broccoli')).toEqual({ axis: 'fresh' });
});

test('a proposal combines only what has been on one plate before', () => {
  const sausage = part('Bratwurst', 'protein');
  const broccoli = part('Broccoli', 'vegetable');
  const potatoes = part('Kartoffeln', 'base');

  // Base, vegetable and protein make a plate on paper, and nobody has cooked
  // it: the proposal takes the best item and stops there.
  expect(fillEvening(MONDAY)).toHaveLength(1);

  db.exec('DELETE FROM plan');
  for (const item of [sausage, broccoli, potatoes]) addToPlan('2026-07-10', item.id);

  // Now the evening has been eaten, and the proposal follows it.
  expect(fillEvening(MONDAY).map((item) => item.name)).toEqual(['Bratwurst', 'Broccoli', 'Kartoffeln']);
});

test('a whole item is the whole evening', () => {
  part('Lasagne', 'whole');
  part('Reis', 'base');
  part('Salat', 'vegetable');

  expect(fillEvening(MONDAY).map((item) => item.name)).toEqual(['Lasagne']);
});

test('a retired item is never proposed, and never hidden either', () => {
  const potatoes = part('Kartoffeln', 'base');
  const broccoli = part('Broccoli', 'vegetable');
  addToPlan('2026-07-10', broccoli.id); // it has a history worth keeping
  updateItem(broccoli.id, { name: 'Broccoli', effort: 'kurz', component: 'vegetable', retired: true });

  addToPlan(MONDAY, potatoes.id);
  // Last, where a plate short of vegetables would otherwise have put it first.
  expect(names(MONDAY).at(-1)).toBe('Broccoli');
  expect(reasonFor(MONDAY, 'Broccoli')).toEqual({ axis: 'retired' });

  db.exec('DELETE FROM plan');
  part('Salat', 'vegetable');
  expect(fillEvening(MONDAY).map((item) => item.name)).not.toContain('Broccoli');
});

test('a retired item keeps the evenings it was on', () => {
  const lasagne = part('Lasagne', 'whole');
  addToPlan(MONDAY, lasagne.id);
  updateItem(lasagne.id, { name: 'Lasagne', effort: 'kurz', component: 'whole', retired: true });

  expect(buildWeek(MONDAY).days[0]!.items.map((item) => item.name)).toEqual(['Lasagne']);
});

test('a proposal that already works stays a single item', () => {
  createItem('Käsespätzle', 'normal');
  expect(fillEvening(MONDAY).map((item) => item.name)).toEqual(['Käsespätzle']);
});

test('an evening that was planned by hand is left alone', () => {
  const noodles = createItem('Nudeln', 'kurz');
  createItem('Reis', 'kurz');
  addToPlan(MONDAY, noodles.id);

  expect(fillEvening(MONDAY).map((item) => item.name)).toEqual(['Nudeln']);
});

test('an empty inventory proposes nothing rather than failing', () => {
  expect(fillEvening(MONDAY)).toEqual([]);
});
