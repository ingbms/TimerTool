# TimerTool - Copilot Instructions

**Projekt:** TimerTool - Flexibles Zeitmanagementsystem für den Browser  
**Lizenz:** CC BY-NC-SA  
**Ersteller:** INGBMS - S.M.Art  
**Tech Stack:** Vanilla HTML/CSS/JavaScript (Serverseitig lädt)

---

## 🎯 Projektüberblick

TimerTool ist eine serverlose, browserbasierte Anwendung für flexibles Zeitmanagement mit mehreren konfigurierbaren Timern. Die Anwendung hat ein Material-Design ähnlich VS Code und funktioniert vollständig im Browser ohne Server-Abhängigkeiten.

### Kernfeatures
- **Mehrere Timer:** Bis zu 5 unabhängig konfigurierbare Timer
- **NTP-Zeit-Synchronisation:** Optionale Abfrage über NTP (nur wenn verfügbar), sonst Systemzeit
- **Präzision:** 0,1 Sekunden Genauigkeit und Animation ohne Drift
- **Persistierung:** Konfigurationen in Cookies + JSON-Export/-Import
- **Soundbenachrichtigungen:** Pro Timer individuell konfigurierbar (Ton, Dauer, Lautstärke, Anzahl)
- **Verschiedene Auslösemodi:** 
  - Nach verstrichener Zeit
  - Zu fester Uhrzeit mit optionaler Wiederholung
  - Mit konfigurierbarem Offset (z.B. vor Auslösung warnen)
  - Maximale Anzahl Auslösungen definierbar

---

## 🏗️ Architektur-Prinzipien

Siehe `ARCHITECTURE.md` für detaillierte Architektur und Komponenten.

**Allgemeine Prinzipien:**
- **Modular:** Getrennte Module für Timer-Logik, UI, Persistierung, Audio
- **Keine Abhängigkeiten:** Nur Vanilla JS, keine Frameworks
- **Offline-First:** Vollständig ohne externe Dependencies
- **Performance:** Minimal DOM-Manipulationen, effiziente Animationen
- **Konfigurierbarkeit:** Alle Einstellungen persistent speichern

---

## 📁 Projektstruktur (geplant)

```
TimerTool/
├── .github/
│   └── copilot-instructions.md (diese Datei)
├── ARCHITECTURE.md               (Design & Komponenten)
├── Timer-projekt.md              (Original-Anforderungen)
├── README.md                      (Benutzer-Dokumentation)
├── index.html                     (Haupt-HTML)
├── css/
│   ├── style.css                 (Material-Design Styling)
│   └── animations.css            (Timer-Animationen)
├── js/
│   ├── main.js                   (Einstiegspunkt)
│   ├── timer.js                  (Timer-Logik)
│   ├── ui.js                     (Benutzeroberfläche)
│   ├── storage.js                (Persistierung: Cookies, JSON)
│   ├── audio.js                  (Sound-System)
│   └── ntp.js                    (NTP-Zeitsynchronisation)
└── assets/
    └── sounds/                   (Audio-Dateien)
```

---

## 🛠️ Entwicklungs-Richtlinien

### Code-Stil
- **Vanilla JavaScript:** ES6+, keine Minifizierung in dev
- **CSS:** Flexbox/Grid preferiert, CSS-Variablen für Material-Design Farben
- **HTML:** Semantische Tags, accessible durch ARIA-Labels

### Naming-Konventionen
- **Klassen:** `TimerManager`, `AudioController`, `StorageService`
- **Funktionen:** `camelCase`, z.B. `startTimer()`, `saveConfiguration()`
- **Variablen:** `camelCase` für Variablen, `UPPER_CASE` für Konstanten
- **CSS-Klassen:** `kebab-case`, z.B. `.timer-container`, `.control-button`

### Modul-Exporte
Jedes Modul sollte eine oder mehrere Hauptklassen/Funktionen mit klaren APIs exportieren:
```javascript
// timer.js - Beispiel
export class Timer { ... }
export class TimerManager { ... }
```

