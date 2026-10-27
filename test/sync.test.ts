import { afterAll, beforeEach, expect, test } from 'bun:test';
import { db } from '../src/db.ts';
import { serve } from '../src/server.ts';

const server = serve(0);
afterAll(() => server.stop(true));

const send = (method: string, path: string, body?: unknown) =>
  fetch(`http://localhost:${server.port}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/**
 * A second phone in the kitchen: connect, act, and see what it was told.
 * `told()` publishes a marker after the writes and waits for it — the socket
 * delivers in order, so everything said before the marker has arrived.
 */
async function listen(): Promise<{ told: () => Promise<string[]> }> {
  const socket = new WebSocket(`ws://localhost:${server.port}/ws`);
  const messages: string[] = [];
  let wake = () => {};
  socket.addEventListener('message', (event) => {
    messages.push(String(event.data));
    wake();
  });
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));

  return {
    told: async () => {
      server.publish('table-six', 'end');
      while (!messages.includes('end')) await new Promise<void>((resolve) => (wake = resolve));
      socket.close();
      return messages.slice(0, messages.indexOf('end'));
    },
  };
}

beforeEach(() => {
  db.exec('DELETE FROM drafts; DELETE FROM plan; DELETE FROM items; DELETE FROM weekday_effort');
});

test('every write that went through tells the other phones, and only that', async () => {
  const phone = await listen();
  const item = await (await send('POST', '/api/items', { name: 'Reis' })).json();
  await send('PUT', `/api/plan/2026-08-19/${item.id}`);
  await send('POST', '/api/plan/2026-08-20/fill');
  await send('PUT', '/api/effort/3', { effort: 'kurz' });
  await send('PATCH', `/api/items/${item.id}`, { name: 'Basmati' });
  await send('DELETE', `/api/plan/2026-08-19/${item.id}`);

  expect(await phone.told()).toEqual(Array(6).fill('changed'));
});

test('a refused write says nothing', async () => {
  const phone = await listen();
  await send('POST', '/api/items', { name: '  ' });
  await send('PUT', '/api/plan/2026-08-19/404');
  await send('PUT', '/api/effort/9', { effort: 'kurz' });

  expect(await phone.told()).toEqual([]);
});
