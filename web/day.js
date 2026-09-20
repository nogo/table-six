// One day fills the screen. One tap adds, one tap removes, written
// immediately — nothing to confirm, nothing to save.
import { AurilElement, html } from './auril/index.js';
import { addToPlan, createItem, fillDay, removeFromPlan, setWeekdayEffort } from './api.js';
import { loadItems, loadSuggestions, loadWeek, store } from './app.js';
import { EFFORT_ORDER, WEEKDAYS, dayOfMonth, weekday } from './dates.js';
import { t } from './i18n.js';
import { componentName } from './items.js';

const ROWS = 8; // plate and suggestions together — as many as fit without scrolling

/**
 * The server ranks and names the axis that spoke; the German is the view's
 * job, like every other word the family reads. Never a number — while the log
 * is this thin a score would be a bogus one.
 */
/** @param {number} days */
const ago = (days) => (days === 1 ? t('reason.agoOne') : t('reason.ago', { days }));

/** @type {Record<string, (reason: any) => string>} */
const REASON = {
  retired: () => t('reason.retired'),
  effort: (reason) => t('reason.effort', { effort: t(`level.${reason.effort}`) }),
  alone: () => t('reason.alone'),
  doubled: (reason) => t('reason.doubled', { component: componentName(reason.component) }),
  pair: (reason) => t('reason.pair', { partner: reason.partner }),
  gap: (reason) => t('reason.gap', { component: componentName(reason.component) }),
  fresh: () => t('reason.fresh'),
  due: (reason) => t('reason.due', { ago: ago(reason.days) }),
  recency: (reason) => (reason.days > 0 ? ago(reason.days) : t('reason.planned')),
};

/** @param {any} reason @returns {string} */
const reasonText = (reason) => (reason && REASON[reason.axis]?.(reason)) || '';

/**
 * What `+` will do, in words — the button itself is a `+` like every row's,
 * and the plain sentence is what the screen reader gets instead.
 * @param {{ item?: any, name?: string } | null} action
 */
const addLabel = (action) => {
  if (action?.item) return t('day.addItem', { name: action.item.name });
  if (action?.name) return t('day.createAndAdd', { name: action.name });
  return t('day.add');
};

class DayFocus extends AurilElement {
  /** Search text — local state: nobody else needs to know what is being typed. */
  #query = '';

  onConnect() {
    this.watch((s) => s.week, () => this.update());
    this.watch((s) => s.items, () => this.update());
    this.watch((s) => s.suggestions, () => this.update());

    this.delegate('click', '.add', (_, el) => this.#write(addToPlan(this.date, this.#id(el))));
    this.delegate('click', '.fill', () => this.#write(fillDay(this.date)));
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

    // The field searches while it is typed; `+` is what it does with the
    // result. Enter is the same action — the keyboard is the accelerator.
    this.delegate('submit', '.search-form', (event) => {
      event.preventDefault();
      this.#run();
    });
    this.delegate('click', '.go', () => this.#run());
    // The field keeps the focus: a blur here would drop the keyboard, and the
    // list under the field would jump before the click lands.
    this.delegate('mousedown', '.go', (event) => event.preventDefault());

    loadWeek();
    loadItems();
    loadSuggestions(this.date);
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
    await Promise.all([loadWeek(), loadItems(), loadSuggestions(this.date)]);
  }

  /** The ranking for this date — nothing until the one for this date arrives. */
  #ranked() {
    return store.state.suggestions.date === this.date ? store.state.suggestions.list : [];
  }

  /**
   * What the query leaves of the ranking: the list under the field, and what
   * the field's `+` is offering.
   * @param {any} day
   */
  #found(day) {
    const query = this.#query.trim().toLowerCase();
    const planned = new Set(day.items.map((/** @type {any} */ item) => item.id));
    return this.#ranked()
      .filter(({ item }) => !planned.has(item.id) && item.name.toLowerCase().includes(query));
  }

  /**
   * The one thing `+` does, read off the search: with a single hit it adds it,
   * with none it creates what was typed. Several hits are not the button's
   * decision to make — the list is right there — and neither is a name the
   * inventory already has under a different search.
   * @param {any[]} found
   * @returns {{ item?: any, name?: string } | null}
   */
  #action(found) {
    const name = this.#query.trim();
    if (!name) return null;
    if (found.length === 1) return { item: found[0].item };
    const known = store.state.items.some((item) => item.name.toLowerCase() === name.toLowerCase());
    return found.length === 0 && !known ? { name } : null;
  }

