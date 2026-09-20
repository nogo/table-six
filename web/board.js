// The week board: seven evenings, enough to judge each one, nothing to edit.
// The whole row is the button — it leads to the day focus.
import { AurilElement, html } from './auril/index.js';
import { loadWeek, router, store } from './app.js';
import { t } from './i18n.js';
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
          ${isToday
            ? html`<span class="effort today-mark">${t('board.today')}</span>`
            : html`<span class="effort">${t(`level.${day.effort}`)}</span>`}
          ${day.overEffort && html`<span class="mark warn">⚠︎</span>`}
        </span>
        <span class="plate ${day.items.length ? '' : 'empty'}">
          ${day.items.length ? day.items.map((item) => item.name).join(' · ') : '–'}
        </span>
      </button>`;
  }

  /**
   * The app bar, one line: the mark, which week is on screen, and the one
   * other screen. Stepping through the weeks is not up here — it is the one
   * thing this screen does over and over, so it sits in the thumb zone.
   * @param {any} week
   */
  #head(week) {
    return html`
      <header class="head column wide">
        <div class="head-line">
          <img class="logo" src="/icon.svg" alt="Table Six" width="26" height="26">
          ${week && html`
            <h1 class="caps">${t('board.week', { week: week.week })}
              <span class="soft num">${range(week.start, week.end)}</span></h1>`}
          <a class="action" href="/inventory">${t('nav.inventory')}</a>
        </div>
      </header>`;
  }

  /**
   * The way through the weeks, at the bottom: the arrows at the two edges of
   * the line, `●` in the middle. The dot is now — where the arrows lead back
   * to, and the reason the three need no words between them.
   */
  #weeks() {
    return html`
      <nav class="bar">
        <div class="column wide weeks">
          <button class="step" data-step="-1" aria-label="${t('nav.prevWeek')}">‹</button>
          <button class="step now to-today" aria-label="${t('nav.thisWeek')}">●</button>
          <button class="step" data-step="1" aria-label="${t('nav.nextWeek')}">›</button>
        </div>
      </nav>`;
  }

  render() {
    const { week, offline } = store.state;
    if (!week) {
      return html`${this.#head(null)}
        <main class="column wide">${offline && html`<p class="hint">${t('board.unreachable')}</p>`}</main>`;
    }
    return html`
      ${this.#head(week)}
      ${offline && html`<p class="column wide hint">${t('board.offline')}</p>`}
      <main class="column wide">${week.days.map((day) => this.#row(day))}</main>
      ${this.#weeks()}`;
  }
}
customElements.define('week-board', WeekBoard);
