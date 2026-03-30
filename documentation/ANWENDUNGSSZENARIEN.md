# Anwendungsszenarien und Konfig-Beispiele

Diese Beispiele zeigen typische Einsaetze mit konkreten Feldwerten.
Die JSON-Snippets koennen direkt als Timer-Objekte in eine Exportdatei uebernommen werden.

## Szenario 1: Marktstart mit Vorwarnung (Autostart + Offset)

**Ziel:** 10 Sekunden vor jedem 15-Minuten-Takt innerhalb des Handelsfensters alarmieren.

**Ergebnis:** Bei `scheduleStart=09:00` und `offsetBeforeMs=10000` kommt der erste Alarm um `08:59:50`.

```json
{
  "id": 0,
  "name": "Market 15m",
  "mode": "schedule",
  "durationMs": 300000,
  "scheduleStart": "09:00",
  "intervalMs": 900000,
  "offsetBeforeMs": 10000,
  "endTime": "17:30",
  "maxTriggers": 0,
  "autostart": true,
  "sound": {
    "enabled": true,
    "type": "beep",
    "fileUrl": "",
    "fileMaxDurationSeconds": 0,
    "frequency": 1440,
    "waveType": "sine",
    "volume": 0.25,
    "durationMs": 150,
    "repeatCount": 2,
    "pauseBetweenMs": 120
  }
}
```

## Szenario 2: Pomodoro (25/5) mit Countdown

**Ziel:** Ein klarer Einzelalarm nach 25 Minuten Fokuszeit.

```json
{
  "id": 1,
  "name": "Pomodoro Focus",
  "mode": "countdown",
  "durationMs": 1500000,
  "scheduleStart": "09:00",
  "intervalMs": 300000,
  "offsetBeforeMs": 0,
  "endTime": "",
  "maxTriggers": 1,
  "autostart": false,
  "sound": {
    "enabled": true,
    "type": "beep",
    "fileUrl": "",
    "fileMaxDurationSeconds": 0,
    "frequency": 880,
    "waveType": "triangle",
    "volume": 0.35,
    "durationMs": 400,
    "repeatCount": 3,
    "pauseBetweenMs": 180
  }
}
```

## Szenario 3: Stundentakt mit Sprachdatei

**Ziel:** Jede volle Stunde mit kurzer Sprachansage erinnern.

```json
{
  "id": 2,
  "name": "Hourly Voice",
  "mode": "schedule",
  "durationMs": 300000,
  "scheduleStart": "08:00",
  "intervalMs": 3600000,
  "offsetBeforeMs": 30000,
  "endTime": "20:00",
  "maxTriggers": 0,
  "autostart": true,
  "sound": {
    "enabled": true,
    "type": "file",
    "fileUrl": "sounds/Der_Markt_oeffnet_in_5_Minuten_de_DE-thorsten-high.wav",
    "fileMaxDurationSeconds": 3,
    "frequency": 440,
    "waveType": "sine",
    "volume": 0.35,
    "durationMs": 250,
    "repeatCount": 1,
    "pauseBetweenMs": 0
  }
}
```

## Szenario 4: Tagesabschluss mit begrenzter Triggeranzahl

**Ziel:** Nur drei Erinnerungen vor Feierabend.

```json
{
  "id": 3,
  "name": "Closing Sequence",
  "mode": "schedule",
  "durationMs": 300000,
  "scheduleStart": "16:00",
  "intervalMs": 900000,
  "offsetBeforeMs": 15000,
  "endTime": "17:00",
  "maxTriggers": 3,
  "autostart": true,
  "sound": {
    "enabled": true,
    "type": "beep",
    "fileUrl": "",
    "fileMaxDurationSeconds": 0,
    "frequency": 520,
    "waveType": "square",
    "volume": 0.3,
    "durationMs": 220,
    "repeatCount": 2,
    "pauseBetweenMs": 140
  }
}
```

## Vollstaendige Beispiel-Datei (4 Timer)

Als praktische Vorlage liegen bereits Exportdateien im Projekt:

- `timertool-config-Minutes_European.json`
- `timertool-config-voices-german.json`

Diese koennen direkt mit `Load JSON` importiert und dann angepasst werden.

## Globale Settings pro Einsatzfall

### Trading/Monitoring tagsueber

```json
{
  "settings": {
    "timezone": "Europe/Berlin",
    "ntpIntervalMs": 1800000,
    "globalToneDisabled": false
  }
}
```

### Lautloser Betrieb (z. B. Meeting)

```json
{
  "settings": {
    "timezone": "__local__",
    "ntpIntervalMs": 1800000,
    "globalToneDisabled": true
  }
}
```

## Visuelle Referenz

- Dashboard: ![Dashboard](../pics/Screenshot%202026-03-31%20002337.png)
- Konfigurationsdialog: ![Config Modal](../pics/Screenshot%202026-03-31%20002528.png)