  /** Add the hit or create the name — either way the evening gets the item. */
  async #run() {
    const day = this.#day();
    const action = day && this.#action(this.#found(day));
    if (!action) return;
    const input = /** @type {HTMLInputElement | null} */ (this.querySelector('.query'));
    this.#query = '';
    if (input) input.value = ''; // morph leaves the focused field alone — clear it here
    // A new item takes the level of the evening it was created for: nobody
    // wants a warning about the thing they just typed.
    const item = action.item ?? await createItem(action.name, { effort: day.effort });
    await this.#write(addToPlan(this.date, item.id));
    input?.focus();
  }

  /** @param {any} item @param {'x' | 'add'} action @param {string} [reason] */
  #row(item, action, reason = '') {
    const [prefix, mark] = action === 'x' ? ['plate', '✕'] : ['sug', '+'];
    return html`
      <button class="row ${action}" id="${prefix}-${item.id}" data-id="${item.id}">
        <span class="grow">${item.name}</span>
        ${reason && html`<span class="reason">${reason}</span>`}
        <span class="${action}-mark">${mark}</span>
      </button>`;
  }

  render() {
    const day = this.#day();
    if (!day) return html`<main class="column wide"></main>`;

    const query = this.#query.trim();
    const ranked = this.#ranked();
    const found = this.#found(day);
    const action = this.#action(found);
    // Nothing to propose on an evening that already has something on it —
    // clearing the day is how you ask again.
    const canFill = day.items.length === 0 && ranked.length > 0 && !query;
    // A full plate gives room back.
    const suggestions = found.slice(0, Math.max(3, ROWS - day.items.length - (canFill ? 1 : 0)));
    const tooMuch = day.items.filter((/** @type {any} */ item) => EFFORT_ORDER.indexOf(item.effort) > EFFORT_ORDER.indexOf(day.effort));

    return html`
      <header class="head column wide">
        <div class="head-line">
          <img class="logo" src="/icon.svg" alt="" width="26" height="26">
          <h1 class="day-title">${WEEKDAYS[day.weekday]} <span class="soft num">${dayOfMonth(day.date)}</span></h1>
          <button class="level" type="button"
                  aria-label="${t('day.level', { weekday: WEEKDAYS[day.weekday], effort: t(`level.${day.effort}`) })}"
                  >${t(`level.${day.effort}`)}</button>
          <span class="grow"></span>
          <a class="action" href="/">${t('nav.week')}</a>
        </div>
        ${tooMuch.length > 0 && html`
          <p class="hint warn">${t('day.tooMuch', {
            evening: t(`evening.${day.effort}`),
            items: tooMuch.map((/** @type {any} */ i) => i.name).join(', '),
          })}</p>`}
      </header>

      <section class="column wide plate-list">
        ${day.items.map((/** @type {any} */ item) => this.#row(item, 'x'))}
      </section>

      <p class="column wide section">${t('day.suggestions')}</p>
      <form class="column wide search-line search-form">
        <label class="search">
          <span class="soft" aria-hidden="true">⌕</span>
          <input class="query" value="${this.#query}" placeholder="${t('day.search')}"
                 autocomplete="off" enterkeyhint="enter" aria-label="${t('day.searchLabel')}">
        </label>
        <button class="go" type="submit" ${action ? '' : 'disabled'}
                aria-label="${addLabel(action)}">+</button>
      </form>

      <main class="column wide">
        ${canFill && html`
          <button class="row fill"><span class="grow">${t('day.propose')}</span><span class="add-mark">+</span></button>`}
        ${suggestions.map(({ item, reason }) => this.#row(item, 'add', reasonText(reason)))}
        ${ranked.length === 0 && !query && html`<p class="hint">${t('day.empty')}</p>`}
      </main>`;
  }
}
customElements.define('day-focus', DayFocus);
