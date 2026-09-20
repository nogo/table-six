// The client's half of the date math: stepping weeks and naming the days. The
// server owns the week's contents, the browser owns what "today" means.
import { language } from './i18n.js';

const DAY = 86_400_000;

/** @param {string} date @param {number} days */
export const addDays = (date, days) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** Today in the kitchen's timezone, not UTC's. */
export function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** @param {string} date @returns {number} 1 = Monday … 7 = Sunday */
export const weekday = (date) => new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay() || 7;

/** @param {string} date The Monday of that week. */
export const weekStart = (date) => addDays(date, 1 - weekday(date));

/**
 * Monday … Sunday in the language the app is served in, index 1 = Monday like
 * everywhere else. `Intl` already knows every one of them, so no list here has
 * to be kept in two languages. 1 January 2024 was a Monday.
 */
export const WEEKDAYS = [
  '',
  ...Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(2024, 0, 1 + index))),
];

/** @param {string} date @returns {string} the day of the month, "19" */
export const dayOfMonth = (date) => String(Number(date.slice(8, 10)));

const month = (date) => String(Number(date.slice(5, 7)));

/** "17.–23.8." within a month, "31.8.–6.9." across one. */
export function range(start, end) {
  const from = month(start) === month(end)
    ? `${dayOfMonth(start)}.`
    : `${dayOfMonth(start)}.${month(start)}.`;
  return `${from}–${dayOfMonth(end)}.${month(end)}.`;
}

/** Ascending — the same order the server uses to judge an evening. */
export const EFFORT_ORDER = ['kurz', 'normal', 'entspannt'];
