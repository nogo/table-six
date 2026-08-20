import { expect, test } from 'bun:test';
import { addDays, isIsoDate, isoWeek, today, weekDays, weekStart, weekday } from '../src/dates.ts';

test('weekday counts Monday as 1 and Sunday as 7', () => {
  expect(weekday('2026-08-17')).toBe(1);
  expect(weekday('2026-08-23')).toBe(7);
});

test('a week starts on the Monday of the day given', () => {
  expect(weekStart('2026-08-20')).toBe('2026-08-17');
  expect(weekStart('2026-08-17')).toBe('2026-08-17');
  expect(weekStart('2026-08-23')).toBe('2026-08-17'); // Sunday belongs to the week before
});

test('the week runs Monday to Sunday and crosses the month', () => {
  expect(weekDays('2026-08-31')).toEqual([
    '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06',
  ]);
});

test('date arithmetic survives the DST switch', () => {
  expect(addDays('2026-10-24', 1)).toBe('2026-10-25'); // clocks go back that night
  expect(addDays('2026-03-28', 1)).toBe('2026-03-29'); // and forward that one
});

test('ISO week numbers follow the Thursday rule', () => {
  expect(isoWeek('2026-08-20')).toBe(34);
  expect(isoWeek('2026-01-01')).toBe(1);
  expect(isoWeek('2027-01-01')).toBe(53); // still the last week of 2026
  expect(isoWeek('2025-12-29')).toBe(1); // already week 1 of 2026
});

test('isIsoDate rejects what the API must not store', () => {
  expect(isIsoDate('2026-08-17')).toBe(true);
  expect(isIsoDate('2026-13-01')).toBe(false);
  expect(isIsoDate('17.8.2026')).toBe(false);
  expect(isIsoDate(20260817)).toBe(false);
});

test('today reads the local day, not the UTC one', () => {
  // 00:30 local on the 20th is still the 19th in UTC when we are ahead of it.
  const local = new Date(2026, 7, 20, 0, 30);
  expect(today(local)).toBe('2026-08-20');
});