### Testing & Debugging
- Browser DevTools verwenden
- Console-Logs für Debugging (später mit proper logging)
- Keine Browser-Abhängigkeiten außer Web APIs (Web Audio, Fetch, Date)

---

## 📝 Persistierung

### Cookies
- **Nutzen:** Schnelle Konfigurationsabfrage beim Start
- **TTL:** 30 Tage (konfigurierbar)
- **Größe:** Vorsicht bei Größenlimit, nur essenzielle Einstellungen

### JSON-Export/Import
- **Manuell:** Buttons zum Speichern/Abrufen von Timer-Sets
- **Format:** JSON mit allen Timer-Konfigurationen
- **Browser-API:** `File API` für Download/Upload

---

## ⏱️ Zeit-Handling (Kritisch!)

### NTP-Synchronisation
```javascript
// Pseudocode
if (navigator.onLine) {
  const ntpTime = await fetchNTPTime(); // z.B. world.time.com
  initialOffset = system.now() - ntpTime;
} else {
  use system time;
}
// Neuabfrage alle 30min (oder konfigurierbar)
```

### Drift-Vermeidung
- **Nicht:** `setInterval()` für Timer-Logik  
- **Stattdessen:** `requestAnimationFrame()` oder Web Worker
- **Tracking:** Differenz zwischen erwarteter und tatsächlicher Zeit
- **Korrektur:** Laufende Anpassung statt plötzliche Sprünge

---

## 🎨 UI/UX

### Material-Design
- Inspirati­on: VS Code Material Design Theme
- **Farben:** Definiert in CSS-Variablen (siehe `style.css`)
- **Buttons:** Ripple-Effekt auf Hover/Click
- **Icons:** Können SVG oder Unicode Symbole sein
- **Responsive:** Mobile-First, Desktop-optimiert

### Barrierefreiheit
- ARIA-Labels auf Buttons und Eingaben
- Keyboard-Navigation (Tab, Enter, Escape)
- Fokus-Indikatoren sichtbar

---

## 🔊 Audio-System

### Non-Blocking Sound
- Web Audio API oder einfache `<audio>` Tags
- Mehrere Sounds gleichzeitig abspielen möglich
- Einstellungen: Ton, Dauer, Lautstärke, Pausendauer, Anzahl Repeats

### Sound-Dateien
- Format: MP3 oder WAV (hohe Browser-Kompatibilität)
- Location: `assets/sounds/`
- Vordefinierte Sounds + evtl. Nutzer-Upload später

---

## 📦 Deployment & GitHub

### GitHub-Struktur
- **Main Branch:** Produktive Version
- **Dev Branch (optional):** Entwicklung
- **GitHub Pages:** Automatisches Deployment von `main` zu `<owner>.github.io/TimerTool`

### Deployment-Checklist
- [ ] Alle Tests bestanden
- [ ] Production-ready Code (keine console.logs in Produktion)
- [ ] README aktualisiert
- [ ] CHANGELOG aktualisiert falls relevant

---

## 🚀 Nächste Schritte

1. **Architektur-Meeting:** Detaillierte Besprechung in `ARCHITECTURE.md`
2. **HTML-Grundgerüst:** Basis-Layout mit Timer-Container
3. **Timer-Logik:** Core TimerManager Klasse
4. **UI-Framework:** CSS-System (Material Design)
5. **Audio-Integration:** Sound-System testen
6. **Persistierung:** Storage Module implementieren
7. **Testing & Deployment:** GitHub Pages Setup

---

## ❓ Fragen für AI-Assistenten

Bei der Arbeit an diesem Projekt sollten Assistenten diese Fragen berücksichtigen:
- Ist die Timer-Logik drift-resistent?
- Sind alle UI-Elemente accessible?
- Funktioniert Persistierung auch offline?
- Sind Sound-Effekte non-blocking und performant?
- Ist das Code-Styling konsistent mit den Richtlinien hier?

---

**Letzte Aktualisierung:** März 2026
