import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TITLE, cleanTitle, createTask, renameTask, completeTask, uncompleteTask,
  activeTasks, completedTasks, validateTask, toISO,
} from '../src/model.js';

const T0 = new Date('2026-11-24T15:00:00.000Z');
const later = (min) => new Date(T0.getTime() + min * 60_000);

test('createTask sets id, title, createdAt (UTC ISO) and completedAt = null', () => {
  const t = createTask('  Buy   milk \n', T0);
  assert.match(t.id, /^[0-9a-f-]{36}$/);
  assert.equal(t.title, 'Buy milk');
  assert.equal(t.createdAt, '2026-11-24T15:00:00.000Z');
  assert.equal(t.completedAt, null);
  assert.equal(validateTask(t), null);
});

test('createTask rejects empty and whitespace-only titles', () => {
  assert.throws(() => createTask('', T0));
  assert.throws(() => createTask('   \n\t ', T0));
  assert.throws(() => createTask(undefined, T0));
});

test('each task gets a unique id', () => {
  const ids = new Set(Array.from({ length: 200 }, () => createTask('x', T0).id));
  assert.equal(ids.size, 200);
});

test('createdAt never changes through rename, complete, uncomplete, repeat', () => {
  let t = createTask('Call mom', T0);
  const created = t.createdAt;
  t = renameTask(t, 'Call mom back');
  t = completeTask(t, later(5));
  t = uncompleteTask(t);
  t = completeTask(t, later(10));
  t = renameTask(t, 'Called mom');
  assert.equal(t.createdAt, created);
});

test('tasks are frozen, so createdAt cannot be reassigned by accident', () => {
  const t = createTask('x', T0);
  assert.throws(() => { 'use strict'; t.createdAt = toISO(later(1)); }, TypeError);
  assert.equal(t.createdAt, '2026-11-24T15:00:00.000Z');
});

test('completeTask sets completedAt to now and does not mutate the original', () => {
  const t = createTask('x', T0);
  const done = completeTask(t, later(30));
  assert.equal(done.completedAt, '2026-11-24T15:30:00.000Z');
  assert.equal(t.completedAt, null);
});

test('completing twice keeps the first completedAt (double tap)', () => {
  const done = completeTask(createTask('x', T0), later(30));
  const again = completeTask(done, later(31));
  assert.equal(again.completedAt, '2026-11-24T15:30:00.000Z');
  assert.equal(again, done);
});

test('uncompleteTask clears completedAt; uncompleting an active task is a no-op', () => {
  const t = createTask('x', T0);
  assert.equal(uncompleteTask(t), t);
  const back = uncompleteTask(completeTask(t, later(1)));
  assert.equal(back.completedAt, null);
  assert.equal(back.createdAt, t.createdAt);
});

test('renameTask changes only the title and rejects empty titles', () => {
  const t = completeTask(createTask('a', T0), later(1));
  const r = renameTask(t, ' b ');
  assert.deepEqual({ ...r }, { ...t, title: 'b' });
  assert.throws(() => renameTask(t, '  '));
});

test('cleanTitle caps long dictation at MAX_TITLE on a word boundary', () => {
  const long = 'word '.repeat(300);
  const { title, truncated } = cleanTitle(long);
  assert.equal(truncated, true);
  assert.ok(title.length <= MAX_TITLE);
  assert.ok(title.endsWith('word…'));
  assert.equal(cleanTitle('short').truncated, false);
});

test('activeTasks: only active, newest createdAt first', () => {
  const a = createTask('a', later(0));
  const b = createTask('b', later(1));
  const c = completeTask(createTask('c', later(2)), later(3));
  assert.deepEqual(activeTasks([a, c, b]).map((t) => t.title), ['b', 'a']);
});

test('completedTasks: only completed, newest completedAt first (not createdAt)', () => {
  const old = completeTask(createTask('old', later(0)), later(50));
  const recent = completeTask(createTask('recent', later(10)), later(20));
  assert.deepEqual(completedTasks([recent, old]).map((t) => t.title), ['old', 'recent']);
});

test('validateTask rejects malformed records', () => {
  const ok = createTask('x', T0);
  assert.equal(validateTask(ok), null);
  assert.match(validateTask({ ...ok, id: 'nope' }), /UUID/);
  assert.match(validateTask({ ...ok, title: ' ' }), /title/);
  assert.match(validateTask({ ...ok, createdAt: '2026-11-24 15:00' }), /createdAt/);
  assert.match(validateTask({ ...ok, createdAt: '2026-11-24T15:00:00+01:00' }), /createdAt/);
  assert.match(validateTask({ ...ok, completedAt: 'yesterday' }), /completedAt/);
  assert.match(validateTask({ ...ok, completedAt: undefined }), /completedAt/);
  assert.match(validateTask(null), /object/);
});
