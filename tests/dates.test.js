import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDateKey, dayLabel, formatStamp, groupCompleted } from '../src/dates.js';
import { createTask, completeTask } from '../src/model.js';

const NY = 'America/New_York';
const LA = 'America/Los_Angeles';
const TOKYO = 'Asia/Tokyo';
// Newer ICU puts a narrow no-break space before AM/PM; compare on plain spaces.
const plain = (s) => s.replace(/[  ]/g, ' ');

const doneAt = (title, iso) => completeTask(createTask(title, new Date('2026-01-01T00:00:00.000Z')), new Date(iso));

test('localDateKey: the same UTC instant is a different day in different zones', () => {
  const instant = '2026-11-24T03:30:00.000Z'; // 10:30 PM Nov 23 in NY, 12:30 PM Nov 24 in Tokyo
  assert.equal(localDateKey(instant, NY), '2026-11-23');
  assert.equal(localDateKey(instant, TOKYO), '2026-11-24');
  assert.equal(localDateKey(instant, 'UTC'), '2026-11-24');
});

test('dayLabel: Today, Yesterday, weekday date, and year for older years', () => {
  const now = new Date('2026-11-24T17:00:00.000Z'); // Tue Nov 24, 12 PM in NY
  assert.equal(dayLabel('2026-11-24', now, NY), 'Today');
  assert.equal(dayLabel('2026-11-23', now, NY), 'Yesterday');
  assert.equal(dayLabel('2026-11-22', now, NY), 'Sun, Nov 22');
  assert.equal(dayLabel('2025-11-23', now, NY), 'Sun, Nov 23, 2025');
});

test('dayLabel: Yesterday works across a month and a year boundary', () => {
  assert.equal(dayLabel('2026-11-30', new Date('2026-12-01T15:00:00Z'), NY), 'Yesterday');
  assert.equal(dayLabel('2025-12-31', new Date('2026-01-01T15:00:00Z'), NY), 'Yesterday');
});

test('groupCompleted: 11:55 PM and 12:05 AM land in different groups (calendar days, not 24h)', () => {
  const now = new Date('2026-11-24T15:00:00.000Z'); // 10 AM Nov 24 in NY
  const groups = groupCompleted([
    doneAt('before midnight', '2026-11-24T04:55:00.000Z'), // 11:55 PM Nov 23 NY
    doneAt('after midnight', '2026-11-24T05:05:00.000Z'), // 12:05 AM Nov 24 NY
  ], now, NY);
  assert.deepEqual(groups.map((g) => [g.label, g.tasks.map((t) => t.title)]), [
    ['Today', ['after midnight']],
    ['Yesterday', ['before midnight']],
  ]);
});

test('groupCompleted: the same tasks group differently in LA and Tokyo', () => {
  const tasks = [
    doneAt('a', '2026-11-24T06:00:00.000Z'), // LA: Nov 23 10 PM · Tokyo: Nov 24 3 PM
    doneAt('b', '2026-11-24T20:00:00.000Z'), // LA: Nov 24 12 PM · Tokyo: Nov 25 5 AM
  ];
  const now = new Date('2026-11-24T21:00:00.000Z'); // LA: Nov 24 1 PM · Tokyo: Nov 25 6 AM
  const la = groupCompleted(tasks, now, LA).map((g) => [g.label, g.tasks.length]);
  const tokyo = groupCompleted(tasks, now, TOKYO).map((g) => [g.label, g.tasks.length]);
  assert.deepEqual(la, [['Today', 1], ['Yesterday', 1]]);
  assert.deepEqual(tokyo, [['Today', 1], ['Yesterday', 1]]);
  // Same labels, but they point at different calendar days:
  assert.deepEqual(groupCompleted(tasks, now, LA).map((g) => g.key), ['2026-11-24', '2026-11-23']);
  assert.deepEqual(groupCompleted(tasks, now, TOKYO).map((g) => g.key), ['2026-11-25', '2026-11-24']);
});

test('groupCompleted: DST change days (23 h and 25 h) still group by calendar day', () => {
  // US DST ends Sun Nov 1, 2026 (25-hour day in NY). 12:30 AM and 11:30 PM that day = same group.
  const tasks = [
    doneAt('early', '2026-11-01T04:30:00.000Z'), // 12:30 AM EDT Nov 1
    doneAt('late', '2026-11-02T04:30:00.000Z'), // 11:30 PM EST Nov 1
  ];
  const g = groupCompleted(tasks, new Date('2026-11-02T15:00:00Z'), NY);
  assert.deepEqual(g.map((x) => [x.label, x.tasks.map((t) => t.title)]), [['Yesterday', ['late', 'early']]]);

  // US DST starts Sun Mar 8, 2026 (23-hour day). Mar 7 11 PM EST and Mar 8 11 PM EDT are 23 h apart, still two days.
  const spring = [
    doneAt('sat', '2026-03-08T04:00:00.000Z'), // 11 PM EST Mar 7
    doneAt('sun', '2026-03-09T03:00:00.000Z'), // 11 PM EDT Mar 8
  ];
  const s = groupCompleted(spring, new Date('2026-03-09T15:00:00Z'), NY);
  assert.deepEqual(s.map((x) => x.label), ['Yesterday', 'Sat, Mar 7']);
});

test('groupCompleted: newest day first, newest task first, active tasks ignored', () => {
  const active = createTask('active', new Date('2026-11-24T12:00:00Z'));
  const tasks = [
    doneAt('mon-early', '2026-11-23T14:00:00.000Z'),
    doneAt('tue', '2026-11-24T14:00:00.000Z'),
    doneAt('mon-late', '2026-11-23T20:00:00.000Z'),
    active,
  ];
  const g = groupCompleted(tasks, new Date('2026-11-24T20:00:00Z'), NY);
  assert.deepEqual(g.map((x) => [x.label, x.tasks.map((t) => t.title)]), [
    ['Today', ['tue']],
    ['Yesterday', ['mon-late', 'mon-early']],
  ]);
  assert.deepEqual(groupCompleted([], new Date(), NY), []);
});

test('formatStamp: local date and time, year only when not the current year', () => {
  const now = new Date('2026-11-24T20:00:00Z');
  assert.equal(plain(formatStamp('2026-11-24T20:41:00.000Z', now, NY)), 'Tue, Nov 24, 3:41 PM');
  assert.equal(plain(formatStamp('2026-11-24T20:41:00.000Z', now, TOKYO)), 'Wed, Nov 25, 5:41 AM');
  assert.equal(plain(formatStamp('2025-11-24T20:41:00.000Z', now, NY)), 'Mon, Nov 24, 2025, 3:41 PM');
});

test('defaults use the device time zone without throwing', () => {
  const key = localDateKey(new Date());
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(dayLabel(key), 'Today');
});
