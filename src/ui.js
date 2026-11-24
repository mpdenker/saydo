// App entry: state, rendering and events. All task rules live in model.js; all
// date logic in dates.js; storage in db.js. This file only wires them to the DOM.

import { APP } from './config.js';
import {
  cleanTitle, createTask, renameTask, completeTask, uncompleteTask,
  activeTasks, validateTask,
} from './model.js';
import { formatStamp, groupCompleted, localDateKey } from './dates.js';
import * as db from './db.js';

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion.matches ? 0 : ms));

const state = {
  tasks: new Map(),   // id -> task, the saved truth
  pending: new Map(), // id -> task, saved but still animating out of its list
  view: 'active',     // 'active' | 'done'
  editingId: null,
  todayKey: localDateKey(new Date()),
};

// ---------- Rendering ----------

const CHECK_SVG =
  '<svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true">' +
  '<circle cx="13" cy="13" r="11.5"/><path d="M8 13.5l3.4 3.4L18.2 9.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text; // textContent, never innerHTML, for user text
  return node;
}

// "Added <date, time>" or "Added <date, time> · Done <date, time>". Each stamp stays on
// one line, so on a narrow screen the wrap happens at the "·", not inside a date.
function metaFor(task, now) {
  const meta = el('span', 'meta');
  meta.append(el('span', 'stamp', `Added ${formatStamp(task.createdAt, now)}`));
  if (task.completedAt) {
    meta.append(' · ', el('span', 'stamp', `Done ${formatStamp(task.completedAt, now)}`));
  }
  return meta;
}

