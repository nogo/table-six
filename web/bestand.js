// Bestand: not a planning screen. This is where the item list is built and
// kept honest — create, rename, merge, delete, mark vegetarian, set the level.
// Merging is the important one: it folds the many spellings of an item
// together without losing an evening.
import { AurilElement, html } from './auril/index.js';
import { createItem, deleteItem, mergeItem, patchItem } from './api.js';
import { loadItems, loadWeek, router, store } from './app.js';
import { EFFORT_ORDER } from './dates.js';

const FILTERS = [
  ['alle', 'alle'],
  ['vegetarisch', 'vegetarisch'],
  ['ungenutzt', 'ungenutzt'],
];

class ItemStock extends AurilElement {
  #query = '';
  #filter = 'alle';
  /** The row that is open for editing — one at a time. */
  #editing = /** @type {number | null} */ (null);
  /** The item waiting for a target to be folded into. */
  #merging = /** @type {number | null} */ (null);
  /** Deleting takes an item off every evening, so it takes a second tap. */
  #confirming = /** @type {number | null} */ (null);

  onConnect() {
    this.watch((s) => s.items, () => this.update());

    this.delegate('click', '.back', () => router.go('/'));

    this.delegate('click', '.open', (_, el) => {
      const id = this.#id(el);
      if (this.#merging !== null && this.#merging !== id) return this.#write(mergeItem(this.#merging, id));
      this.#editing = this.#editing === id ? null : id;
      this.#merging = null;
      this.#confirming = null;
      this.update();
    });

    this.delegate('click', '.veg', (_, el) => {
      const item = this.#item(this.#id(el));
      if (item) this.#write(patchItem(item.id, { vegetarian: !item.vegetarian }));
    });

    this.delegate('click', '.cycle', (_, el) => {
      const item = this.#item(this.#id(el));
      if (item) {
        this.#write(patchItem(item.id, { effort: EFFORT_ORDER[(EFFORT_ORDER.indexOf(item.effort) + 1) % EFFORT_ORDER.length] }));
      }
    });

    this.delegate('click', '.merge', (_, el) => {
      this.#merging = this.#id(el);
      this.#editing = null;
      this.update();
    });
    this.delegate('click', '.cancel-merge', () => {
      this.#merging = null;
      this.update();
    });

    this.delegate('click', '.delete', (_, el) => {
      const id = this.#id(el);
      if (this.#confirming !== id) {
        this.#confirming = id;
        return this.update();
      }
      this.#confirming = null;
      this.#editing = null;
      this.#write(deleteItem(id));
    });

    // Enter saves the name, Esc closes the row — the keyboard is the
    // accelerator, the buttons are the twin.
    this.delegate('change', '.rename', (_, el) => {
      const input = /** @type {HTMLInputElement} */ (el);
      const name = input.value.trim();
      const item = this.#item(this.#id(el));
      if (item && name && name !== item.name) this.#write(patchItem(item.id, { name }));
    });
    this.delegate('keydown', '.rename', (event) => {
      const key = /** @type {KeyboardEvent} */ (event).key;
      if (key !== 'Enter' && key !== 'Escape') return;
      if (key === 'Escape') this.#editing = null;
      /** @type {HTMLElement} */ (event.target).blur(); // 'change' commits on blur
      if (key === 'Escape') this.update();
    });

    this.delegate('input', '.query', (_, el) => {
      this.#query = /** @type {HTMLInputElement} */ (el).value;
      this.update();
    });
    this.delegate('click', '.filter', (_, el) => {
      this.#filter = el.getAttribute('data-filter') ?? 'alle';
      this.update();
    });
    this.delegate('submit', '.search-form', (event) => {
      event.preventDefault();
      this.#create();
    });
    this.delegate('click', '.new', () => this.#create());

    loadItems();
  }

  /** @param {Element} el */
  #id(el) {
    return Number(el.closest('[data-id]')?.getAttribute('data-id'));
  }

  /** @param {number} id */
  #item(id) {
    return store.state.items.find((item) => item.id === id) ?? null;
  }

  /** Names travel onto the board, so the week is refetched with the list. */
  async #write(pending) {
    await pending;
    this.#merging = null;
    await Promise.all([loadItems(), loadWeek()]);
  }

  async #create() {
    const name = this.#query.trim();
    if (!name) return;
    const input = /** @type {HTMLInputElement | null} */ (this.querySelector('.query'));
    this.#query = '';
    if (input) input.value = ''; // morph leaves the focused field alone
    await this.#write(createItem(name));
    input?.focus();
  }

  /** @param {any} item */
  #row(item) {
    const open = this.#editing === item.id;
    const source = this.#merging === item.id;
    return html`
      <div class="item" id="item-${item.id}" data-id="${item.id}">
        <button class="row open">
          <span class="grow">${item.name}</span>
          ${source && html`<span class="reason">wird aufgelöst</span>`}
          ${item.vegetarian && html`<span class="mark">🌱</span>`}
          <span class="effort">${item.effort}</span>
        </button>
        ${open && html`
          <div class="item-controls">
            <input class="rename" value="${item.name}" aria-label="Name" autocomplete="off" enterkeyhint="done">
            <button class="veg">${item.vegetarian ? '🌱 vegetarisch' : 'mit Fleisch'}</button>
            <button class="cycle">${item.effort}</button>
            <button class="merge">zusammenführen</button>
            <button class="danger delete">${this.#confirming === item.id ? 'wirklich löschen?' : 'löschen'}</button>
          </div>`}
      </div>`;
  }

  render() {
    const query = this.#query.trim().toLowerCase();
    const items = store.state.items
      .filter((item) => (this.#filter === 'vegetarisch' ? item.vegetarian : this.#filter === 'ungenutzt' ? !item.last_used : true))
      .filter((item) => item.name.toLowerCase().includes(query));
    const known = store.state.items.some((item) => item.name.toLowerCase() === query);
    const merging = this.#merging === null ? null : this.#item(this.#merging);

    return html`
      <header class="head column wide">
        <button class="step back" aria-label="Zurück zur Woche">‹</button>
        <h1 class="caps">Bestand <span class="soft num">${store.state.items.length}</span></h1>
      </header>

      <main class="column wide list">
        ${merging && html`
          <p class="hint">„${merging.name}“ in welches Item? Tippe es an. <button class="cancel-merge done-inline">abbrechen</button></p>`}
        ${items.map((item) => this.#row(item))}
        ${query && !known && html`
          <button class="row new"><span class="grow">„${this.#query.trim()}“ anlegen</span><span class="add-mark">+</span></button>`}
        ${items.length === 0 && !query && html`
          <p class="hint">Noch nichts drin. Was esst ihr? Unten eintippen.</p>`}
      </main>

      <div class="bar">
        <form class="column wide foot search-form">
          <div class="filters">
            ${FILTERS.map(([key, label]) => html`
              <button class="filter" type="button" data-filter="${key}" aria-pressed="${this.#filter === key}">${label}</button>`)}
          </div>
          <label class="search">
            <span class="soft" aria-hidden="true">⌕</span>
            <input class="query" value="${this.#query}" placeholder="suchen oder neu …"
                   autocomplete="off" enterkeyhint="done" aria-label="Item suchen oder anlegen">
          </label>
        </form>
      </div>`;
  }
}
customElements.define('item-stock', ItemStock);
