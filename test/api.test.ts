import { afterAll, beforeEach, expect, test } from 'bun:test';
import { db } from '../src/db.ts';
import { serve } from '../src/server.ts';

const server = serve(0);
const url = (path: string) => `http://localhost:${server.port}${path}`;
afterAll(() => server.stop(true));

const send = (method: string, path: string, body?: unknown) =>
  fetch(url(path), {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const item = async (name: string, effort = 'normal') =>
  (await (await send('POST', '/api/items', { name, effort })).json()) as { id: number; name: string };

beforeEach(() => {
  db.exec('DELETE FROM plan; DELETE FROM items; DELETE FROM weekday_effort');
});

test('a name is enough to create an item', async () => {
  const response = await send('POST', '/api/items', { name: '  Rote   Bete ' });
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ name: 'Rote Bete', effort: 'normal' });
});

test('creating a name that exists hands back that item', async () => {
  const first = await item('Reis');
  const again = await send('POST', '/api/items', { name: 'reis' });
  expect(again.status).toBe(200);
  expect(await again.json()).toMatchObject({ id: first.id, name: 'Reis' });
});

test('an empty name is refused', async () => {
  expect((await send('POST', '/api/items', { name: '   ' })).status).toBe(400);
  expect((await send('POST', '/api/items', { name: 'Reis', effort: 'schnell' })).status).toBe(400);
});

test('renaming into an existing name is refused, not silently merged', async () => {
  await item('Reis');
  const nudeln = await item('Nudeln');
  const response = await send('PATCH', `/api/items/${nudeln.id}`, { name: 'Reis' });
  expect(response.status).toBe(409);
});

test('a patch touches only the fields it names', async () => {
  const nudeln = await item('Nudeln', 'kurz');
  const patched = await (await send('PATCH', `/api/items/${nudeln.id}`, { effort: 'entspannt' })).json();
  expect(patched).toMatchObject({ name: 'Nudeln', effort: 'entspannt' });
});

test('an evening is filled and emptied one tap at a time', async () => {
  const nudeln = await item('Nudeln', 'kurz');
  expect((await send('PUT', `/api/plan/2026-08-19/${nudeln.id}`)).status).toBe(204);
  expect((await send('PUT', `/api/plan/2026-08-19/${nudeln.id}`)).status).toBe(204); // twice is once

  let week = await (await fetch(url('/api/week?start=2026-08-19'))).json();
  expect(week.days[2].items).toHaveLength(1);

  expect((await send('DELETE', `/api/plan/2026-08-19/${nudeln.id}`)).status).toBe(204);
  week = await (await fetch(url('/api/week?start=2026-08-19'))).json();
  expect(week.days[2].items).toEqual([]);
});

test('planning an item that does not exist is a 404, not an empty evening', async () => {
  expect((await send('PUT', '/api/plan/2026-08-19/999')).status).toBe(404);
  expect((await send('PUT', '/api/plan/19.8.2026/1')).status).toBe(400);
});

test('an item nobody has cooked can be deleted for real', async () => {
  const typo = await item('Lasgane');
  expect((await send('DELETE', `/api/items/${typo.id}`)).status).toBe(204);
  expect(await (await fetch(url('/api/items'))).json()).toHaveLength(0);
});

test('an item that has been on an evening is retired, never deleted', async () => {
  const lasagne = await item('Lasagne');
  await send('PUT', `/api/plan/2026-08-19/${lasagne.id}`);

  // Deleting would take the evening with it, so the route refuses.
  expect((await send('DELETE', `/api/items/${lasagne.id}`)).status).toBe(409);

  const retired = await (await send('PATCH', `/api/items/${lasagne.id}`, { retired: true })).json();
  expect(retired.retired).toBe(true);

  const week = await (await fetch(url('/api/week?start=2026-08-19'))).json();
  expect(week.days[2].items.map((i: { name: string }) => i.name)).toEqual(['Lasagne']); // the evening stands

  const back = await (await send('PATCH', `/api/items/${lasagne.id}`, { retired: false })).json();
  expect(back.retired).toBe(false); // a mistake is fixable
});

test('the effort level is set for the weekday, not for the date', async () => {
  expect((await send('PUT', '/api/effort/3', { effort: 'kurz' })).status).toBe(204);
  expect((await send('PUT', '/api/effort/9', { effort: 'kurz' })).status).toBe(400);

  const week = await (await fetch(url('/api/week?start=2026-09-02'))).json(); // a later Wednesday
  expect(week.days[2].effort).toBe('kurz');
});

test('the inventory is ordered by the evening it was last planned for', async () => {
  const alt = await item('Auflauf');
  const neu = await item('Zwiebelkuchen');
  await send('PUT', `/api/plan/2026-08-17/${alt.id}`);
  await send('PUT', `/api/plan/2026-08-19/${neu.id}`);

  const items = (await (await fetch(url('/api/items'))).json()) as { name: string }[];
  expect(items.map((i) => i.name)).toEqual(['Zwiebelkuchen', 'Auflauf']);
});

test('every screen the client router owns is the shell, anything else is a 404', async () => {
  for (const path of ['/', '/day/2026-08-19', '/inventory']) {
    expect(await (await fetch(url(path))).text()).toContain('<app-screen');
  }
  expect((await fetch(url('/nonsense'))).status).toBe(404);
});

test('the shell and the API name the same deployment', async () => {
  // When they disagree, the phone reloads every time it is picked up.
  const shell = await (await fetch(url('/'))).text();
  const { version } = await (await fetch(url('/api/version'))).json();
  expect(shell).toContain(`data-version="${version}"`);
});
