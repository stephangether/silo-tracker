# Silo-Tracker

Eine Progressive Web App (PWA) für die Landwirtschaft. Sie führt den Futterbestand in Silos, zieht den Tagesverbrauch automatisch ab und warnt rechtzeitig, bevor ein Silo leer wird. Die App ist für das iPhone optimiert und läuft komplett offline. Es gibt keinen Server und kein Konto: Alle Daten bleiben auf dem Gerät.

## Funktionen

- **Silos anlegen:** Name, Einheit (kg, t oder m³ pro Silo), Größe, aktueller Bestand und Verbrauch pro Tag.
- **Automatischer täglicher Futterabzug:** Beim Öffnen der App werden alle seit dem letzten Abzug vergangenen Tage nachgeholt. Der Bestand fällt dabei nie unter 0.
- **Lieferungen und Korrekturen buchen:**
  - Eine Lieferung erhöht den Bestand.
  - Eine Korrektur setzt den tatsächlichen Bestand, z. B. nach einer Sichtprüfung.
- **Gelbe und rote Warnschwelle pro Silo,** jeweils in verbleibenden Futtertagen.
- **Warnungen pro Silo ein- und ausschaltbar.**
- **Berechnung der verbleibenden Futtertage** und des Datums, an dem das Silo leer ist.
- **Buchungsverlauf,** gesamt oder gefiltert nach Silo.
- **Datensicherung:** Export und Import als JSON-Datei, auf dem iPhone über das Teilen-Menü, z. B. „In Dateien sichern“.
- **Benachrichtigungen:** System-Mitteilung, sobald ein Silo eine höhere Warnstufe erreicht (OK → Gelb → Rot → Leer). Dazu zeigt das Home-Bildschirm-Icon eine Zahl mit der Anzahl der Silos in Warnung.
- **Installationsanleitung mit Erinnerung:** Solange die App im Browser statt vom Home-Bildschirm läuft, zeigt sie beim Öffnen eine Schritt-für-Schritt-Anleitung. „Später erinnern“ pausiert sie für 3 Tage. Die Anleitung ist außerdem jederzeit über die Silo-Liste und *Einstellungen → App* erreichbar. Unter Android und Chrome gibt es stattdessen einen direkten „Installieren“-Button.
- **Für das iPhone optimiert:** Home-Bildschirm-Installation, Safe-Area, Dark Mode, große Touch-Flächen, offline nutzbar.

## Wichtig: Wie Warnungen funktionieren

Die App hat bewusst **kein Backend**. iOS führt bei geschlossenen PWAs keinen Code im Hintergrund aus. Daraus folgt:

- Abzug und Warnprüfung laufen **beim Öffnen der App** bzw. wenn sie wieder in den Vordergrund kommt. Ist die App offen, wird zusätzlich jede Minute geprüft, damit der Tageswechsel erkannt wird.
- Eine Warnung erscheint als System-Mitteilung und als Hinweis in der App. Jede Warnstufe wird pro Silo **nur einmal** gemeldet. Sinkt die Stufe nach einer Lieferung, wird beim nächsten Erreichen der Schwelle wieder gewarnt.
- Die Badge-Zahl am App-Icon bleibt auch bei geschlossener App sichtbar. Sie zeigt aber nur den Stand der letzten Öffnung.

