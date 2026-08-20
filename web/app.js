// Bootstrap: one store, one router, one screen element that swaps the view.
import { AurilElement, Router, Store, html } from './auril/index.js';
import { getItems, getWeek } from './api.js';
import { today, weekStart } from './dates.js';

export const store = new Store({
  /** @type {{ name: string, params: Record<string, string | undefined> }} */
  route: { name: 'board', params: {} },
  /** ISO Monday of the week on the board. The app is week-bound. */
  weekStart: weekStart(today()),
  /** The week as the server built it, or null until the first load. */
  week: /** @type {any} */ (null),
  /** The inventory, most recently planned first — the suggestion order. */
  items: /** @type {any[]} */ ([]),
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
navigator.serviceWorker?.register('/sw.js');
