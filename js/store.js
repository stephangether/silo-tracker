import { createState } from './logic.js';

const KEY = 'silo-tracker:v1';

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createState();
    const data = JSON.parse(raw);
    const fresh = createState();
    return { ...fresh, ...data, settings: { ...fresh.settings, ...data.settings } };
  } catch (err) {
    console.error('Laden fehlgeschlagen', err);
    return createState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('Speichern fehlgeschlagen', err);
    return false;
  }
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* nicht unterstützt */
  }
}
