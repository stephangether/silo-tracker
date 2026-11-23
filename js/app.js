import * as L from './logic.js';
import { loadState, saveState, requestPersistence } from './store.js';
import * as N from './notify.js';
import { isInstalled, openInstallGuide, maybeShowInstallReminder } from './install.js';

const APP_VERSION = '1.4.1';
let state = loadState();
let reordering = false; // „Anordnen“-Modus der Silo-Liste
const $app = document.getElementById('app');
const $tabs = document.getElementById('tabs');

/* ---------- Formatierung ---------- */

const nf = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 });
const fmt = (n) => nf.format(n);
const fmtDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'numeric', year: '2-digit' });
};
const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const parseNum = (v) => {
  const t = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
  return t === '' ? NaN : Number(t);
};

/** Icon aus dem SVG-Sprite in index.html (Lucide, ISC). Neue Icons: tools/build-sprite.mjs. */
const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const LEVEL_TEXT ={ ok: 'OK', yellow: 'Bald leer', red: 'Kritisch', empty: 'Leer' };
const TYPE_TEXT = { auto: 'Abzug', delivery: 'Lieferung', correction: 'Korrektur', create: 'Angelegt' };

function daysText(silo) {
  const d = L.remainingDays(silo);
  if (silo.stock <= 0) return 'leer';
  if (!isFinite(d)) return 'kein Verbrauch';
  const whole = Math.floor(d);
  if (whole < 1) return 'weniger als 1 Tag';
  return `noch ${whole} ${whole === 1 ? 'Tag' : 'Tage'}`;
}

/* ---------- Zustand & Tagesprüfung ---------- */

function persist() {
  if (!saveState(state)) toast('Speichern fehlgeschlagen – Speicher voll?', 'red');
}

async function refresh({ notify = true } = {}) {
  const deducted = L.applyDailyDeduction(state);
  const alerts = L.collectNewAlerts(state);
  persist();
  N.setBadge(L.warningCount(state));
  if (notify && alerts.length) {
    for (const { silo, level } of alerts) {
      const body = level === 'empty'
        ? `${silo.name} ist leer!`
        : `${silo.name}: ${daysText(silo)} (${fmt(silo.stock)} ${silo.unit}). Leer am ${fmtDay(L.emptyDate(silo))}.`;
      const title = level === 'yellow' ? 'Futter wird knapp' : level === 'red' ? 'Futter kritisch' : 'Silo leer';
      if (state.settings.notifications) N.showNotification(title, body, `silo-${silo.id}`);
      toast(body, level === 'yellow' ? 'yellow' : 'red');
    }
  }
  return deducted > 0 || alerts.length > 0;
}

/* ---------- Router ---------- */

function route() {
  const [, view = '', id] = location.hash.split('/');
  return { view, id };
}

function go(hash) {
  location.hash = hash;
}

function render() {
  const { view, id } = route();
  const tab = view === 'verlauf' ? 'verlauf' : view === 'einstellungen' ? 'einstellungen' : 'silos';
  $tabs.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  const silo = id ? state.silos.find((s) => s.id === id) : null;
  if (view !== '') reordering = false;

  switch (view) {
    case 'silo':
      silo ? renderDetail(silo) : go('#/');
      break;
    case 'neu':
      renderForm(null);
      break;
    case 'bearbeiten':
      silo ? renderForm(silo) : go('#/');
      break;
    case 'verlauf':
      renderHistory(id);
      break;
    case 'einstellungen':
      renderSettings();
      break;
    default:
      renderList();
  }
  window.scrollTo(0, 0);
}

/* ---------- Views ---------- */

function siloGauge(silo, big = false) {
  const pct = L.fillPercent(silo);
  const level = L.siloLevel(silo);
  return `
    <div class="gauge ${big ? 'gauge-big' : ''} lvl-${level}" role="img" aria-label="Füllstand ${Math.round(pct)} Prozent">
      <div class="gauge-fill" style="height:${pct}%"></div>
      <span class="gauge-pct">${Math.round(pct)}%</span>
    </div>`;
}

