// One day fills the screen. One tap adds, one tap removes, written
// immediately — nothing to confirm, nothing to save.
import { AurilElement, html } from './auril/index.js';
import { addToPlan, createItem, removeFromPlan, setWeekdayEffort } from './api.js';
import { loadItems, loadWeek, router, store } from './app.js';
import { EFFORT_ORDER, WEEKDAYS, dayOfMonth, weekday } from './dates.js';

const ROWS = 8; // plate and suggestions together — as many as fit without scrolling

const EVENING = { kurz: 'kurzer Abend', normal: 'normaler Abend', entspannt: 'entspannter Abend' };

class DayFocus extends AurilElement {
  /** Search text — local state: nobody else needs to know what is being typed. */
  #query = '';

  onConnect() {
    this.watch((s) => s.week, () => this.update());
    this.watch((s) => s.items, () => this.update());

    this.delegate('click', '.back, .done', () => router.go('/'));

    this.delegate('click', '.add', (_, el) => this.#write(addToPlan(this.date, this.#id(el))));
    this.delegate('click', '.x', (_, el) => this.#write(removeFromPlan(this.date, this.#id(el))));

    // The level belongs to the weekday: tapping it moves every Wednesday.
    this.delegate('click', '.level', () => {
      const next = EFFORT_ORDER[(EFFORT_ORDER.indexOf(this.#day().effort) + 1) % EFFORT_ORDER.length];
      this.#write(setWeekdayEffort(weekday(this.date), next));
    });

    this.delegate('input', '.query', (_, el) => {
      this.#query = /** @type {HTMLInputElement} */ (el).value;
      this.update();
    });

    // What isn't found gets entered: the search field is the create field.
    this.delegate('submit', '.search-form', (event) => {
      event.preventDefault();
      this.#create();
    });
    this.delegate('click', '.new', () => this.#create());

    loadWeek();
    loadItems();
  }

  get date() {
    return this.getAttribute('date') ?? '';
  }

  #day() {
    return store.state.week?.days.find((/** @type {any} */ day) => day.date === this.date) ?? null;
  }

  /** @param {Element} el @returns {number} */
  #id(el) {
    return Number(el.closest('[data-id]')?.getAttribute('data-id'));
  }

  /** Every write is a request; the week and the inventory come back from the server. */
  async #write(pending) {
    await pending;
    await Promise.all([loadWeek(), loadItems()]);
  }

  async #create() {
    const name = this.#query.trim();
    if (!name) return;
    const input = /** @type {HTMLInputElement | null} */ (this.querySelector('.query'));
    this.#query = '';
    if (input) input.value = ''; // morph leaves the focused field alone — clear it here
    // A new item takes the level of the evening it was created for: nobody
    // wants a warning about the thing they just typed.
    const item = await createItem(name, { effort: this.#day()?.effort });
    await this.#write(addToPlan(this.date, item.id));
    input?.focus();
  }

  /** @param {any} item @param {'x' | 'add'} action */
  #row(item, action) {
    const [prefix, mark] = action === 'x' ? ['plate', '✕'] : ['sug', '+'];
    return html`
      <button class="row ${action}" id="${prefix}-${item.id}" data-id="${item.id}">
        <span class="grow">${item.name}</span>
        ${item.vegetarian && html`<span class="mark">🌱</span>`}
        <span class="${action}-mark">${mark}</span>
      </button>`;
  }

  render() {
    const day = this.#day();
    if (!day) return html`<main class="column"></main>`;

    const query = this.#query.trim().toLowerCase();
    const planned = new Set(day.items.map((/** @type {any} */ item) => item.id));
    const suggestions = store.state.items
      .filter((item) => !planned.has(item.id) && item.name.toLowerCase().includes(query))
      .slice(0, Math.max(3, ROWS - day.items.length)); // a full plate gives room back
    const known = store.state.items.some((item) => item.name.toLowerCase() === query);
    const tooMuch = day.items.filter((/** @type {any} */ item) => EFFORT_ORDER.indexOf(item.effort) > EFFORT_ORDER.indexOf(day.effort));

    return html`
      <header class="column focus-head">
        <div class="focus-line">
          <button class="step back" aria-label="Zurück zur Woche">‹</button>
          <span class="name">${WEEKDAYS[day.weekday]}</span>
          <span class="date num">${dayOfMonth(day.date)}</span>
        </div>
        <button class="level effort">${day.effort}</button>
        ${tooMuch.length > 0 && html`
          <p class="hint warn">⚠︎ Aufwendiger als ein ${EVENING[day.effort]}: ${tooMuch.map((/** @type {any} */ i) => i.name).join(', ')}.</p>`}
        ${day.items.length > 0 && !day.vegetarian && html`
          <p class="hint">Nichts Vegetarisches dabei.</p>`}
      </header>

      <main class="column">
        ${day.items.map((/** @type {any} */ item) => this.#row(item, 'x'))}
        <p class="section">Vorschläge</p>
        ${suggestions.map((item) => this.#row(item, 'add'))}
        ${query && !known && html`
          <button class="row new"><span class="grow">„${this.#query.trim()}“ anlegen</span><span class="add-mark">+</span></button>`}
        ${suggestions.length === 0 && !query && html`<p class="hint">Der Bestand ist noch leer.</p>`}
      </main>

      <div class="bar">
        <form class="column foot search-form">
          <label class="search">
            <span class="soft" aria-hidden="true">⌕</span>
            <input class="query" value="${this.#query}" placeholder="suchen oder neu …"
                   autocomplete="off" enterkeyhint="done" aria-label="Zutat suchen oder anlegen">
          </label>
          <button class="done" type="button">fertig</button>
        </form>
      </div>`;
  }
}
customElements.define('day-focus', DayFocus);
