// ISO date strings (YYYY-MM-DD) are the only date type that crosses a
// boundary here. All arithmetic goes through UTC so a timezone can never
// shift an evening onto the neighbouring day.

const DAY = 86_400_000;

const utc = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(utc(value));

export const addDays = (date: string, days: number): string => iso(utc(date) + days * DAY);

/** Whole days from `from` to `to`; negative when `to` is the earlier one. */
export const daysBetween = (from: string, to: string): number => Math.round((utc(to) - utc(from)) / DAY);

/** 1 = Monday … 7 = Sunday. */
export const weekday = (date: string): number => new Date(utc(date)).getUTCDay() || 7;

/** The Monday of the week `date` falls in. */
export const weekStart = (date: string): string => addDays(date, 1 - weekday(date));

export const weekDays = (start: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(start, i));

/** ISO 8601 week number — the week containing that week's Thursday. */
export function isoWeek(date: string): number {
  const thursday = addDays(weekStart(date), 3);
  const firstOfYear = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor((utc(thursday) - utc(weekStart(firstOfYear))) / (7 * DAY)) + 1;
}

/** Today in the machine's local timezone — the kitchen's, not UTC's. */
export function today(now: Date = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
