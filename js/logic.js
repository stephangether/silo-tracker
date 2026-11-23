// Reine Geschäftslogik – keine DOM- oder Storage-Zugriffe, damit testbar.

export const LEVELS = { ok: 0, yellow: 1, red: 2, empty: 3 };
export const UNITS = ['kg', 't', 'm³'];

/** Lokales Datum als 'YYYY-MM-DD'. */
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Ganze Kalendertage zwischen zwei dayKeys (b - a), unabhängig von Sommerzeit. */
export function daysBetween(a, b) {
  const toUtc = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Rundet auf 3 Nachkommastellen, um Float-Artefakte zu vermeiden. */
export function round(n) {
  return Math.round(n * 1000) / 1000;
}

export function createState() {
  return { version: 1, silos: [], bookings: [], settings: { notifications: false, lastBackup: null, sortBy: 'days' } };
}

export function newSilo(input, today = dayKey()) {
  return {
    id: uid(),
    name: input.name.trim(),
    unit: input.unit,
    capacity: input.capacity,
    stock: input.stock,
    dailyUsage: input.dailyUsage,
    yellowDays: input.yellowDays,
    redDays: input.redDays,
    alertsEnabled: input.alertsEnabled !== false,
    lastDeduction: today,
    lastAlertLevel: 0,
    createdAt: new Date().toISOString(),
  };
}

/** Validiert Formulareingaben; gibt Fehlermeldung oder null zurück. */
export function validateSilo(s) {
  if (!s.name || !s.name.trim()) return 'Bitte einen Namen eingeben.';
  if (!UNITS.includes(s.unit)) return 'Ungültige Einheit.';
  if (!(s.capacity > 0)) return 'Die Größe muss größer als 0 sein.';
  if (!(s.stock >= 0)) return 'Der Bestand darf nicht negativ sein.';
  if (!(s.dailyUsage >= 0)) return 'Der Verbrauch darf nicht negativ sein.';
  if (!(s.yellowDays >= 0) || !(s.redDays >= 0)) return 'Warnschwellen dürfen nicht negativ sein.';
  if (s.redDays > s.yellowDays) return 'Die rote Schwelle muss kleiner oder gleich der gelben sein.';
  return null;
}

/** Verbleibende Futtertage (Kommazahl) oder Infinity bei Verbrauch 0. */
export function remainingDays(silo) {
  if (silo.stock <= 0) return 0;
  if (!(silo.dailyUsage > 0)) return Infinity;
  return silo.stock / silo.dailyUsage;
}

/**
 * Datum, an dem das Silo leer ist. Abgezogen wird bei jedem Tageswechsel,
 * leer ist es also nach ceil(Resttage) Abzügen.
 */
export function emptyDate(silo, today = dayKey()) {
  const days = remainingDays(silo);
  if (!isFinite(days)) return null;
  return addDays(today, Math.ceil(days));
}

export function siloLevel(silo) {
  if (silo.stock <= 0) return 'empty';
  const days = remainingDays(silo);
  if (days <= silo.redDays) return 'red';
  if (days <= silo.yellowDays) return 'yellow';
  return 'ok';
}

export function fillPercent(silo) {
  if (!(silo.capacity > 0)) return 0;
  return Math.max(0, Math.min(100, (silo.stock / silo.capacity) * 100));
}

/** Sortierungen der Silo-Liste. 'manual' = Reihenfolge von state.silos. */
export const SORT_MODES = { days: 'Futtertage', fill: 'Füllstand', name: 'Name', manual: 'Eigene Reihenfolge' };

const byName = (a, b) => a.name.localeCompare(b.name, 'de', { numeric: true, sensitivity: 'base' });

/** Gibt eine sortierte Kopie zurück; Gleichstand wird nach Name aufgelöst. */
export function sortSilos(silos, mode = 'days') {
  const list = [...silos];
  if (mode === 'manual') return list;
  if (mode === 'name') return list.sort(byName);
  const key = mode === 'fill' ? fillPercent : remainingDays;
  return list.sort((a, b) => {
    const ka = key(a), kb = key(b);
    return ka === kb ? byName(a, b) : ka - kb; // Infinity - Infinity wäre NaN
  });
}

/** Verschiebt ein Silo in der eigenen Reihenfolge um delta Plätze. Gibt true zurück, wenn sich etwas geändert hat. */
export function moveSilo(state, id, delta) {
  const i = state.silos.findIndex((s) => s.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= state.silos.length) return false;
  const [s] = state.silos.splice(i, 1);
  state.silos.splice(j, 0, s);
  return true;
}

/** Fügt eine Buchung hinzu und hält den Verlauf in vernünftiger Größe. */
export function addBooking(state, booking) {
  state.bookings.push({ id: uid(), at: new Date().toISOString(), ...booking });
  const MAX = 5000;
  if (state.bookings.length > MAX) state.bookings.splice(0, state.bookings.length - MAX);
}

/**
 * Automatischer Tagesabzug: holt alle seit lastDeduction vergangenen Tage nach.
 * Gibt die Anzahl der erzeugten Buchungen zurück.
 */
export function applyDailyDeduction(state, today = dayKey()) {
  let count = 0;
  for (const silo of state.silos) {
    const days = daysBetween(silo.lastDeduction, today);
    if (days <= 0) continue;
    silo.lastDeduction = today;
    if (!(silo.dailyUsage > 0) || silo.stock <= 0) continue;
    const amount = round(Math.min(silo.stock, days * silo.dailyUsage));
    silo.stock = round(silo.stock - amount);
    addBooking(state, {
      siloId: silo.id,
      type: 'auto',
      amount: -amount,
      stockAfter: silo.stock,
      note: days === 1 ? 'Täglicher Abzug' : `Täglicher Abzug (${days} Tage)`,
    });
    count++;
  }
  return count;
}

export function bookDelivery(state, silo, amount, note = '') {
  silo.stock = round(silo.stock + amount);
  addBooking(state, { siloId: silo.id, type: 'delivery', amount, stockAfter: silo.stock, note });
}

export function bookCorrection(state, silo, newStock, note = '') {
  const diff = round(newStock - silo.stock);
  silo.stock = round(newStock);
  addBooking(state, { siloId: silo.id, type: 'correction', amount: diff, stockAfter: silo.stock, note });
}

/**
 * Ermittelt Silos, deren Warnstufe seit der letzten Meldung gestiegen ist,
 * und aktualisiert lastAlertLevel. Sinkt die Stufe (z. B. nach Lieferung),
 * wird sie zurückgesetzt, damit später wieder gewarnt wird.
 */
export function collectNewAlerts(state) {
  const alerts = [];
  for (const silo of state.silos) {
    const level = siloLevel(silo);
    const value = LEVELS[level];
    if (!silo.alertsEnabled) {
      silo.lastAlertLevel = value;
      continue;
    }
    if (value > (silo.lastAlertLevel ?? 0)) alerts.push({ silo, level });
    silo.lastAlertLevel = value;
  }
  return alerts;
}

/** Anzahl Silos mit Warnung (für App-Badge). */
export function warningCount(state) {
  return state.silos.filter((s) => s.alertsEnabled && siloLevel(s) !== 'ok').length;
}

/** Prüft und normalisiert importierte Sicherungsdaten. */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine gültige Sicherung (kein JSON).');
  }
  if (!data || data.app !== 'silo-tracker' || !data.state || !Array.isArray(data.state.silos)) {
    throw new Error('Die Datei ist keine Silo-Tracker-Sicherung.');
  }
  const state = { ...createState(), ...data.state };
  state.settings = { ...createState().settings, ...data.state.settings };
  if (!Array.isArray(state.bookings)) state.bookings = [];
  for (const s of state.silos) {
    if (validateSilo(s)) throw new Error(`Silo „${s.name ?? '?'}“ ist ungültig: ${validateSilo(s)}`);
  }
  return state;
}

export function makeBackup(state) {
  return JSON.stringify({ app: 'silo-tracker', exportedAt: new Date().toISOString(), state }, null, 2);
}
