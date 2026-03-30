# Konfigurationsreferenz

Diese Referenz beschreibt die JSON-Struktur fuer `Save JSON` / `Load JSON` und die wichtigsten Felder im UI.

## JSON-Grundstruktur

```json
{
  "exportVersion": "1.0.0",
  "exportDate": "2026-03-31T00:00:00.000Z",
  "timers": [
    {
      "id": 0,
      "name": "Timer5",
      "mode": "schedule",
      "durationMs": 300000,
      "scheduleStart": "08:45",
      "intervalMs": 300000,
      "offsetBeforeMs": 5000,
      "endTime": "22:45",
      "maxTriggers": 0,
      "autostart": true,
      "sound": {
        "enabled": true,
        "type": "beep",
        "fileUrl": "",
        "fileMaxDurationSeconds": 0,
        "frequency": 440,
        "waveType": "sine",
        "volume": 0.25,
        "durationMs": 250,
        "repeatCount": 1,
        "pauseBetweenMs": 0
      }
    }
  ],
  "settings": {
    "timezone": "__local__",
    "ntpIntervalMs": 1800000,
    "globalToneDisabled": false
  }
}
```

## Timer-Felder

| Feld | Typ | Wertebereich | Bedeutung |
|---|---|---|---|
| `id` | number | `0..3` | Timer-Slot (vom System vergeben) |
| `name` | string | max 30 Zeichen | Anzeigename im UI |
| `mode` | string | `countdown` oder `schedule` | Arbeitsmodus |
| `durationMs` | number | `1000..86400000` | Countdown-Dauer in ms |
| `scheduleStart` | string | `HH:MM` | Basiszeit fuer Schedule |
| `intervalMs` | number | `1000..86400000` | Trigger-Intervall in ms |
| `offsetBeforeMs` | number | `0..3600000` | Vorverlagerung des Triggers |
| `endTime` | string | `HH:MM` oder leer | Optionales Endzeitfenster |
| `maxTriggers` | number | `0..999` | `0 = unbegrenzt` |
| `autostart` | boolean | `true/false` | Automatischer Start zur Basiszeit |

## Sound-Felder

| Feld | Typ | Wertebereich | Bedeutung |
|---|---|---|---|
| `enabled` | boolean | `true/false` | Sound an/aus |
| `type` | string | `beep` oder `file` | Soundquelle |
| `fileUrl` | string | URL oder relativer Pfad | Audiodatei (bei `type=file`) |
| `fileMaxDurationSeconds` | number | `0..86400` | Max Wiedergabezeit, `0 = bis Ende` |
| `frequency` | number | `100..2000` | Frequenz in Hz (bei Beep) |
| `waveType` | string | `sine`, `square`, `triangle`, `sawtooth` | Wellenform |
| `volume` | number | `0..1` | Lautstaerke |
| `durationMs` | number | `10..10000` | Beep-Dauer in ms |
| `repeatCount` | number | `1..50` | Anzahl Bursts |
| `pauseBetweenMs` | number | `0..5000` | Pause zwischen Bursts |

## Globale Settings

| Feld | Typ | Bedeutung |
|---|---|---|
| `timezone` | string | `__local__` oder feste TZ (z. B. `Europe/Berlin`) |
| `ntpIntervalMs` | number | Re-Sync-Intervall in ms |
| `globalToneDisabled` | boolean | Unterdrueckt alle Sounds global |

## Triggerlogik

### Countdown

- Startzeitpunkt = `now`
- Triggerzeitpunkt = `now + durationMs`
- Nach dem Trigger geht der Timer auf `completed`

### Schedule ohne Autostart

- Erste Ausloesung basiert auf `scheduleStart + intervalMs`
- Effektiver Triggerzeitpunkt ist jeweils:
  - `nextTriggerMs - offsetBeforeMs`
- Danach springt `nextTriggerMs` immer um `intervalMs` weiter

### Schedule mit Autostart

- Timer startet im Zustand `pending`
- Aktivierung bei `scheduleStart - offsetBeforeMs`
- Erste Ausloesung basiert auf `scheduleStart` (mit Offset davor)
- Wichtig:
  - Liegt die Base Time in der Zukunft, kommt der erste Alarm bei `Base Time - offset`
  - nicht erst ein Intervall spaeter

## Import/Export-Hinweise

- Export erzeugt vollstaendige Konfiguration fuer alle Timer plus `settings`.
- Import erwartet mindestens ein Feld `timers` als Array.
- Unbekannte oder ungueltige Einzelwerte werden intern auf sichere Defaults normalisiert.
