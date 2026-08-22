// The socket is an accelerator, never a dependency: it says what changed, the
// client refetches it over HTTP. If it never connects, everything still works
// — the same reload runs on focus and on reconnect.
import { loadItems, loadSuggestions, loadWeek, store } from './app.js';

/** The day on screen, if one is open. The board has no ranking to refresh. */
const openDay = () => store.state.route.params.date;

const RETRY = 3000;

/** @type {WebSocket | null} */
let socket = null;

/** @param {string} scope `items`, `weeks`, or `week:2026-08-17` */
function refetch(scope) {
  if (scope === 'items') return void Promise.all([loadItems(), loadWeek(), loadSuggestions(openDay())]);
  // A level moved, so what is too much for an evening moved with it.
  if (scope === 'weeks') return void Promise.all([loadWeek(), loadSuggestions(openDay())]);
  if (scope === `week:${store.state.weekStart}`) return void Promise.all([loadWeek(), loadSuggestions(openDay())]);
}

function connect() {
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  socket = new WebSocket(`ws://${location.host}/ws`);
  socket.addEventListener('message', (event) => refetch(String(event.data)));
  socket.addEventListener('close', () => setTimeout(connect, RETRY));
  socket.addEventListener('error', () => socket?.close());
}

export function startSync() {
  connect();
  // Coming back to the app is the other moment the week can be stale.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    connect();
    loadWeek();
    loadItems();
    loadSuggestions(openDay());
  });
}
