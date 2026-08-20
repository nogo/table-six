// The week board: seven evenings, enough to judge each one, nothing to edit.
// The whole row is the button — it leads to the day focus.
import { AurilElement, html } from './auril/index.js';
import { loadWeek, router, store } from './app.js';
import { WEEKDAYS, addDays, dayOfMonth, range, today, weekStart } from './dates.js';

class WeekBoard extends AurilElement {
  onConnect() {
    this.watch((s) => s.week, () => this.update());
    this.watch((s) => s.offline, () => this.update());
    this.watch((s) => s.weekStart, (start) => loadWeek(start));

    this.delegate('click', '.day', (_, el) => router.go(`/day/${el.getAttribute('data-date')}`));
    this.delegate('click', '.step', (_, el) => {
      store.set((s) => ({ weekStart: addDays(s.weekStart, Number(el.getAttribute('data-step')) * 7) }));
    });
    this.delegate('click', '.to-today', () => store.set({ weekStart: weekStart(today()) }));

    loadWeek();
  }

  /** @param {any} day */
  #row(day) {
    const isToday = day.date === today();
    return html`
      <button class="day ${isToday ? 'today' : ''}" id="day-${day.date}" data-date="${day.date}">
        <span class="day-head">
          <span class="name">${WEEKDAYS[day.weekday]}</span>
          <span class="date num">${dayOfMonth(day.date)}</span>
          <span class="grow"></span>
          ${isToday ? html`<span class="effort today-mark">heute</span>` : html`<span class="effort">${day.effort}</span>`}
          ${day.overEffort && html`<span class="mark warn">⚠︎</span>`}
          ${day.vegetarian && html`<span class="mark">🌱</span>`}
        </span>
        <span class="plate ${day.items.length ? '' : 'empty'}">
          ${day.items.length ? day.items.map((item) => item.name).join(' · ') : '–'}
        </span>
      </button>`;
  }

  render() {
    const { week, offline } = store.state;
    if (!week) {
      return html`<main class="column">${offline && html`<p class="hint">Keine Verbindung. Sobald das Netz da ist, ist die Woche da.</p>`}</main>`;
    }
    return html`
      <header class="head column">
        <h1 class="caps">KW ${week.week} <span class="soft num">${range(week.start, week.end)}</span></h1>
        <button class="step" data-step="-1" aria-label="Woche zurück">‹</button>
        <button class="step" data-step="1" aria-label="Woche vor">›</button>
      </header>
      ${offline && html`<p class="column hint">offline — die Woche kann veraltet sein</p>`}
      <main class="column">${week.days.map((day) => this.#row(day))}</main>
      <nav class="bar">
        <div class="column">
          <button class="to-today">heute</button>
          <a href="/inventory">Bestand</a>
        </div>
      </nav>`;
  }
}
customElements.define('week-board', WeekBoard);
