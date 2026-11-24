// Date display and grouping. Pure functions; `now`, `timeZone` and `locale` are
// parameters so tests can pin them. In the app they default to the phone's settings.

import { completedTasks } from './model.js';

const DAY_MS = 86_400_000;

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const fmtCache = new Map();
function fmt(locale, options) {
  const key = locale + JSON.stringify(options);
  let f = fmtCache.get(key);
  if (!f) fmtCache.set(key, (f = new Intl.DateTimeFormat(locale, options)));
  return f;
}

/** The calendar date ("2026-11-24") an instant falls on in `timeZone`. */
export function localDateKey(when, timeZone = deviceTimeZone()) {
  const parts = fmt('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(when));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Day number of a date key. Calendar arithmetic in UTC, so DST days (23 or 25 h) don't matter.
const dayNumber = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

/** "Today" / "Yesterday" / "Mon, Nov 23" / "Mon, Nov 23, 2025". */
export function dayLabel(key, now = new Date(), timeZone = deviceTimeZone(), locale = 'en-US') {
  const todayKey = localDateKey(now, timeZone);
  const diff = dayNumber(todayKey) - dayNumber(key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const sameYear = key.slice(0, 4) === todayKey.slice(0, 4);
  const opts = { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' };
  if (!sameYear) opts.year = 'numeric';
  return fmt(locale, opts).format(new Date(dayNumber(key) * DAY_MS));
}

/** "Tue, Nov 24, 3:41 PM" (year added when it isn't the current year). */
export function formatStamp(iso, now = new Date(), timeZone = deviceTimeZone(), locale = 'en-US') {
  const sameYear = localDateKey(iso, timeZone).slice(0, 4) === localDateKey(now, timeZone).slice(0, 4);
  const opts = { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  if (!sameYear) opts.year = 'numeric';
  return fmt(locale, opts).format(new Date(iso));
}

/**
 * Completed tasks grouped by the local calendar day they were completed on.
 * Returns [{ key, label, tasks }], newest day first, newest task first within a day.
 */
export function groupCompleted(tasks, now = new Date(), timeZone = deviceTimeZone(), locale = 'en-US') {
  const groups = [];
  let current = null;
  for (const task of completedTasks(tasks)) {
    const key = localDateKey(task.completedAt, timeZone);
    if (!current || current.key !== key) {
      current = { key, label: dayLabel(key, now, timeZone, locale), tasks: [] };
      groups.push(current);
    }
    current.tasks.push(task);
  }
  return groups;
}