function rowFor(task, now) {
  const shown = state.pending.get(task.id) ?? task;
  const li = el('li', 'row');
  li.dataset.id = task.id;
  li.classList.toggle('done', !!shown.completedAt);

  const check = el('button', 'check');
  check.type = 'button';
  check.innerHTML = CHECK_SVG; // static markup
  check.setAttribute('aria-label', shown.completedAt ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`);
  check.setAttribute('aria-pressed', String(!!shown.completedAt));

  const body = el('button', 'body');
  body.type = 'button';
  body.setAttribute('aria-label', `Edit “${task.title}”`);
  body.append(el('span', 'title', task.title), metaFor(task, now));

  li.append(check, body);
  return li;
}

function emptyState(title, line) {
  const div = el('div', 'empty');
  div.append(el('strong', null, title), el('span', null, line));
  return div;
}

function render() {
  const now = new Date();
  const all = [...state.tasks.values()];
  const active = activeTasks(all);
  const doneCount = all.length - active.length;

  $('count-active').textContent = active.length ? String(active.length) : '';
  $('count-done').textContent = doneCount ? String(doneCount) : '';
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.view === state.view));
  }
  $('list').setAttribute('aria-labelledby', state.view === 'active' ? 'tab-active' : 'tab-done');

  const frag = document.createDocumentFragment();
  if (state.view === 'active') {
    if (!active.length) {
      frag.append(emptyState('Nothing to do', 'Tap + to add a task.'));
    } else {
      const ul = el('ul', 'rows');
      for (const t of active) ul.append(rowFor(t, now));
      frag.append(ul);
    }
  } else {
    const groups = groupCompleted(all, now);
    if (!groups.length) frag.append(emptyState('No completed tasks', 'Finished tasks show up here.'));
    for (const g of groups) {
      const section = el('section');
      const h = el('h2', 'day', g.label);
      h.id = `day-${g.key}`;
      const ul = el('ul', 'rows');
      ul.setAttribute('aria-labelledby', h.id);
      for (const t of g.tasks) ul.append(rowFor(t, now));
      section.append(h, ul);
      frag.append(section);
    }
  }
  $('list').replaceChildren(frag);
}

function setView(view) {
  if (state.view === view) return;
  state.view = view;
  render();
  window.scrollTo({ top: 0 });
}

// ---------- Toast ----------

let toastTimer = null;
let toastAction = null;

function showToast(text, actionLabel = null, action = null, ms = 5000) {
  clearTimeout(toastTimer);
  $('toast-text').textContent = text;
  const btn = $('toast-action');
  btn.hidden = !actionLabel;
  btn.textContent = actionLabel ?? '';
  toastAction = action;
  $('toast').hidden = false;
  toastTimer = setTimeout(hideToast, ms);
}

function hideToast() {
  clearTimeout(toastTimer);
  $('toast').hidden = true;
  toastAction = null;
}

$('toast-action').addEventListener('click', async () => {
  const action = toastAction;
  hideToast();
  if (action) await action();
});

// ---------- Actions ----------

async function addTask(raw) {
  const { title, truncated } = cleanTitle(raw);
  if (!title) return;
  const task = createTask(title);
  try {
    await db.putTask(task);
  } catch (err) {
    console.error(err);
    showToast('Couldn’t save that task. Try again.');
    return;
  }
  state.tasks.set(task.id, task);
  state.view = 'active';
  render();
  document.querySelector(`.row[data-id="${task.id}"]`)?.classList.add('new');
  showToast(truncated ? 'Added (shortened to 500 characters)' : 'Added', 'Undo', async () => {
    try {
      await db.deleteTask(task.id);
      state.tasks.delete(task.id);
      render();
    } catch (err) {
      console.error(err);
      showToast('Couldn’t undo. Try again.');
    }
  });
}

async function toggleTask(id, li) {
  const task = state.tasks.get(id);
  if (!task || state.pending.has(id)) return; // ignore taps while it's animating
  const updated = task.completedAt ? uncompleteTask(task) : completeTask(task, new Date());

  // Instant feedback, then save, then animate the row out of this list.
  state.pending.set(id, updated);
  li.classList.toggle('done', !!updated.completedAt);
  try {
    await db.putTask(updated);
  } catch (err) {
    console.error(err);
    state.pending.delete(id);
    render();
    showToast('Couldn’t save. Try again.');
    return;
  }
  await wait(280); // let the check fill
  const live = document.querySelector(`.row[data-id="${id}"]`);
  if (live) {
    live.style.height = `${live.offsetHeight}px`;
    void live.offsetHeight; // commit the starting height before transitioning
    live.classList.add('leaving');
    live.style.height = '0px';
    await wait(260);
  }
  state.pending.delete(id);
  state.tasks.set(id, updated);
  render();
}

function openCapture() {
  const dlg = $('capture');
  const text = $('capture-text');
  text.value = '';
  $('capture-add').disabled = true;
  dlg.showModal();
  text.focus(); // inside the tap handler, so iOS raises the keyboard
}

function openEdit(id) {
  const task = state.tasks.get(id);
  if (!task || state.pending.has(id)) return;
  state.editingId = id;
  const now = new Date();
  $('edit-text').value = task.title;
  $('edit-created').textContent = formatStamp(task.createdAt, now);
  $('edit-done').textContent = task.completedAt ? formatStamp(task.completedAt, now) : '';
  $('edit-done').hidden = $('edit-done-label').hidden = !task.completedAt;
  $('edit-save').disabled = false;
  $('edit').showModal();
}

async function saveEdit(id, text) {
  const task = state.tasks.get(id);
  state.editingId = null;
  if (!task) return;
  let updated;
  try {
    updated = renameTask(task, text);
  } catch {
    return; // empty title (Save is disabled for it anyway): keep the old title
  }
  if (updated === task) return;
  try {
    await db.putTask(updated);
  } catch (err) {
    console.error(err);
    showToast('Couldn’t save your edit. Try again.');
    return;
  }
  state.tasks.set(task.id, updated);
  render();
  if (cleanTitle(text).truncated) showToast('Shortened to 500 characters');
}

// ---------- Events ----------

for (const tab of document.querySelectorAll('[role="tab"]')) {
  tab.addEventListener('click', () => setView(tab.dataset.view));
}

$('list').addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  if (e.target.closest('.check')) toggleTask(row.dataset.id, row);
  else if (e.target.closest('.body')) openEdit(row.dataset.id);
});

$('add-btn').addEventListener('click', openCapture);

// Sheets: Return key submits; tapping the dimmed backdrop cancels.
function wireSheet(dialog, textarea, submitBtn, onSubmit) {
  textarea.addEventListener('input', () => {
    submitBtn.disabled = !cleanTitle(textarea.value).title;
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!submitBtn.disabled) dialog.querySelector('form').requestSubmit(submitBtn);
    }
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close('cancel');
  });
  // Read the text synchronously on submit. (The dialog's 'close' event fires later, by which
  // time a fast second tap on + may already have reopened and cleared the sheet.)
  dialog.querySelector('form').addEventListener('submit', (e) => {
    textarea.blur();
    if (e.submitter === submitBtn && !submitBtn.disabled) onSubmit(textarea.value);
  });
}
wireSheet($('capture'), $('capture-text'), $('capture-add'), addTask);
wireSheet($('edit'), $('edit-text'), $('edit-save'), (text) => saveEdit(state.editingId, text));

// "Today" / "Yesterday" go stale overnight; refresh when the app comes back or the day changes.
function refreshIfNewDay() {
  const key = localDateKey(new Date());
  if (key !== state.todayKey) {
    state.todayKey = key;
    render();
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshIfNewDay(); });
setInterval(refreshIfNewDay, 60_000);

// ---------- Offline + durability ----------

const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller; // false on the very first visit
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    const offerUpdate = (worker) =>
      showToast('Update ready', 'Reload', () => worker.postMessage('skipWaiting'), 15_000);
    if (reg.waiting && hadController) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
    // Home-screen apps are rarely fully relaunched, so also check for updates on return.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update().catch(() => {});
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) location.reload(); // the new version took over: load it
    });
  } catch (err) {
    console.warn('Service worker registration failed:', err);
  }
}

// Ask iOS not to evict our data under storage pressure. WebKit grants this by
// heuristics that favor home-screen apps, so only ask there.
async function requestPersistence() {
  if (!isStandalone() || !navigator.storage?.persist) return;
  try {
    if (!(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch (err) {
    console.warn('storage.persist failed:', err);
  }
}

// ---------- Start ----------

async function start() {
  document.title = APP.name;
  $('app-name').textContent = APP.name;
  try {
    for (const t of await db.getAllTasks()) {
      const problem = validateTask(t);
      if (problem) console.warn(`Skipping stored task ${t?.id}: ${problem}`);
      else state.tasks.set(t.id, t);
    }
  } catch (err) {
    console.error(err);
    showToast('Couldn’t open storage on this device.', null, null, 10_000);
  }
  render();
  registerServiceWorker();
  requestPersistence();
}

start();
