// Pure task functions. No DOM, no storage: everything here is unit-tested.
//
// A task is { id, title, createdAt, completedAt }.
// - createdAt is set once in createTask(). No function in this file changes it.
// - Timestamps are UTC ISO 8601 strings ("2026-11-24T23:41:07.512Z").

export const MAX_TITLE = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Date | number | ISO string -> canonical UTC ISO string. */
export function toISO(when) {
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid date: ${when}`);
  return d.toISOString();
}

/**
 * Trim, collapse whitespace (dictation can add odd spacing/newlines), cap length.
 * Returns { title, truncated }. title is '' when there's nothing left.
 */
export function cleanTitle(raw) {
  if (typeof raw !== 'string') return { title: '', truncated: false };
  const title = raw.replace(/\s+/g, ' ').trim();
  if (title.length <= MAX_TITLE) return { title, truncated: false };
  // Cut at the last word boundary that leaves room for the ellipsis.
  const room = title.slice(0, MAX_TITLE - 1);
  const space = room.lastIndexOf(' ');
  const cut = space > MAX_TITLE * 0.8 ? room.slice(0, space) : room;
  return { title: cut + '…', truncated: true };
}

export function createTask(rawTitle, now = new Date(), id = crypto.randomUUID()) {
  const { title } = cleanTitle(rawTitle);
  if (!title) throw new Error('Task title is empty');
  return Object.freeze({ id, title, createdAt: toISO(now), completedAt: null });
}

/** Returns a copy with only the title changed. Empty titles are rejected. */
export function renameTask(task, rawTitle) {
  const { title } = cleanTitle(rawTitle);
  if (!title) throw new Error('Task title is empty');
  if (title === task.title) return task;
  return Object.freeze({ ...task, title });
}

/** Idempotent: completing a completed task returns it unchanged, so a double tap can't move completedAt. */
export function completeTask(task, now = new Date()) {
  if (task.completedAt) return task;
  return Object.freeze({ ...task, completedAt: toISO(now) });
}

/** Moves a task back to active. createdAt is untouched. */
export function uncompleteTask(task) {
  if (!task.completedAt) return task;
  return Object.freeze({ ...task, completedAt: null });
}

export const isCompleted = (task) => task.completedAt != null;

const byNewest = (field) => (a, b) =>
  Date.parse(b[field]) - Date.parse(a[field]) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Active tasks, newest createdAt first. */
export function activeTasks(tasks) {
  return tasks.filter((t) => !isCompleted(t)).sort(byNewest('createdAt'));
}

/** Completed tasks, newest completedAt first. */
export function completedTasks(tasks) {
  return tasks.filter(isCompleted).sort(byNewest('completedAt'));
}

/** Strict shape check, used by import and when loading from storage. Returns an error string or null. */
export function validateTask(t) {
  if (!t || typeof t !== 'object') return 'not an object';
  if (typeof t.id !== 'string' || !UUID_RE.test(t.id)) return 'id is not a UUID';
  if (typeof t.title !== 'string' || !t.title.trim()) return 'title is empty';
  if (t.title.length > MAX_TITLE) return `title is longer than ${MAX_TITLE} characters`;
  if (typeof t.createdAt !== 'string' || !ISO_RE.test(t.createdAt) || Number.isNaN(Date.parse(t.createdAt)))
    return 'createdAt is not a UTC ISO timestamp';
  if (t.completedAt !== null) {
    if (typeof t.completedAt !== 'string' || !ISO_RE.test(t.completedAt) || Number.isNaN(Date.parse(t.completedAt)))
      return 'completedAt is not null or a UTC ISO timestamp';
  }
  return null;
}