function sortBar(sortBy, count) {
  if (count < 2) return '';
  return `
    <div class="sort-bar">
      <label class="sort-select">${icon('sort', 'icon-sm')}
        <select id="sort" aria-label="Sortieren nach" ${reordering ? 'disabled' : ''}>
          ${Object.entries(L.SORT_MODES).map(([k, t]) => `<option value="${k}" ${k === sortBy ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </label>
      <button class="btn-text" type="button" id="reorder">${reordering ? '<strong>Fertig</strong>' : 'Anordnen'}</button>
    </div>`;
}

function siloCard(s, i, count) {
  const level = L.siloLevel(s);
  const ed = L.emptyDate(s);
  const body = `
    ${siloGauge(s)}
    <div class="card-body">
      <div class="card-title">${esc(s.name)} ${s.alertsEnabled ? '' : `<span title="Warnungen aus">${icon('bell-off', 'icon-sm')}</span>`}</div>
      <div class="card-stock">${fmt(s.stock)} / ${fmt(s.capacity)} ${s.unit}</div>
      <div class="card-days lvl-text-${level}">${daysText(s)}${ed && s.stock > 0 ? ` · leer ${fmtDay(ed)}` : ''}</div>
    </div>`;
  if (reordering) {
    return `
    <li>
      <div class="card">
        ${body}
        <span class="move">
          <button type="button" class="btn-move" data-move="-1" data-id="${s.id}" aria-label="${esc(s.name)} nach oben" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
          <button type="button" class="btn-move" data-move="1" data-id="${s.id}" aria-label="${esc(s.name)} nach unten" ${i === count - 1 ? 'disabled' : ''}>${icon('down')}</button>
        </span>
      </div>
    </li>`;
  }
  return `
    <li>
      <a class="card" href="#/silo/${s.id}">
        ${body}
        <span class="badge lvl-${level}">${LEVEL_TEXT[level]}</span>
      </a>
    </li>`;
}

function renderList() {
  const sortBy = L.SORT_MODES[state.settings.sortBy] ? state.settings.sortBy : 'days';
  if (sortBy !== 'manual') reordering = false;
  const silos = L.sortSilos(state.silos, sortBy);
  const warn = silos.filter((s) => s.alertsEnabled && L.siloLevel(s) !== 'ok');
  const installHint = isInstalled()
    ? ''
    : `<div class="hint">${icon('phone')}<span>Installiere Silo-Tracker auf dem Home-Bildschirm, um Mitteilungen zu bekommen.
        <button class="link-btn" type="button" id="install-guide">Anleitung anzeigen</button></span></div>`;

  $app.innerHTML = `
    <header class="bar">
      <h1>Silos</h1>
      <a class="btn-icon" href="#/neu" aria-label="Silo anlegen">${icon('add')}</a>
    </header>
    ${installHint}
    ${warn.length ? `
      <div class="alert-box">
        <strong class="alert-head">${icon('warning')}${warn.length} ${warn.length === 1 ? 'Warnung' : 'Warnungen'}</strong>
        ${warn.map((s) => `<a href="#/silo/${s.id}" class="alert-line lvl-${L.siloLevel(s)}"><span class="dot"></span>${esc(s.name)} – ${daysText(s)}</a>`).join('')}
      </div>` : ''}
    ${silos.length === 0 ? `
      <div class="empty">
        ${icon('sprout', 'icon-lg')}
        <p>Noch keine Silos angelegt.</p>
        <a class="btn primary" href="#/neu">Erstes Silo anlegen</a>
      </div>` : `
      ${sortBar(sortBy, silos.length)}
      <ul class="cards ${reordering ? 'reordering' : ''}">
        ${silos.map((s, i) => siloCard(s, i, silos.length)).join('')}
      </ul>`}
  `;

  $app.querySelector('#sort')?.addEventListener('change', (e) => {
    state.settings.sortBy = e.target.value;
    persist();
    renderList();
  });
  $app.querySelector('#reorder')?.addEventListener('click', () => {
    if (sortBy !== 'manual') {
      // Anordnen startet mit der gerade angezeigten Reihenfolge
      state.silos = silos;
      state.settings.sortBy = 'manual';
      persist();
    }
    reordering = !reordering;
    renderList();
  });
  $app.querySelectorAll('[data-move]').forEach((btn) => {
    btn.onclick = () => {
      if (!L.moveSilo(state, btn.dataset.id, Number(btn.dataset.move))) return;
      persist();
      renderList();
      // Fokus beim verschobenen Silo halten, damit man mehrmals tippen kann
      const same = $app.querySelector(`[data-id="${btn.dataset.id}"][data-move="${btn.dataset.move}"]`);
      (same && !same.disabled ? same : $app.querySelector(`[data-id="${btn.dataset.id}"]:not(:disabled)`))?.focus({ preventScroll: true });
    };
  });
}

function renderDetail(silo) {
  const level = L.siloLevel(silo);
  const ed = L.emptyDate(silo);
  const bookings = state.bookings.filter((b) => b.siloId === silo.id).slice(-10).reverse();

  $app.innerHTML = `
    <header class="bar">
      <a class="btn-back" href="#/">${icon('back')}Silos</a>
      <a class="btn-text" href="#/bearbeiten/${silo.id}">Bearbeiten</a>
    </header>
    <h1 class="detail-title">${esc(silo.name)}</h1>
    <section class="detail-top">
      ${siloGauge(silo, true)}
      <dl class="stats">
        <div><dt>Bestand</dt><dd>${fmt(silo.stock)} ${silo.unit}</dd></div>
        <div><dt>Größe</dt><dd>${fmt(silo.capacity)} ${silo.unit}</dd></div>
        <div><dt>Verbrauch/Tag</dt><dd>${fmt(silo.dailyUsage)} ${silo.unit}</dd></div>
        <div><dt>Futtertage</dt><dd class="lvl-text-${level}">${daysText(silo)}</dd></div>
        <div><dt>Leer am</dt><dd>${ed ? fmtDay(ed) : '–'}</dd></div>
        <div><dt>Status</dt><dd><span class="badge lvl-${level}">${LEVEL_TEXT[level]}</span></dd></div>
      </dl>
    </section>
    <div class="actions">
      <button class="btn primary" data-act="delivery">${icon('truck')}Lieferung</button>
      <button class="btn" data-act="correction">${icon('pencil')}Korrektur</button>
    </div>
    <section class="group">
      <label class="row switch-row">
        <span>Warnungen für dieses Silo<br><small class="muted">Gelb ≤ ${fmt(silo.yellowDays)} Tage · Rot ≤ ${fmt(silo.redDays)} Tage</small></span>
        <input type="checkbox" role="switch" id="alerts" ${silo.alertsEnabled ? 'checked' : ''}>
      </label>
    </section>
    <h2 class="section-title">Letzte Buchungen <a href="#/verlauf/${silo.id}" class="small-link">Alle</a></h2>
    ${bookingList(bookings, false)}
  `;

  $app.querySelector('[data-act=delivery]').onclick = () => openBookingDialog(silo, 'delivery');
  $app.querySelector('[data-act=correction]').onclick = () => openBookingDialog(silo, 'correction');
  $app.querySelector('#alerts').onchange = (e) => {
    silo.alertsEnabled = e.target.checked;
    L.collectNewAlerts(state); // aktuellen Stand übernehmen, ohne erneut zu melden
    persist();
    N.setBadge(L.warningCount(state));
  };
}

function bookingList(bookings, showSilo) {
  if (!bookings.length) return '<p class="muted pad">Noch keine Buchungen.</p>';
  const names = Object.fromEntries(state.silos.map((s) => [s.id, s]));
  return `<ul class="bookings">${bookings.map((b) => {
    const s = names[b.siloId];
    const unit = s?.unit ?? '';
    const sign = b.amount > 0 ? '+' : b.amount < 0 ? '−' : '±';
    return `<li class="booking type-${b.type}">
      <div>
        <div class="b-main">${TYPE_TEXT[b.type] ?? b.type}${showSilo ? ` · ${esc(s?.name ?? 'gelöschtes Silo')}` : ''}</div>
        <div class="b-sub">${fmtDateTime(b.at)}${b.note ? ` · ${esc(b.note)}` : ''}</div>
      </div>
      <div class="b-amount">
        <div class="${b.amount >= 0 ? 'pos' : 'neg'}">${sign}${fmt(Math.abs(b.amount))} ${unit}</div>
        <div class="b-sub">→ ${fmt(b.stockAfter)} ${unit}</div>
      </div>
    </li>`;
  }).join('')}</ul>`;
}

function renderForm(silo) {
  const isNew = !silo;
  const v = silo ?? { name: '', unit: 't', capacity: '', stock: '', dailyUsage: '', yellowDays: 7, redDays: 3, alertsEnabled: true };
  const num = (n) => (n === '' ? '' : String(n).replace('.', ','));

  $app.innerHTML = `
    <header class="bar">
      <a class="btn-back" href="${isNew ? '#/' : `#/silo/${silo.id}`}">Abbrechen</a>
      <h1 class="bar-title">${isNew ? 'Neues Silo' : 'Silo bearbeiten'}</h1>
      <span></span>
    </header>
    <form id="silo-form" class="form" novalidate>
      <section class="group">
        <label class="row"><span>Name</span><input name="name" value="${esc(v.name)}" placeholder="z. B. Silo Stall 1" autocomplete="off" required></label>
        <div class="row"><span>Einheit</span>
          <div class="seg">${L.UNITS.map((u) => `<label><input type="radio" name="unit" value="${u}" ${v.unit === u ? 'checked' : ''}><span>${u}</span></label>`).join('')}</div>
        </div>
      </section>
      <section class="group">
        <label class="row"><span>Größe</span><input name="capacity" inputmode="decimal" value="${num(v.capacity)}" placeholder="0"><em class="u"></em></label>
        <label class="row"><span>${isNew ? 'Aktueller Bestand' : 'Bestand'}</span><input name="stock" inputmode="decimal" value="${num(v.stock)}" placeholder="0" ${isNew ? '' : 'disabled'}><em class="u"></em></label>
        <label class="row"><span>Verbrauch / Tag</span><input name="dailyUsage" inputmode="decimal" value="${num(v.dailyUsage)}" placeholder="0"><em class="u"></em></label>
      </section>
      ${isNew ? '' : '<p class="muted note">Bestand bitte über „Korrektur“ oder „Lieferung“ ändern, damit es im Verlauf steht.</p>'}
      <section class="group">
        <label class="row"><span><span class="dot lvl-yellow"></span> Gelb ab</span><input name="yellowDays" inputmode="decimal" value="${num(v.yellowDays)}"><em>Tagen</em></label>
        <label class="row"><span><span class="dot lvl-red"></span> Rot ab</span><input name="redDays" inputmode="decimal" value="${num(v.redDays)}"><em>Tagen</em></label>
        <label class="row switch-row"><span>Warnungen aktiv</span><input type="checkbox" role="switch" name="alertsEnabled" ${v.alertsEnabled ? 'checked' : ''}></label>
      </section>
      <p class="error" id="form-error" role="alert"></p>
      <button class="btn primary block" type="submit">${isNew ? 'Silo anlegen' : 'Speichern'}</button>
      ${isNew ? '' : `<button class="btn danger block" type="button" id="delete">${icon('trash')}Silo löschen</button>`}
    </form>
  `;

  const form = $app.querySelector('#silo-form');
  const syncUnit = () => {
    const u = form.unit.value;
    form.querySelectorAll('em.u').forEach((e) => (e.textContent = u));
  };
  form.querySelectorAll('input[name=unit]').forEach((r) => (r.onchange = syncUnit));
  syncUnit();

  form.onsubmit = (e) => {
    e.preventDefault();
    const input = {
      name: form.name.value,
      unit: form.unit.value,
      capacity: parseNum(form.capacity.value),
      stock: isNew ? parseNum(form.stock.value) : silo.stock,
      dailyUsage: parseNum(form.dailyUsage.value),
      yellowDays: parseNum(form.yellowDays.value),
      redDays: parseNum(form.redDays.value),
      alertsEnabled: form.alertsEnabled.checked,
    };
    const err = L.validateSilo(input);
    if (err) {
      form.querySelector('#form-error').textContent = err;
      return;
    }
    if (isNew) {
      L.applyDailyDeduction(state); // bestehende Silos auf heute bringen
      const s = L.newSilo(input);
      state.silos.push(s);
      L.addBooking(state, { siloId: s.id, type: 'create', amount: s.stock, stockAfter: s.stock, note: 'Anfangsbestand' });
      refresh();
      go(`#/silo/${s.id}`);
    } else {
      Object.assign(silo, { ...input, name: input.name.trim() });
      refresh();
      go(`#/silo/${silo.id}`);
    }
    toast('Gespeichert');
  };

  form.querySelector('#delete')?.addEventListener('click', () => {
    if (!confirm(`„${silo.name}“ wirklich löschen? Die Buchungen bleiben im Verlauf.`)) return;
    state.silos = state.silos.filter((s) => s.id !== silo.id);
    persist();
    N.setBadge(L.warningCount(state));
    go('#/');
    toast('Silo gelöscht');
  });
}

