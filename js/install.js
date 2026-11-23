// Installationsanleitung + Erinnerung, solange die App nicht vom Home-Bildschirm läuft.
import { isIOS, isStandalone } from './notify.js';

const KEY = 'silo-tracker:install-reminder';
const REMIND_AFTER_DAYS = 3;

const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// Android/Chrome/Edge: nativen Installationsdialog merken, um ihn per Button zu öffnen.
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
});

export const isInstalled = () => isStandalone();

function snoozedRecently() {
  try {
    const t = Number(localStorage.getItem(KEY));
    return t > 0 && Date.now() - t < REMIND_AFTER_DAYS * 86400000;
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

/** Zeigt die Anleitung automatisch, wenn nicht installiert und nicht kürzlich weggeklickt. */
export function maybeShowInstallReminder() {
  if (isInstalled() || snoozedRecently()) return;
  if (document.getElementById('dialog').open) return;
  openInstallGuide({ reminder: true });
}

function iosSteps() {
  return `
    <ol class="steps">
      <li>
        <span class="step-icon">${icon('share')}</span>
        <span>Tippe auf <b>Teilen</b>. In Safari ist das unten in der Leiste, in Chrome oben in der Adresszeile.
        Siehst du es nicht, tippe zuerst auf ${icon('more', 'icon-sm')} <b>Mehr</b>.</span>
      </li>
      <li>
        <span class="step-icon">${icon('home-add')}</span>
        <span>Wähle <b>Zum Home-Bildschirm</b>. Eventuell musst du dafür in der Liste nach unten scrollen.</span>
      </li>
      <li>
        <span class="step-icon">${icon('check')}</span>
        <span>Lass <b>Als Web-App öffnen</b> eingeschaltet und tippe auf <b>Hinzufügen</b>.</span>
      </li>
      <li>
        <span class="step-icon">${icon('phone')}</span>
        <span>Öffne Silo-Tracker ab jetzt nur noch über das neue Symbol auf dem Home-Bildschirm.</span>
      </li>
    </ol>
    <p class="note-box">
      <b>Wichtig:</b> Safari und die installierte App speichern ihre Daten getrennt.
      Hast du hier schon Silos angelegt, übertrage sie mit <i>Einstellungen → Sicherung exportieren</i>
      und in der installierten App mit <i>Sicherung wiederherstellen</i>.
    </p>`;
}

function otherSteps() {
  if (deferredPrompt) {
    return `<p>Dein Browser kann Silo-Tracker direkt als App installieren.</p>
      <button class="btn primary block" type="button" id="do-install">${icon('home-add')}Jetzt installieren</button>`;
  }
  return `
    <ol class="steps">
      <li>
        <span class="step-icon">${icon('more')}</span>
        <span>Öffne das Menü deines Browsers.</span>
      </li>
      <li>
        <span class="step-icon">${icon('home-add')}</span>
        <span>Wähle <b>App installieren</b> oder <b>Zum Startbildschirm hinzufügen</b>.</span>
      </li>
      <li>
        <span class="step-icon">${icon('phone')}</span>
        <span>Öffne Silo-Tracker ab jetzt über das neue App-Symbol.</span>
      </li>
    </ol>`;
}

export function openInstallGuide({ reminder = false } = {}) {
  const dlg = document.getElementById('dialog');
  dlg.innerHTML = `
    <div class="sheet" tabindex="-1" autofocus>
      <div class="sheet-head">
        <h2>App installieren</h2>
        <button class="btn-close" type="button" id="install-close" aria-label="Schließen">${icon('close')}</button>
      </div>
      <p class="muted">Installiert läuft Silo-Tracker wie eine normale App: im Vollbild, offline,
        mit <b>Mitteilungen</b> bei Warnungen und der Anzahl der Warnungen am App-Symbol.</p>
      ${isIOS() ? iosSteps() : otherSteps()}
      <button class="btn block" type="button" id="install-later">${reminder ? 'Später erinnern' : 'Schließen'}</button>
    </div>`;

  const close = () => {
    snooze();
    dlg.close();
  };
  dlg.querySelector('#install-close').onclick = close;
  dlg.querySelector('#install-later').onclick = close;
  dlg.querySelector('#do-install')?.addEventListener('click', async () => {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    close();
  });
  // Auch Schließen per Escape/Wischgeste pausiert die Erinnerung für ein paar Tage.
  dlg.addEventListener('cancel', snooze, { once: true });
  dlg.showModal();
}
