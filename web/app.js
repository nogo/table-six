// Bootstrap: one store, one router, one screen element that swaps the view.
import { AurilElement, Router, Store, html } from './auril/index.js';

export const store = new Store({
  /** @type {{ name: string, params: Record<string, string | undefined> }} */
  route: { name: 'board', params: {} },
});
AurilElement.store = store;

export const router = new Router()
  .route('/', () => store.set({ route: { name: 'board', params: {} } }))
  .route('/tag/:date', (params) => store.set({ route: { name: 'day', params } }))
  .route('/bestand', () => store.set({ route: { name: 'bestand', params: {} } }))
  .notFound(() => store.set({ route: { name: 'board', params: {} } }));

class AppScreen extends AurilElement {
  onConnect() {
    this.watch((s) => s.route, () => this.update());
  }

  render() {
    const { name, params } = store.state.route;
    if (name === 'day') return html`<day-focus date="${params.date ?? ''}"></day-focus>`;
    if (name === 'bestand') return html`<item-stock></item-stock>`;
    return html`<week-board></week-board>`;
  }
}
customElements.define('app-screen', AppScreen);

router.start();