function renderHistory(filterId) {
  const list = state.bookings.filter((b) => !filterId || b.siloId === filterId).slice(-300).reverse();
  $app.innerHTML = `
    <header class="bar"><h1>Verlauf</h1></header>
    <div class="pad-x">
      <select id="filter" class="select" aria-label="Silo filtern">
        <option value="">Alle Silos</option>
        ${state.silos.map((s) => `<option value="${s.id}" ${s.id === filterId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
    </div>
    ${bookingList(list, !filterId)}
  `;
  $app.querySelector('#filter').onchange = (e) => go(e.target.value ? `#/verlauf/${e.target.value}` : '#/verlauf');
}

function renderSettings() {
  const perm = N.permission();
  const standalone = N.isStandalone();
  const lb = state.settings.lastBackup;
  const backupAge = lb ? L.daysBetween(L.dayKey(new Date(lb)), L.dayKey()) : null;

  let notifState;
  if (perm === 'unsupported') {
    notifState = N.isIOS() && !standalone
      ? 'Zuerst die App auf dem Home-Bildschirm installieren (siehe oben) und von dort öffnen.'
      : 'Dieser Browser unterstützt keine Benachrichtigungen.';
  } else if (perm === 'denied') {
    notifState = 'Blockiert. In den iPhone-Einstellungen → Mitteilungen → Silo-Tracker erlauben.';
  } else {
    notifState = 'Gemeldet wird, sobald ein Silo die gelbe oder rote Schwelle erreicht. Geprüft wird beim Öffnen der App.';
  }

  $app.innerHTML = `
    <header class="bar"><h1>Einstellungen</h1></header>
    <h2 class="section-title">App</h2>
    <section class="group">
      ${standalone
        ? `<div class="row"><span>${icon('check')}Auf dem Home-Bildschirm installiert</span></div>`
        : `<button class="row link-row" id="install-guide">${icon('phone')}App installieren – Anleitung</button>`}
    </section>
    <h2 class="section-title">Benachrichtigungen</h2>
    <section class="group">
      <label class="row switch-row">
        <span>Mitteilungen</span>
        <input type="checkbox" role="switch" id="notif" ${state.settings.notifications && perm === 'granted' ? 'checked' : ''} ${perm === 'unsupported' || perm === 'denied' ? 'disabled' : ''}>
      </label>
      <button class="row link-row" id="test-notif" ${perm === 'granted' ? '' : 'disabled'}>Test-Mitteilung senden</button>
    </section>
    <p class="muted note">${notifState}</p>

    <h2 class="section-title">Datensicherung</h2>
    <section class="group">
      <button class="row link-row" id="export">${icon('export')}Sicherung exportieren</button>
      <label class="row link-row">${icon('import')}Sicherung wiederherstellen<input type="file" id="import" accept="application/json,.json" hidden></label>
    </section>
    <p class="muted note ${backupAge === null || backupAge > 30 ? 'warn-text' : ''}">
      ${lb ? `Letzte Sicherung: ${fmtDateTime(lb)}${backupAge > 30 ? ' – bitte neu sichern.' : ''}` : 'Noch keine Sicherung erstellt. Die Daten liegen nur auf diesem Gerät.'}
    </p>

    <h2 class="section-title">Daten</h2>
    <section class="group">
      <div class="row"><span>Silos</span><span class="muted">${state.silos.length}</span></div>
      <div class="row"><span>Buchungen</span><span class="muted">${state.bookings.length}</span></div>
      <button class="row link-row danger-text" id="reset">${icon('trash')}Alle Daten löschen</button>
    </section>
    <p class="muted note center">Silo-Tracker ${APP_VERSION}</p>
  `;

  $app.querySelector('#notif')?.addEventListener('change', async (e) => {
    if (e.target.checked) {
      const p = await N.requestPermission();
      state.settings.notifications = p === 'granted';
      if (p === 'granted') {
        // aktuelle Warnungen sofort als Mitteilung zeigen
        state.silos.forEach((s) => (s.lastAlertLevel = 0));
        await refresh();
      }
    } else {
      state.settings.notifications = false;
    }
    persist();
    renderSettings();
  });

  $app.querySelector('#test-notif').onclick = async () => {
    const ok = await N.showNotification('Silo-Tracker', 'Mitteilungen funktionieren.', 'test');
    if (!ok) toast('Mitteilung konnte nicht angezeigt werden', 'red');
  };

  $app.querySelector('#export').onclick = exportBackup;
  $app.querySelector('#import').onchange = importBackup;
  $app.querySelector('#reset').onclick = () => {
    if (!confirm('Wirklich ALLE Silos und Buchungen löschen? Das kann nicht rückgängig gemacht werden.')) return;
    if (!confirm('Ganz sicher? Am besten vorher eine Sicherung exportieren.')) return;
    const settings = state.settings;
    state = { ...L.createState(), settings };
    persist();
    N.setBadge(0);
    go('#/');
  };
}

/* ---------- Dialoge ---------- */

function openBookingDialog(silo, type) {
  const dlg = document.getElementById('dialog');
  const isDelivery = type === 'delivery';
  dlg.innerHTML = `
    <form method="dialog" class="sheet" novalidate>
      <h2>${isDelivery ? 'Lieferung buchen' : 'Bestand korrigieren'}</h2>
      <p class="muted">${esc(silo.name)} · aktuell ${fmt(silo.stock)} ${silo.unit}</p>
      <label class="field">
        <span>${isDelivery ? 'Gelieferte Menge' : 'Tatsächlicher Bestand'} (${silo.unit})</span>
        <input name="amount" inputmode="decimal" autocomplete="off" required>
      </label>
      <label class="field"><span>Notiz (optional)</span><input name="note" autocomplete="off" placeholder="${isDelivery ? 'z. B. Lieferschein-Nr.' : 'z. B. Sichtprüfung'}"></label>
      <p class="muted" id="preview"></p>
      <p class="error" id="dlg-error" role="alert"></p>
      <div class="actions">
        <button class="btn" value="cancel" type="button" id="cancel">Abbrechen</button>
        <button class="btn primary" value="ok" type="submit">Buchen</button>
      </div>
    </form>`;
  const form = dlg.querySelector('form');
  const preview = () => {
    const n = parseNum(form.amount.value);
    const after = isDelivery ? silo.stock + n : n;
    form.querySelector('#preview').innerHTML = isFinite(after)
      ? `Neuer Bestand: ${fmt(L.round(after))} ${silo.unit}${after > silo.capacity ? ` <span class="warn-inline">${icon('warning', 'icon-sm')} über Silogröße</span>` : ''}`
      : '';
  };
  form.amount.oninput = preview;
  form.querySelector('#cancel').onclick = () => dlg.close();
  form.onsubmit = (e) => {
    e.preventDefault();
    const n = parseNum(form.amount.value);
    if (!isFinite(n) || n < 0 || (isDelivery && n === 0)) {
      form.querySelector('#dlg-error').textContent = 'Bitte eine gültige Menge eingeben.';
      return;
    }
    L.applyDailyDeduction(state);
    const note = form.note.value.trim();
    if (isDelivery) L.bookDelivery(state, silo, n, note);
    else L.bookCorrection(state, silo, n, note);
    refresh();
    dlg.close();
    render();
    toast(isDelivery ? 'Lieferung gebucht' : 'Bestand korrigiert');
  };
  dlg.showModal();
  setTimeout(() => form.amount.focus(), 50);
}

let toastTimer;
function toast(msg, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 3500);
}

