// Bootstrap: one store, one router, one screen element that swaps the view.
import { AurilElement, Router, Store, html } from './auril/index.js';
import { getItems, getSuggestions, getWeek } from './api.js';
import { today, weekStart } from './dates.js';

export const store = new Store({
  /** @type {{ name: string, params: Record<string, string | undefined> }} */
  route: { name: 'board', params: {} },
  /** ISO Monday of the week on the board. The app is week-bound. */
  weekStart: weekStart(today()),
  /** The week as the server built it, or null until the first load. */
  week: /** @type {any} */ (null),
  /** The inventory, most recently planned first — the order `Bestand` shows. */
  items: /** @type {any[]} */ ([]),
  /** The ranked inventory for the day on screen. Kept with the date it was
   *  ranked for, so stepping to the next day never shows the last one's order. */
  suggestions: /** @type {{ date: string, list: any[] }} */ ({ date: '', list: [] }),
  /** The last request did not arrive. Shown, never acted on. */
  offline: false,
});
AurilElement.store = store;

/**
 * Refetch what changed. Every screen and the socket go through these two —
 * the server is the truth, the client only ever reloads a scope.
 * @param {string} [start] ISO Monday
 */
export async function loadWeek(start = store.state.weekStart) {
  try {
    const week = await getWeek(start);
    if (store.state.weekStart === week.start) store.set({ week, offline: false }); // a newer step wins
  } catch {
    store.set({ offline: true }); // what is on screen stays on screen
  }
}

export async function loadItems() {
  try {
    store.set({ items: await getItems(), offline: false });
  } catch {
    store.set({ offline: true });
  }
}

/**
 * The ranking for one evening. Off the day screen there is nothing to rank, so
 * an absent date is a no-op rather than a caller's problem.
 * @param {string} [date] ISO date
 */
export async function loadSuggestions(date) {
  if (!date) return;
  try {
    const list = await getSuggestions(date);
    if (store.state.route.params.date === date) store.set({ suggestions: { date, list }, offline: false });
  } catch {
    store.set({ offline: true });
  }
}

export const router = new Router()
  .route('/', () => store.set({ route: { name: 'board', params: {} } }))
  .route('/day/:date', (params) => store.set({
    route: { name: 'day', params },
    weekStart: weekStart(params.date ?? today()), // going back lands on the right week
  }))
  .route('/inventory', () => store.set({ route: { name: 'inventory', params: {} } }))
  .notFound(() => store.set({ route: { name: 'board', params: {} } }));

class AppScreen extends AurilElement {
  onConnect() {
    this.watch((s) => s.route, () => this.update());
  }

  render() {
    const { name, params } = store.state.route;
    if (name === 'day') return html`<day-focus date="${params.date ?? ''}"></day-focus>`;
    if (name === 'inventory') return html`<item-inventory></item-inventory>`;
    return html`<week-board></week-board>`;
  }
}
customElements.define('app-screen', AppScreen);

// Screens register themselves; the import cycle back to store/router is
// resolved by the time any of them connects.
import './board.js';
import './day.js';
import './inventory.js';
import { startSync } from './sync.js';

router.start();
startSync();

// The shell comes off the home screen; the plan always comes from the server.
// The version travels in the URL: a new deployment is a new script URL, which
// is what makes the browser install it, and the worker names its cache after
// it. `updateViaCache: 'none'` keeps the HTTP cache out of that decision.
const version = document.documentElement.dataset.version ?? 'dev';

// Whether this page started out controlled. A first registration also hands
// over control, and reloading for that would be a loop on the first visit.
const wasControlled = Boolean(navigator.serviceWorker?.controller);

navigator.serviceWorker?.register(`/sw.js?v=${version}`, { updateViaCache: 'none' });

// A worker from a newer deployment has taken over. The screens on this page
// came out of the old one's cache, so this reload is what actually makes the
// new version visible — once, because the next load starts controlled by it.
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (wasControlled) location.reload();
});

// The app is never closed in a kitchen, only put down, and a page nobody
// navigates learns nothing. Coming back to it, ask the server what it is
// serving — `/api/` is the one path the worker never answers from its cache.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  try {
    const { version: deployed } = await (await fetch('/api/version')).json();
    if (deployed !== version) location.reload();
  } catch {
    // Offline. There is nothing to update to, and the week on screen stays.
  }
});
