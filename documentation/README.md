# TimerTool Dokumentation

Diese Doku beschreibt das aktuelle Projekt verstaendlich und praxisnah.
Alle Inhalte sind auf den realen Stand von `index.html`, `js/main.js`, `js/timer.js`, `js/ui.js`, `js/ntp.js`, `js/audio.js` und `js/storage.js` abgestimmt.

## Inhalt

- [Schnellstart](#schnellstart)
- [Best Practice fuer zuverlaessige Alarme](#best-practice-fuer-zuverlaessige-alarme)
- [Systemueberblick](#systemueberblick)
- [Screenshots](#screenshots)
- [Konfigurationsreferenz](KONFIGURATION.md)
- [Anwendungsszenarien mit Beispielkonfigurationen](ANWENDUNGSSZENARIEN.md)

## Schnellstart

1. `index.html` im Browser oeffnen.
2. Optional: `Sync Now` klicken, damit NTP getestet wird.
3. Pro Timer `Config` oeffnen und Modus/Felder setzen.
4. Mit `Start` (pro Timer) oder `Start All` starten.
5. Mit `Save JSON` Konfiguration exportieren und mit `Load JSON` wieder importieren.

## Best Practice fuer zuverlaessige Alarme

Damit Timer und Alarme moeglichst zuverlaessig ausgeloest werden, sollte TimerTool waehrend der Laufzeit sichtbar und aktiv bleiben:

- Browserfenster nicht minimieren
- TimerTool-Tab im Vordergrund geoeffnet lassen
- Geraet nicht sperren und Bildschirm nicht ausschalten
- Energiesparmodus / Akku-Optimierung moeglichst deaktivieren
- Browser das Abspielen von Ton erlauben
- Wenn moeglich: Benachrichtigungen fuer die Website zulassen

Wichtig: Hintergrund-Tabs, minimierte Fenster, Energiesparfunktionen oder gesperrte Geraete koennen Timer verzoegern oder Alarme verhindern.

## Systemueberblick

| Bereich | Datei | Aufgabe |
|---|---|---|
| App-Orchestrierung | `js/main.js` | Initialisierung, Event-Verkabelung, Main Loop, Persistenz-Trigger |
| Timer-Core | `js/timer.js` | Countdown/Schedule-Logik, Trigger-Berechnung, Autostart/Pending |
| UI | `js/ui.js` | Rendering, Modal-Form, globale Controls, Toasts |
| Zeit-Sync | `js/ntp.js` | NTP-Abfrage, Fallback auf Systemzeit, Sync-Status |
| Audio | `js/audio.js` | Beep per WebAudio oder Dateiwiedergabe, Burst-Logik |
| Persistenz | `js/storage.js` | Cookie+localStorage, JSON Export/Import |

## Screenshots

### Hauptansicht

![TimerTool Hauptansicht mit 4 Timern, globalen Aktionen und NTP-Panel](../pics/Screenshot%202026-03-31%20002337.png)

### Timer-Konfiguration

![TimerTool Konfigurationsdialog mit Schedule-, Autostart- und Sound-Feldern](../pics/Screenshot%202026-03-31%20002528.png)

## Wichtige Fachlogik (Kurzfassung)

- Maximal 4 Timer gleichzeitig.
- `countdown`: Einmaliger Trigger bei `durationMs`.
- `schedule`: Trigger nach fester Uhrzeit plus Intervall.
- `offsetBeforeMs`: Trigger wird um den Offset vorgezogen.
- `autostart = true`: Timer startet als `pending` und wird automatisch aktiv.
- Bei Autostart mit Base Time in der Zukunft gilt:
  - erster Trigger bei `Base Time - offsetBeforeMs`
  - nicht erst ein Intervall spaeter

Details stehen in [KONFIGURATION.md](KONFIGURATION.md).