Für echte Push-Nachrichten bei geschlossener App braucht es einen Server, der täglich rechnet und Web-Push verschickt (siehe [Ausbau](#ausbau-echte-push-nachrichten)).

## Auf dem iPhone installieren

1. Die App-URL in **Safari** öffnen. HTTPS ist Pflicht.
2. Auf **Teilen** tippen und **Zum Home-Bildschirm** wählen.
3. Die App **vom Home-Bildschirm** aus starten.
4. Unter **Einstellungen → Mitteilungen** den Schalter aktivieren und die Abfrage erlauben.

Diese Schritte zeigt die App auch selbst an, mit Erinnerung.

> **Achtung:** Safari und die installierte App haben auf dem iPhone **getrennte Speicher**. Silos, die im Browser angelegt wurden, fehlen in der installierten App. Sie lassen sich über *Sicherung exportieren* und *Sicherung wiederherstellen* übertragen. Am einfachsten installierst du die App zuerst und legst die Silos erst dann an.

Voraussetzung für Mitteilungen ist iOS 16.4 oder neuer. Innerhalb von Safari, also ohne Installation, erlaubt iOS keine Mitteilungen.

> **Tipp:** Regelmäßig unter *Einstellungen → Sicherung exportieren* sichern. Wird die App vom Home-Bildschirm gelöscht, löscht iOS auch ihre Daten. Die App erinnert daran, wenn die letzte Sicherung älter als 30 Tage ist.

## Entwicklung

Es gibt keine Abhängigkeiten und keinen Build-Schritt. Benötigt wird nur Node.js für den lokalen Server und die Tests.

```bash
npm start        # lokaler Server auf http://localhost:8080 (PORT=… zum Ändern)
npm test         # Tests der Geschäftslogik (node --test)
npm run icons    # App-Icon (Home-Bildschirm) neu erzeugen
npm run sprite   # UI-Icon-Sprite aus Lucide neu bauen
```

Der Service Worker läuft unter `localhost` auch ohne HTTPS. Auf dem iPhone im lokalen Netz geht das **nicht**, dafür muss die App per HTTPS erreichbar sein, z. B. über GitHub Pages oder einen Tunnel wie `cloudflared tunnel --url http://localhost:8080`.

### Projektstruktur

```
index.html              App-Gerüst, Tab-Leiste, iOS-Meta-Tags
manifest.webmanifest    PWA-Manifest
sw.js                   Service Worker (Offline-Cache, Klick auf Mitteilung)
css/app.css             Styles (Hell/Dunkel, iOS-Look)
js/logic.js             Reine Geschäftslogik: Abzug, Resttage, Warnstufen, Sicherung
js/store.js             Speichern/Laden (localStorage + persistenter Speicher)
js/notify.js            Mitteilungen und App-Badge
js/install.js           Installationsanleitung + Erinnerung
js/app.js               Oberfläche, Routing (#/…), Dialoge
tests/logic.test.mjs    Tests für logic.js
tools/serve.mjs         Lokaler Entwicklungsserver
tools/make-icons.mjs    Icon-Generator (SVG + PNG)
```

### Icons

Die UI-Icons stammen von [Lucide](https://lucide.dev) und stehen unter der **ISC-Lizenz**: frei nutzbar, auch kommerziell. Bedingung ist nur, dass der Lizenztext beiliegt, er steht in `icons/LUCIDE-LICENSE.txt`.

Die Icons liegen als SVG-Sprite direkt in `index.html` und funktionieren damit auch offline. Sie übernehmen die Textfarbe (`currentColor`). In `js/app.js` werden sie über `icon('name')` eingebunden.

Ein neues Icon fügst du so hinzu:
1. Den Namen auf [lucide.dev/icons](https://lucide.dev/icons) suchen.
2. In `tools/build-sprite.mjs` unter `ICONS` eintragen.
3. `npm run sprite` ausführen. Dafür braucht es Internet, das Skript lädt von unpkg.com.

### iOS 26: Unschärfe am oberen Rand

iOS 26 legt bei Web-Apps auf dem Home-Bildschirm eine Unschärfe über den oberen Rand. Vermieden wird sie mit zwei Maßnahmen:

1. Statusleisten-Stil `default` statt `black-translucent` in `index.html`. Damit beginnt die Seite unterhalb einer deckenden Statusleiste.
2. Am oberen Rand liegt eine **mitlaufende (sticky), vollbreite, einfarbige Kopfzeile** (`.bar`). WebKit übernimmt deren Farbe, statt den Inhalt zu verwischen.

Die Kopfzeile darf deshalb keinen transparenten Hintergrund und kein `backdrop-filter` bekommen. iOS liest Statusleisten-Stil und Manifest beim Installieren. Nach Änderungen daran muss man die App vom Home-Bildschirm löschen und neu hinzufügen.

### Rechenregeln

- **Resttage** = Bestand ÷ Verbrauch pro Tag. Bei Verbrauch 0 gilt der Bestand als unbegrenzt.
- **Leer am** = heute + aufgerundete Resttage.
- **Status:**
  - *Leer*, wenn der Bestand ≤ 0 ist
  - sonst *Rot*, wenn die Resttage ≤ der roten Schwelle sind
  - sonst *Gelb*, wenn die Resttage ≤ der gelben Schwelle sind
  - sonst *OK*
- **Der Abzug** passiert bei jedem Kalendertag-Wechsel. Am Tag des Anlegens wird nichts abgezogen.

### Updates veröffentlichen

Der Service Worker lädt immer zuerst die aktuelle Version aus dem Netz und nimmt den Cache nur offline. Ein neues Deployment kommt deshalb beim nächsten Öffnen der App an. `VERSION` in `sw.js` trotzdem erhöhen, damit alte Caches aufgeräumt werden. Die Versionsanzeige steht in `APP_VERSION` in `js/app.js`.

## Deployment (GitHub Pages)

**Live:** https://stephangether.github.io/silo-tracker/

Jeder Push auf `main` startet den Workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml):

1. Die Tests laufen (`npm test`).
2. Nur die Dateien, die die App zur Laufzeit braucht, werden zusammengestellt: `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/` und `icons/`.
3. Diese Dateien werden auf GitHub Pages veröffentlicht.

Bei Pull Requests laufen nur die Tests. Wer eine neue Datei unter einem anderen Pfad anlegt, muss sie im Schritt „Seite zusammenstellen“ ergänzen. Neue Dateien sollten außerdem in `ASSETS` in `sw.js` stehen, damit sie offline verfügbar sind.

Einmalige Einrichtung (bereits erledigt): *Settings → Pages → Source:* **GitHub Actions**.

Alle Pfade sind relativ. Die App läuft deshalb auch im Unterordner `/silo-tracker/` und auf jedem anderen statischen HTTPS-Hosting.

## Ausbau: echte Push-Nachrichten

Falls später Push bei geschlossener App gewünscht ist:

1. Ein kleines Backend aufsetzen, z. B. einen Cloudflare Worker mit Cron-Trigger. Es speichert die Silodaten und die Push-Subscription.
2. In der App `PushManager.subscribe()` mit einem VAPID-Schlüssel aufrufen und die Subscription an das Backend senden.
3. Das Backend führt täglich die Logik aus `js/logic.js` aus (`applyDailyDeduction` und `collectNewAlerts`) und verschickt Web-Push.
4. In `sw.js` einen `push`-Event-Handler ergänzen, der `showNotification` aufruft.

`js/logic.js` hat keine Browser-Abhängigkeiten und kann im Backend 1:1 wiederverwendet werden.
