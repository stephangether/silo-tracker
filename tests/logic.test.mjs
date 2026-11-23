import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

const base = { name: 'Silo 1', unit: 't', capacity: 20, stock: 10, dailyUsage: 1, yellowDays: 7, redDays: 3 };

test('daysBetween über Sommerzeitwechsel', () => {
  assert.equal(L.daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(L.daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.equal(L.daysBetween('2026-01-01', '2026-01-01'), 0);
});

test('täglicher Abzug holt verpasste Tage nach und bucht einmal', () => {
  const st = L.createState();
  const s = L.newSilo(base, '2026-11-20');
  st.silos.push(s);
  assert.equal(L.applyDailyDeduction(st, '2026-11-23'), 1);
  assert.equal(s.stock, 7);
  assert.equal(s.lastDeduction, '2026-11-23');
  assert.equal(st.bookings[0].amount, -3);
  assert.equal(L.applyDailyDeduction(st, '2026-11-23'), 0);
});

test('Abzug geht nicht unter 0', () => {
  const st = L.createState();
  const s = L.newSilo({ ...base, stock: 2 }, '2026-11-01');
  st.silos.push(s);
  L.applyDailyDeduction(st, '2026-11-23');
  assert.equal(s.stock, 0);
  assert.equal(L.siloLevel(s), 'empty');
});

test('Kommazahlen ohne Float-Artefakte', () => {
  const st = L.createState();
  const s = L.newSilo({ ...base, stock: 1, dailyUsage: 0.1 }, '2026-11-20');
  st.silos.push(s);
  L.applyDailyDeduction(st, '2026-11-23');
  assert.equal(s.stock, 0.7);
});

test('Resttage, Leer-Datum und Ampel', () => {
  const s = L.newSilo(base, '2026-11-23');
  assert.equal(L.remainingDays(s), 10);
  assert.equal(L.emptyDate(s, '2026-11-23'), '2026-12-03');
  assert.equal(L.siloLevel(s), 'ok');
  s.stock = 7;
  assert.equal(L.siloLevel(s), 'yellow');
  s.stock = 3;
  assert.equal(L.siloLevel(s), 'red');
  s.dailyUsage = 0;
  assert.equal(L.remainingDays(s), Infinity);
  assert.equal(L.emptyDate(s), null);
});

test('Warnungen nur bei steigender Stufe, Reset nach Lieferung', () => {
  const st = L.createState();
  const s = L.newSilo({ ...base, stock: 6 }, '2026-11-23');
  st.silos.push(s);
  assert.deepEqual(L.collectNewAlerts(st).map((a) => a.level), ['yellow']);
  assert.equal(L.collectNewAlerts(st).length, 0);
  s.stock = 2;
  assert.deepEqual(L.collectNewAlerts(st).map((a) => a.level), ['red']);
  L.bookDelivery(st, s, 15);
  assert.equal(L.collectNewAlerts(st).length, 0);
  assert.equal(s.lastAlertLevel, 0);
  s.stock = 5;
  assert.equal(L.collectNewAlerts(st).length, 1);
});

test('deaktivierte Warnungen erzeugen keine Meldung', () => {
  const st = L.createState();
  st.silos.push(L.newSilo({ ...base, stock: 1, alertsEnabled: false }));
  assert.equal(L.collectNewAlerts(st).length, 0);
  assert.equal(L.warningCount(st), 0);
});

test('Korrektur bucht Differenz', () => {
  const st = L.createState();
  const s = L.newSilo(base);
  st.silos.push(s);
  L.bookCorrection(st, s, 8.5);
  assert.equal(s.stock, 8.5);
  assert.equal(st.bookings[0].amount, -1.5);
});

test('Validierung', () => {
  assert.equal(L.validateSilo(base), null);
  assert.match(L.validateSilo({ ...base, name: ' ' }), /Namen/);
  assert.match(L.validateSilo({ ...base, redDays: 9 }), /rote/);
  assert.match(L.validateSilo({ ...base, capacity: 0 }), /Größe/);
});

test('Sicherung Roundtrip und Fehlerfälle', () => {
  const st = L.createState();
  st.silos.push(L.newSilo(base));
  const back = L.parseBackup(L.makeBackup(st));
  assert.equal(back.silos[0].name, 'Silo 1');
  assert.throws(() => L.parseBackup('nope'), /JSON/);
  assert.throws(() => L.parseBackup('{"a":1}'), /Silo-Tracker/);
});
