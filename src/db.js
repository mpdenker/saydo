// Tiny promise wrapper around IndexedDB. One database, one object store, keyed by task id.
// Writes resolve only when the transaction commits, so "saved" means saved.

import { APP } from './config.js';

const STORE = 'tasks';
let dbPromise = null;

export function openDB(name = APP.dbName) {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('completedAt', 'completedAt'); // null values aren't indexed: only completed tasks
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // If a newer version of the app opens the DB in another tab, step aside.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => reject(new Error('Database upgrade blocked by another open copy of the app'));
  });
  return dbPromise;
}

async function run(mode, work) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    const req = work(store);
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export const getAllTasks = () => run('readonly', (s) => s.getAll());
export const putTask = (task) => run('readwrite', (s) => { s.put(task); });
export const deleteTask = (id) => run('readwrite', (s) => { s.delete(id); });
/** Several writes in one transaction: all or nothing. */
export const putTasks = (tasks) => run('readwrite', (s) => { for (const t of tasks) s.put(t); });
