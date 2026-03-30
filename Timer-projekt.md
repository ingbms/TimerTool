# TimerTool - Projektstand (Ist)

## Ziel

TimerTool ist ein serverloses Zeitmanagement-Tool, das komplett im Browser laeuft (statische Website, kein Backend).

## Tech-Stack

- HTML5
- CSS3
- Vanilla JavaScript (ohne Framework)
- Browser APIs: `requestAnimationFrame`, `Web Audio API`, `fetch`, `localStorage`, `document.cookie`

## Aktueller Funktionsumfang

### Zeitbasis und Synchronisation

- Optionale NTP-Synchronisation beim Start und danach zyklisch (Standard: 30 Minuten)
- Sync-Intervall einstellbar ueber UI (1-240 Minuten)
- Quellen: `worldtimeapi.org` und `timeapi.io` (Fallback zwischen den Quellen)
- Offline oder Fehlerfall: automatische Rueckfallebene auf Systemzeit

### Timer-Logik

- Maximal **4 Timer** gleichzeitig (nicht 5)
- Zwei Modi:
  - `countdown`
  - `schedule` (feste Startzeit + Intervall)
- Pro Schedule-Timer konfigurierbar:
  - Base Time (`HH:MM`)
  - Intervall
  - Offset vor Trigger
  - Endzeit (optional)
  - Max Trigger (0 = unbegrenzt)
  - Autostart

### Autostart-Verhalten (aktuell)

- Bei `autostart = true` startet ein Schedule-Timer zunaechst im Zustand `pending`.
- Liegt die Base Time in der Zukunft, wird der **erste Trigger zur Base Time (mit Offset)** geplant, also:
  - Effektiver Triggerzeitpunkt = `Base Time - offsetBefore`
  - **nicht** erst ein Intervall spaeter
- Danach laufen weitere Trigger im konfigurierten Intervall.
- Bei Erreichen der Endzeit geht ein Autostart-Timer wieder auf `pending` (statt dauerhaft `completed`).

### Sound

- Pro Timer separat konfigurierbar
- Sound-Typen:
  - Beep (WebAudio, Frequenz/Wellenform/Lautstaerke)
  - Audio-Datei per URL
- Parameter:
  - Dauer
  - Wiederholungen (Burst Count)
  - Pause zwischen Bursts
  - Lautstaerke
  - Max File Playback (optional)
- Wiedergabe ist non-blocking zur Timer-Logik

### UI und globale Aktionen

- Start/Stop pro Timer
- Timer-Konfiguration per Modal
- Globale Aktionen:
  - Start All
  - Reset All (mit Bestaetigung)
  - Save JSON
  - Load JSON
  - Global tone disable
- Uhrenanzeige mit waehlbarer Zeitzone

### Persistenz

- Automatisches Speichern des Zustands in:
  - chunked Cookies
  - `localStorage` (Fallback/Backup)
- JSON Export/Import der Timer- und Settings-Daten

## Projektstruktur (relevant)

- `index.html`
- `css/style.css`
- `css/animations.css`
- `js/main.js`
- `js/timer.js`
- `js/ui.js`
- `js/ntp.js`
- `js/audio.js`
- `js/storage.js`

## Betrieb und Deployment

- Lokal: `index.html` direkt im Browser oeffnen oder statisch serven
- Deployment: GitHub Pages geeignet

## Lizenz und Autor

- Lizenz: CC BY-NC-SA 4.0
- Creator: INGBMS - S.M.Art