/* ---------- Sicherung ---------- */

async function exportBackup() {
  const json = L.makeBackup(state);
  const name = `silo-tracker-${L.dayKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Silo-Tracker Sicherung' });
    } else {
      const url = URL.createObjectURL(file);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    state.settings.lastBackup = new Date().toISOString();
    persist();
    renderSettings();
    toast('Sicherung erstellt');
  } catch (err) {
    if (err.name !== 'AbortError') toast('Export fehlgeschlagen', 'red');
  }
}

async function importBackup(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const imported = L.parseBackup(await file.text());
    if (!confirm(`Sicherung mit ${imported.silos.length} Silos laden? Die aktuellen Daten werden ersetzt.`)) return;
    imported.settings.notifications = state.settings.notifications;
    state = imported;
    await refresh({ notify: false });
    go('#/');
    render();
    toast('Sicherung wiederhergestellt');
  } catch (err) {
    alert(err.message);
  }
}

/* ---------- Start ---------- */

window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && (await refresh())) render();
});
// Tageswechsel erkennen, solange die App offen ist
setInterval(async () => {
  if (document.visibilityState === 'visible' && (await refresh())) render();
}, 60_000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW-Registrierung fehlgeschlagen', err));
}
// Anleitung-Buttons (Liste + Einstellungen) per Delegation, da Views neu gerendert werden.
$app.addEventListener('click', (e) => {
  if (e.target.closest('#install-guide')) openInstallGuide();
});

requestPersistence();
refresh().then(() => {
  render();
  setTimeout(maybeShowInstallReminder, 800);
});
