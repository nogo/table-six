// The inventory — `Bestand` on screen. Not a planning screen: this is where
// the item list is built and kept honest — create, rename, merge, delete, mark vegetarian, set the level.
// Merging is the important one: it folds the many spellings of an item
// together without losing an evening.
import { AurilElement, html } from './auril/index.js';
import { createItem, deleteItem, mergeItem, patchItem } from './api.js';
import { loadItems, loadWeek, router, store } from './app.js';
import { EFFORT_ORDER } from './dates.js';
import { COMPONENT_ORDER, componentName } from './items.js';

/** @typedef {{ id: number, name: string }} Intent an item a pending action refers to */

const FILTERS = [
  ['all', 'alle'],
  ['vegetarian', 'vegetarisch'],
  ['unsorted', 'ohne Rolle'],
  ['unused', 'ungenutzt'],
];

/** What each filter keeps. `ohne Rolle` is how the curation gets finished. */
const MATCHES = {
  all: () => true,
  vegetarian: (/** @type {any} */ item) => item.vegetarian,
  unsorted: (/** @type {any} */ item) => item.component === null,
  unused: (/** @type {any} */ item) => !item.last_used,
};

class ItemInventory extends AurilElement {
  #query = '';
  #filter = 'all';
  /** The row that is open for editing — one at a time. */
  #editing = /** @type {number | null} */ (null);
  /**
   * The two pending actions carry the item's name as well as its id. SQLite
   * hands a deleted id to the next new item, so an id alone can come back
   * pointing at something else — and a delete that was armed on one item would
   * fire on the other without ever showing its question.
   */
  #merging = /** @type {Intent | null} */ (null);
  #confirming = /** @type {Intent | null} */ (null);

  onConnect() {
    this.watch((s) => s.items, (items) => {
      this.#dropStaleIntents(items);
      this.update();
    });

    this.delegate('click', '.back', () => router.go('/'));

    this.delegate('click', '.open', (_, el) => {
      const id = this.#id(el);
      if (this.#merging && this.#merging.id !== id) return this.#write(mergeItem(this.#merging.id, id));
      this.#editing = this.#editing === id ? null : id;
      this.#merging = null;
      this.#confirming = null;
      this.update();
      // The bar grew by a line or two, which can leave the row behind it.
      // `nearest` moves by the minimum and does nothing when it already fits.
      if (this.#editing === id) this.querySelector(`#item-${id}`)?.scrollIntoView({ block: 'nearest' });
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

    this.delegate('click', '.role', (_, el) => {
      const item = this.#item(this.#id(el));
      if (item) {
        const next = COMPONENT_ORDER[(COMPONENT_ORDER.indexOf(item.component) + 1) % COMPONENT_ORDER.length];
        this.#write(patchItem(item.id, { component: next }));
      }
    });

    // Retiring is reversible, so it needs no second tap the way deleting does.
    this.delegate('click', '.retire, .resume', (_, el) => {
      const item = this.#item(this.#id(el));
      if (item) this.#write(patchItem(item.id, { retired: !item.retired }));
    });

    this.delegate('click', '.merge', (_, el) => {
      this.#merging = this.#intent(this.#id(el));
      this.#editing = null;
      this.update();
    });
    this.delegate('click', '.close', () => {
      this.#editing = null;
      this.update();
    });
    this.delegate('click', '.cancel-merge', () => {
      this.#merging = null;
      this.update();
    });

    this.delegate('click', '.delete', (_, el) => {
      const id = this.#id(el);
      if (this.#confirming?.id !== id) {
        this.#confirming = this.#intent(id); // first tap only asks
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
      this.#filter = el.getAttribute('data-filter') ?? 'all';
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

  /** @param {number} id @returns {Intent | null} */
  #intent(id) {
    const item = this.#item(id);
    return item ? { id: item.id, name: item.name } : null;
  }

  /**
   * Forget what the new list no longer supports: an item that is gone, or an
   * id that now carries a different name because it was recycled.
   * @param {any[]} items
   */
  #dropStaleIntents(items) {
    const nameOf = new Map(items.map((item) => [item.id, item.name]));
    /** @param {Intent | null} intent */
    const gone = (intent) => intent !== null && nameOf.get(intent.id) !== intent.name;
    if (gone(this.#confirming)) this.#confirming = null;
    if (gone(this.#merging)) this.#merging = null;
    if (this.#editing !== null && !nameOf.has(this.#editing)) this.#editing = null;
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

  /**
   * The one thing a row says about itself beside its name. A paused item's
   * part does not matter — it is not being offered for a plate.
   * @param {any} item @param {boolean} source
   */
  #note(item, source) {
    if (source) return 'wird aufgelöst';
    if (item.retired) return 'pausiert';
    return item.component ? componentName(item.component) : '';
  }

  /** @param {any} item */
  #row(item) {
    const open = this.#editing === item.id;
    const source = this.#merging?.id === item.id;
    return html`
      <div class="item" id="item-${item.id}" data-id="${item.id}">
        <button class="row open" aria-expanded="${open}">
          <span class="grow">${item.name}</span>
          ${this.#note(item, source) && html`<span class="reason">${this.#note(item, source)}</span>`}
          ${item.vegetarian && html`<span class="mark">🌱</span>`}
          <span class="effort">${item.effort}</span>
        </button>
      </div>`;
  }

  /**
   * Deleting takes every evening the item was on with it, so it is only
   * offered where there is nothing to lose. Anything the family has actually
   * eaten is paused instead — it keeps its evenings and it can come back.
   * @param {any} item
   */
  #retireOrDelete(item) {
    if (item.retired) return html`<button class="resume">wieder aufnehmen</button>`;
    if (item.last_used) return html`<button class="retire">pausieren</button>`;
    return html`
      <button class="danger delete">${this.#confirming?.id === item.id ? 'wirklich löschen?' : 'löschen'}</button>`;
  }

  /**
   * Editing happens in the bar, never in the row. The list keeps its shape
   * while a row is open, so nothing moves under the thumb, and the controls
   * are where the thumb already is. `data-id` is what the handlers read, so
   * they do not care that the buttons sit somewhere else now.
   * @param {any} item
   */
  #editor(item) {
    return html`
      <div class="column wide editor" data-id="${item.id}">
        <label class="search">
          <input class="rename" value="${item.name}" aria-label="Name" autocomplete="off" enterkeyhint="done">
          <button class="close" type="button">fertig</button>
        </label>
        <div class="item-controls">
          <button class="veg">${item.vegetarian ? '🌱 vegetarisch' : 'mit Fleisch'}</button>
          <button class="cycle">${item.effort}</button>
          <button class="role">${componentName(item.component)}</button>
          <button class="merge">zusammenführen</button>
          ${this.#retireOrDelete(item)}
        </div>
      </div>`;
  }

  render() {
    const query = this.#query.trim().toLowerCase();
    const items = store.state.items
      .filter(MATCHES[/** @type {'all'} */ (this.#filter)] ?? MATCHES.all)
      .filter((item) => item.name.toLowerCase().includes(query));
    const known = store.state.items.some((item) => item.name.toLowerCase() === query);
    const merging = this.#merging;
    // The row being edited need not be one the filter keeps: the bar shows it
    // either way, and that is where it is edited.
    const editing = this.#editing === null ? null : this.#item(this.#editing);

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
        ${editing
          ? this.#editor(editing)
          : html`
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
            </form>`}
      </div>`;
  }
}
customElements.define('item-inventory', ItemInventory);
