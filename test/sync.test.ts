import { afterAll, beforeEach, expect, test } from 'bun:test';
import { routes } from '../src/api.ts';
import { db } from '../src/db.ts';
import { onPublish } from '../src/sync.ts';

const TOPIC = 'table-six';
const server = Bun.serve({
  port: 0,
  routes,
  fetch: (request, server) => (server.upgrade(request) ? undefined : new Response(null, { status: 404 })),
  websocket: { open: (ws) => void ws.subscribe(TOPIC), message: () => {} },
});
onPublish((scope) => server.publish(TOPIC, scope));
afterAll(() => server.stop(true));

const send = (method: string, path: string, body?: unknown) =>
  fetch(`http://localhost:${server.port}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** A second phone in the kitchen: connect, act, and see what it is told. */
async function listen(): Promise<{ scopes: string[]; close: () => void }> {
  const socket = new WebSocket(`ws://localhost:${server.port}/ws`);
  const scopes: string[] = [];
  socket.addEventListener('message', (event) => scopes.push(String(event.data)));
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  return { scopes, close: () => socket.close() };
}

const settle = () => Bun.sleep(30);

beforeEach(() => {
  db.exec('DELETE FROM plan; DELETE FROM items; DELETE FROM weekday_effort');
});

test('filling an evening tells the other phones which week moved', async () => {
  const phone = await listen();
  const item = await (await send('POST', '/api/items', { name: 'Reis' })).json();
  await send('PUT', `/api/plan/2026-08-19/${item.id}`);
  await send('DELETE', `/api/plan/2026-08-19/${item.id}`);
  await settle();
  phone.close();

  expect(phone.scopes).toEqual(['items', 'week:2026-08-17', 'week:2026-08-17']);
});

test('a level change moves every week, a rename moves every board', async () => {
  const item = await (await send('POST', '/api/items', { name: 'Nudeln' })).json();
  const phone = await listen();

  await send('PUT', '/api/effort/3', { effort: 'kurz' });
  await send('PATCH', `/api/items/${item.id}`, { name: 'Bandnudeln' });
  await settle();
  phone.close();

  expect(phone.scopes).toEqual(['weeks', 'items']);
});

test('a refused write says nothing', async () => {
  const phone = await listen();
  await send('POST', '/api/items', { name: '  ' });
  await send('PUT', '/api/plan/2026-08-19/404');
  await settle();
  phone.close();

  expect(phone.scopes).toEqual([]);
});
