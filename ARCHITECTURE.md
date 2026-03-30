# TimerTool - Architektur & Design

**Dokumentation der technischen Architektur und Komponenten-Struktur.**

---

## 📐 System-Übersicht

```
┌──────────────────────────────────────────────┐
│         Browser (Client-Side Only)            │
├──────────────────────────────────────────────┤
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │         UI Layer (HTML/CSS)           │   │
│  │  - Timer-Container                   │   │
│  │  - Kontrol-Buttons (Start, Stop, +) │   │
│  │  - Einstellungs-Panel                │   │
│  └────────────┬─────────────────────────┘   │
│               │ (Events)                    │
│  ┌────────────▼─────────────────────────┐   │
│  │     TimerManager (Kern-Logik)        │   │
│  │  - Timer-Verwaltung                  │   │
│  │  - Zeit-Tracking                     │   │
│  │  - Auslöse-Koordination              │   │
│  └────────────┬─────────────────────────┘   │
│               │                              │
│      ┌─────────┼─────────┐                  │
│      │         │         │                  │
│  ┌───▼───┐ ┌──▼──┐ ┌───▼────┐             │
│  │Storage│ │Audio│ │NTP Time│             │
│  │Service│ │Ctrl │ │ Sync   │             │
│  └───────┘ └─────┘ └────────┘             │
│      │       │        │                    │
│  (Cookies) (Web     (Fetch)               │
│   JSON)   Audio)                          │
│                                            │
└──────────────────────────────────────────────┘
```

---

## 🔧 Komponenten & Module

### 0. **App Controller** (`js/app.js`)
**Verantwortung:** Orchestrator für TimerManager, RealtimeClock, AudioController, StorageService, NTPSynchronizer

- zentrale Event-Registrierung und Dispatch
- Lifecycle: start/pause/resume/stop/reset
- State Store (Single Source of Truth):
  - timers (max 3)
  - locale / timezone / ntpStatus
  - uiFlags
- Delegiert zur Persistierung und zur UI-Rendering-Koordination

### 1. **Timer Manager** (`js/timer.js`)
**Verantwortung:** Core-Logik für Timer-Verwaltung, Zeitabfrage und digitale Uhren-Synchronisation
**Verantwortung:** Anzeige der aktuellen Zeit in 0,1s Auflösung + Zeitzonenumschaltung

**API:**
```javascript
class RealtimeClockController {
  constructor({ timezone = 'Europe/Berlin', updateInterval = 100 })

  setTimezone(timezone)
  getTimezone()
  start()
  stop()
  format(date) // z.B. 23:58:45.2
  
  // Intern
  tick()
}
```

**Implementierungskonzept:**
- `performance.now()` + `Date` für 0.1s-Tick (adjusted every 100ms)
- Locale und Intl.DateTimeFormat mit `timeZone`
- Fallback: if timezone invalid → Europe/Berlin
- UI: `#clock-display` und `#timezone-select` in `index.html`

**Beispiel:**
```javascript
const clock = new RealtimeClockController({ timezone: 'Europe/Berlin' });
clock.start();

document.getElementById('timezone-select').addEventListener('change', (e) => {
  clock.setTimezone(e.target.value);
});
```

## UI-Integration
- `TimerTool` Header hat eigene Echtzeit-Uhr
- In `main.js` instanzieren mit `new RealtimeClockController()`
- Zeitzyklus kann als Basis für Timer/Trigger gelten (synchron, drift minimal)

### Zeitzonen-relevante Anforderungen
- Timer sollen auch bei anderen Zeitzonen zuverlässig starten, ohne lokal vs. weltzeit Verwirrung
- Präsentation: `'HH:mm:ss.S'` (0.1s) plus local tz label
- Standard: `Europe/Berlin` (CET/CEST)

### Tests
- [ ] Uhr zeigt 0,1s Auflösung im Display
- [ ] Zeitzone änderbar und wirkt direkt
- [ ] Default `Europe/Berlin` gesetzt bei initial load
- [ ] Unsupported zone fällt auf `Europe/Berlin` zurück
```

### 2. **UI Controller** (`js/ui.js`)
**Verantwortung:** DOM-Manipulation, Event-Handling, visuelles Feedback

#### Klasse: `Timer`
Einzelner Timer mit Konfiguration und Zustand.

**Eigenschaften:**
```javascript
{
  id: NUMBER,           // 0-2 (max 3 Timer)
  name: STRING,         // "Timer 1", "Break", etc.
  mode: ENUM,           // 'countdown', 'time-of-day', (nach Zeit/zu Uhrzeit)
  duration: NUMBER,     // Millisekunden (für countdown)
  targetTime: TIME,     // HH:MM (für time-of-day Mode)
  soundConfig: {
    enabled: BOOL,
    soundFile: STRING,  // Pfad zu Audio-Datei
    volume: 0-1,
    duration: MS,       // Wie lange der Sound läuft
    repeatCount: NUMBER,
    pauseBetween: MS    // Pause zwischen Wiederholungen
  },
  repeatDaily: BOOL,    // Nur für time-of-day
  offsetBefore: MS,     // Wie lange VOR Auslösung triggern
  maxTriggers: NUMBER,  // Max. Anzahl Auslösungen
  isActive: BOOL,
  isRunning: BOOL,
  ellapsedTime: MS,     // Verbrauchte Zeit
  remainingTime: MS,    // Restzeit
  triggerCount: NUMBER  // Wie oft bereits ausgelöst
}
```

**Kritische Methoden:**
```javascript
class Timer {
  constructor(config)
  
  // Steuerung
  start()              // Timer starten
  pause()              // Timer pausieren
  resume()             // Timer fortsetzen
  stop()               // Timer stoppen und zurücksetzen
  
  // Zeit-Management
  getRemainingTime()   // Restzeit berechnen (drift-resistant!)
  handleTick(delta)    // Aufgerufen bei jeder Animation-Frame
  checkTrigger()       // Hat Timer ausgelöst?
  
  // Persistierung
  toJSON()             // Für Storage
  static fromJSON()    // Aus Storage laden
}
```

#### Klasse: `TimerManager`
Verwaltet bis zu 5 Timer gleichzeitig.

**Kritische Methoden:**
```javascript
class TimerManager {
  constructor()
  
  // Timer-Verwaltung
  addTimer(config)      // Neuen Timer hinzufügen (max 3)
  updateTimer(id, cfg)  // Timer aktualisieren
  removeTimer(id)       // Timer entfernen
  getTimer(id)          // Timer abrufen
  
  // Globale Kontrolle
  startAll()           // Alle Timer starten
  stopAll()            // Alle Timer stoppen + Reset (mit Bestätigung!)
  pauseAll()
  resumeAll()
  
  // Haupt-Loop
  tick(deltaTime)      // Aufgerufen ~60x/Sek von requestAnimationFrame
  
  // Events
  on(event, callback) // 'timer-started', 'timer-triggered', 'timer-paused'
  emit(event, data)
  
  // Persistierung
  saveToStorage()
  loadFromStorage()
}
```

---

### 2. **UI Controller** (`js/ui.js`)
**Verantwortung:** DOM-Manipulation, Event-Handling, visuelles Feedback

**Aufgaben:**
- Timer-Anzeige aktualisieren (HH:MM:SS.d Format)
- Button-States verwalten (disabled/enabled während Run/Pause)
- Konfiguration-Dialog rendern
- Material-Design Animationen triggern
- Keyboard-Navigation
- Responsive Layouts

**Pseudocode:**
```javascript
class UIController {
  constructor(timerManager, audioController, storageService)
  
  // Rendering
  renderTimers()       // Alle Timer im DOM aktualisieren
  updateTimerDisplay(id, remaining) // Einzel-Timer aktualisieren
  renderConfigPanel()  // Kons-Dialog rendern
  
  // Event-Handler
  onStartClicked(timerId)
  onStopClicked(timerId)
  onGlobalReset()      // Mit Bestätigung
  onSaveConfig()       // JSON exportieren
  onLoadConfig(file)   // JSON importieren
  
  // Status
  disableButton(selector)
  enableButton(selector)
  showNotification(msg) // Toast/Alert
}
```

---

### 3. **Audio Controller** (`js/audio.js`)
**Verantwortung:** Sound-Effekte, Non-Blocking Playback + Tonhöhen-Generierung

**Anforderungen:**
- Mehrere Sounds gleichzeitig abspielen
- Keine Blockierung der Main-Loop
- Konfigurierbare Repeat & Pause
- Lautstärke-Kontrolle
- **NEU:** Beep-Generierung mit einstellbaren Tonhöhen

**Ansätze:**
1. **Web Audio API** (für Komplexität + Beeps)
   - Mehr Kontrolle über Timing
   - Tonhöhen-Generierung via Oszillator
   - Envelope (Fade-in/out)
   
2. **`<audio>`-Tags** (für externe Sounds)
   - Weniger Code
   - Native Browser-Performance

**API:**
```javascript
class AudioController {
  // Externe Sound-Dateien
  loadSound(name, filePath)  // Sound vorbereiten (.mp3, .wav)
  playSound(soundName, config) // with {volume, repeat, pauseBetween, duration}
  stopSound(soundName)
  setVolume(soundName, 0-1)
  
  // Beep-Generierung (Web Audio API)
  playBeep(config) {
    // config: {
    //   frequency: NUMBER (Hz, z.B. 440, 880, 1000),
    //   duration: MS (z.B. 200),
    //   volume: 0-1 (z.B. 0.5),
    //   waveType: 'sine'|'square'|'sawtooth'|'triangle'
    // }
  }
  
  // Check Browser-Support
  isSupported             // Web Audio API verfügbar?
}
```

**Beep-Implementation (Beispiel):**
```javascript
playBeep({ frequency = 440, duration = 200, volume = 0.5, waveType = 'sine' }) {
  const audioContext = this.getAudioContext();
  
  // Oszillator für Tonhöhe
  const osc = audioContext.createOscillator();
  osc.frequency.value = frequency; // Hz (440 = A4, 880 = A5, etc.)
  osc.type = waveType; // Wellenform
  
  // Lautstärke-Regler
  const gain = audioContext.createGain();
  gain.gain.value = volume;
  
  // Envelope: Fade-in und Fade-out
  const now = audioContext.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01); // Fade-in
  gain.gain.linearRampToValueAtTime(0, now + duration/1000 - 0.01); // Fade-out
  
  // Verbinde: Oszillator → Gain → Speakers
  osc.connect(gain);
  gain.connect(audioContext.destination);
  
  // Starte & Stoppe
  osc.start(now);
  osc.stop(now + duration/1000);
}
```

**Tonhöhen-Referenzen:**
```
C4 = 262 Hz    C#4 = 277 Hz   D4 = 294 Hz    D#4 = 311 Hz
E4 = 330 Hz    F4 = 349 Hz    F#4 = 370 Hz   G4 = 392 Hz
G#4 = 415 Hz   A4 = 440 Hz    A#4 = 466 Hz   B4 = 494 Hz
C5 = 523 Hz    ...
```

---

### 4. **Storage Service** (`js/storage.js`)
**Verantwortung:** Persistierung via Cookies + JSON

#### Cookies
```javascript
// Nur essenzielle Einstellungen (klein halten!)
{
  "timerConfig": JSON.stringify([...]),  // Komplettes Set speichern
  "lastUpdated": TIMESTAMP,
  "theme": "light|dark"
}
```

#### JSON-Export
```javascript
let exportData = {
  version: "1.0",
  exportDate: ISO_TIMESTAMP,
  timers: [...],
  settings: { ... }
}
```

**API:**
```javascript
class StorageService {
  saveTimers(timerManager)        // Zu Cookies
  loadTimers()                     // Aus Cookies
  
  exportAsJSON(timerManager)       // JSON-String erzeugen
  importFromJSON(jsonString)       // Verify & load
  
  // Utilities
  clearStorage()
  getStorageStats()
}
```

---

### 5. **NTP Time Sync** (`js/ntp.js`)
**Verantwortung:** Optionale Zeit-Synchronisation über NTP

**Kritisch für Genauigkeit:**

```javascript
class NTPSynchronizer {
  constructor(config = {
    enabled: true,
    intervalMs: 30 * 60 * 1000,  // 30min re-sync
    fallbackOnError: true
  })
  
  // Diese Sequenz dauert ~100-500ms
  async syncTime() {
    if (!navigator.onLine) return false;  // Offline? Skip NTP
    
    try {
      const ntpTime = await this.fetchNTPTime();  // External API
      this.timeOffset = performance.now() - ntpTime;
      this.lastSync = Date.now();
      return true;
    } catch (err) {
      if (this.fallbackOnError) {
        // Verwende Systemzeit
        this.timeOffset = 0;
      }
      return false;
    }
  }
  
  // Immer verwenden statt Date.now()!
  now() {
    return performance.now() - this.timeOffset;
  }
  
  // Robuste API-Abfrage
  async fetchNTPTime() {
    // Optionen:
    // 1. ntpjs (kleine Lib)
    // 2. world-time-api.appspot.com (public API)
    // 3. Fallback zu localStorage-Cache
  }
}
```

**Drift-Prävention in Timer-Logik:**
```javascript
// FALSCH: Akkumuliert Fehler!
let elapsed = 0;
setInterval(() => {
  elapsed += 16;  // 16ms ist ungefähr, nicht exakt!
}, 16);

// RICHTIG: Verwendet absolute Zeit
const startTime = ntp.now();
function updateTimer() {
  const elapsed = ntp.now() - startTime;
  // elapsed ist immer korrekt!
}
```

---

## 🎯 Auslösemodi (Komplexität!)

### Mode 1: **Countdown**
```
Timer: 5 Minuten
Verhalten: Zählt von 5:00 bis 0:00

Auslöse-Logik:
if (remainingTime <= 0) {
  trigger();
}
```

### Mode 2: **Zeit des Tages (mit Wiederholung)**
```
Timer: 11:00 Uhr, täglich
Verhalten: Triggert um 11:00, 11:30 (wenn repeat=30min)

Auslöse-Logik:
const now = ntp.now();
const targetHour = 11, targetMin = 0;
if (getCurrentTime() >= targetTime && !triggeredToday) {
  trigger();
}
```

### Mode 3: **Mit Offset**
```
Timer: 11:00 Uhr, 30s offset VOR Auslösung
Verhalten: Triggert bereits um 10:59:30!

Auslöse-Logik:
const triggerTime = targetTime - offset;
if (now >= triggerTime && !triggered) {
  trigger();
}
```

---

## 🔄 Haupt-Loop (Animation Frame)

```javascript
let lastFrameTime = performance.now();

function mainLoop(currentFrameTime) {
  const deltaTime = currentFrameTime - lastFrameTime;
  lastFrameTime = currentFrameTime;
  
  // 1. Zeit-Update
  timerManager.tick(deltaTime);
  
  // 2. UI-Update
  uiController.updateDisplay();
  
  // 3. Trigger-Check
  timerManager.checkAllTriggers();
  
  // Nächste Frame
  requestAnimationFrame(mainLoop);
}

// Start
requestAnimationFrame(mainLoop);
```

---

## 🎨 HTML-Struktur (Responsive)

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1,
    maximum-scale=5, user-scalable=yes, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>TimerTool</title>
  <link rel="stylesheet" href="css/style.css">
  <link rel="stylesheet" href="css/animations.css">
</head>
<body>
  <div class="timer-tool">
    <!-- Header -->
    <header class="app-header">
      <h1>TimerTool</h1>
      <div class="header-actions">
        <button class="btn-settings" aria-label="Einstellungen">⚙️</button>
      </div>
    </header>

    <!-- Digitale Echtzeit-Uhr (0,1s Auflösung) -->
    <section class="realtime-clock" aria-live="polite" aria-label="Aktuelle Zeit">
      <div class="clock-display" id="clock-display">--:--:--.0</div>
      <div class="clock-timezone">
        <label for="timezone-select">Zeitzone:</label>
        <select id="timezone-select" aria-label="Zeitzone wählen">
          <option value="Europe/Berlin" selected>Europe/Berlin</option>
          <option value="UTC">UTC</option>
          <option value="America/New_York">America/New_York</option>
          <option value="Asia/Tokyo">Asia/Tokyo</option>
        </select>
      </div>
    </section>

    <!-- Timer Grid (Responsive) -->
    <main class="timers-container">
      <div class="timers-grid">
        <!-- 5 Timer Slots (Template) -->
        <div class="timer-slot" data-timer-id="0">
          <div class="timer-card">
            <input type="text" class="timer-name" placeholder="Timer 1" maxlength="20">
            <div class="timer-display" aria-label="Verbleibende Zeit">05:30.2</div>
            
            <div class="timer-controls">
              <button class="btn-start" aria-label="Timer starten">▶️</button>
              <button class="btn-pause" disabled aria-label="Timer pausieren">⏸️</button>
              <button class="btn-reset" aria-label="Timer zurücksetzen">↻</button>
            </div>
            
            <button class="btn-config" data-timer-id="0" aria-label="Timer konfigurieren">⚙️</button>
          </div>
        </div>
        <!-- Wieder um für Timer 1-4 -->
      </div>
    </main>

    <!-- Global Controls -->
    <footer class="global-controls">
      <button class="btn-reset-all" aria-label="Alle Timer zurücksetzen">🔄 Reset All</button>
      <button class="btn-save" aria-label="Konfiguration speichern">💾 Speichern</button>
      <button class="btn-load" aria-label="Konfiguration laden">📂 Laden</button>
    </footer>
  </div>

  <!-- Config Modal (Hidden by default) -->
  <div class="config-modal" hidden role="dialog" aria-labelledby="config-title">
    <div class="modal-content">
      <h2 id="config-title">Timer konfigurieren</h2>
      
      <form class="config-form">
        <!-- Mode Selection -->
        <fieldset>
          <legend>Modus</legend>
          <label>
            <input type="radio" name="mode" value="countdown"> Countdown
          </label>
          <label>
            <input type="radio" name="mode" value="time-of-day"> Uhrzeit
          </label>
        </fieldset>

        <!-- Duration / Time -->
        <label>
          Dauer / Zeit:
          <input type="time" class="config-time" min="00:00" max="23:59">
        </label>

        <!-- Sound Config -->
        <fieldset>
          <legend>Sound</legend>
          <label>
            <input type="checkbox" name="sound-enabled"> Sound aktiviert
          </label>
          <label>
            Tonhöhe (Hz):
            <input type="number" name="sound-freq" min="100" max="2000" step="10" value="440">
          </label>
          <label>
            Lautstärke:
            <input type="range" name="sound-volume" min="0" max="1" step="0.1" value="0.5">
          </label>
        </fieldset>

        <button type="submit" class="btn-save-config">Speichern</button>
        <button type="button" class="btn-cancel-config">Abbrechen</button>
      </form>
    </div>
  </div>

  <!-- File Input (Hidden) -->
  <input type="file" id="file-input" accept=".json" hidden>

  <script src="js/ntp.js"></script>
  <script src="js/timer.js"></script>
  <script src="js/audio.js"></script>
  <script src="js/storage.js"></script>
  <script src="js/ui.js"></script>
  <script src="js/main.js"></script>
</body>
</html>
```

---

## 📊 Zustandsdiagramm (Tim­er)

```
[Stopped] --start--> [Running]
   ⬆️            ⬆️      │
   └─ pause ──── ──┘     │ (optional)
                         │
                    [Paused]
                         │
                       reset
                         │
                    [Stopped+Reset]
                         
Trigger tritt bei Running ein: [Triggered] → Sound + Event
```

---

## 🎨 UI/UX - Responsive Design (Mobile-First!)

### Material-Design System
- **Inspiration:** VS Code Material Design Theme
- **Color Palette:** CSS-Variablen für Light/Dark Themes
- **Buttons:** Ripple-Effekt auf Interaction
- **Icons:** SVG oder Unicode-Symbole (unterschiedliche Größe)
- **Typography:** Klare Hierarchie, gute Lesbarkeit

### Responsive Breakpoints & Layouts

**Mobile (320px - 767px):**
```css
/* Vertical stack */
.timer-slot { width: 100%; margin-bottom: 1rem; }

/* Touch-friendly sizes: min 44x44px */
button { min-height: 44px; min-width: 44px; padding: 0.75rem; }

/* Font size min 16px (Auto-Zoom Prevention) */
input, button { font-size: 16px; }

/* Single column layout */
.timer-tool { display: flex; flex-direction: column; }

/* Fullscreen modals */
.config-modal { position: fixed; width: 100vw; height: 100vh; }
```

**Tablet (768px - 1024px):**
```css
/* 2-column grid für Timer */
.timers-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

/* Sidebar möglich */
.main-layout { display: grid; grid-template-columns: 1fr 250px; }
```

**Desktop (1025px+):**
```css
/* Flexible Grid: 2x2+1 oder custom */
.timers-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }

/* Sidebar für Quick-Settings */
.sidebar { width: 300px; position: sticky; top: 0; }

/* Hover-Effects */
button:hover { background-color: var(--hover-color); transform: scale(1.02); }
```

### Mobile-Spezifische Features

**Touch Interactions:**
```javascript
// Touch-Device Detection
const isTouchDevice = () => (
  ('ontouchstart' in window) || 
  (navigator.maxTouchPoints > 0) || 
  (navigator.msMaxTouchPoints > 0)
);

// Long-tap für Context-Menu (statt Right-Click)
element.addEventListener('touchstart', handleLongTap);
element.addEventListener('touchend', cancelLongTap);

// Swipe-Navigation (optional: Links/Rechts zwischen Timern)
setupSwipeNavigation();
```

**Landscape Mode Optimization:**
```css
@media (orientation: landscape) and (max-height: 600px) {
  /* 3 Timer pro Reihe */
  .timers-grid { grid-template-columns: repeat(3, 1fr); }
  
  /* Klein & kompakt */
  .timer-display { font-size: 1.5rem; }
  button { padding: 0.5rem; }
}
```

**Viewport Meta Tag (HTML):**
```html
<meta name="viewport" content="width=device-width, initial-scale=1, 
  maximum-scale=5, user-scalable=yes, viewport-fit=cover">
```

### Desktop Enhancements

- **Keyboard Shortcuts:** Ripple visual, Tooltip-Info
- **Hover-States:** Button Preview, Sidebar-Toggle
- **Sidebar:** Quick-Settings, Presets speichern/laden
- **Resizable Panes:** Timer-Größe adjustierbar (optional)

### Accessibility (WCAG AA)

- **ARIA-Labels:** Alle Buttons mit `aria-label`
- **Keyboard Navigation:** Tab, Enter, Escape, Arrow-Keys
- **Color Contrast:** Min. 4.5:1 für Text
- **Focus Indicators:** Sichtbare Focus-States
- **Responsive Font:** Nie unter 12px (unlesbar)

```html
<!-- Beispiel -->
<button class="btn-start" aria-label="Timer 1 starten">
  <span aria-hidden="true">▶️</span>
</button>
```

---

## 🌐 Mehrsprachigkeit (i18n)

Ziel: Deutsch (Default) + Englisch als zweite Sprache. Wenn verfügbar, später weitere Sprachen.

### Architektur
- Alle UI-Texte aus den Templates/Strings extrahieren
- Keine hartcodierten Texte im DOM
- Sprache über `lang` Attribut im `html` Tag setzen (z.B. `<html lang="de">`)
- Persistierung der Sprache in `localStorage` (z.B. `locale = 'de' | 'en'`)

### Datei/basics
- `i18n.js` o.ä. für Text-Resourcen
- Standard-Object-Struktur:
```javascript
const i18nStrings = {
  de: {
    appTitle: 'TimerTool',
    start: 'Start',
    pause: 'Pause',
    reset: 'Reset',
    config: 'Konfigurieren',
    save: 'Speichern',
    load: 'Laden',
    // ...
  },
  en: {
    appTitle: 'Timer Tool',
    start: 'Start',
    pause: 'Pause',
    reset: 'Reset',
    config: 'Configure',
    save: 'Save',
    load: 'Load',
    // ...
  }
};
```

### UI-Integration
- Funktion `t(key)`:
```javascript
function t(key) {
  return i18nStrings[currentLocale][key] || key;
}
```
- Bei Rendern:
  - `element.textContent = t('start');`
  - `aria-label = t('startTimer');`

### Sprache wechseln
- UI-Switch (z.B. Drop-down) im Header
- Setter:
```javascript
function setLocale(locale) {
  currentLocale = locale;
  localStorage.setItem('timerToolLocale', locale);
  document.documentElement.lang = locale;
  renderAllUI();
}
```

### Default-Logik
- `const savedLocale = localStorage.getItem('timerToolLocale') || navigator.language.split('-')[0] || 'de';`
- Fallback auf `de` wenn Sprache nicht definiert.

### Testing
- [ ] Texte auf Deutsch/Englisch wechseln
- [ ] Default-Language korrekt geladen (deutsch)
- [ ] `aria-label` weiterhin vorhanden und lokalisiert
- [ ] Nicht verfügbare Sprachen führen nicht zu Fehlern

---

## ⚠️ Kritische Fehlerquellen

1. **Drift:** setInterval() ist nicht exakt → NTP + performance.now()
2. **Browser-Tabs:** Timer läuft langsamer wenn Tab im Hintergrund
   - Lösung: Web Worker für genaue Timing
3. **Audio-Timing:** Sound spielt nicht exakt zur erwarteten Zeit
   - Lösung: Web Audio API für Precision
4. **Memory Leaks:** Event-Listener nicht entfernt
   - Lösung: Cleanup in Destruktor
5. **Offline-Modus:** NTP fehlgeschlagen → Fallback prüfen
6. **Responsive:** Buttons zu klein auf Mobile (< 44px)
   - Lösung: Touch-Target min 44x44px beachten
7. **Font-Size:** Zu klein auf Mobile → Browser zoomt automatisch
   - Lösung: Min 16px auf Input-Feldern

---

### JSON-Export / Import
- Kompletter Zustand (inkl. max 3 Timer) als JSON-Datei speichern
- Import validieren, schemaVersion prüfen
- Migrationsstrategie:
  - von version 1 → 2 etc.

## 🧪 Test-Szenarien

**Core Timer-Funktionalität:**
- [ ] Timer läuft 5 Min ohne merkliche Drift
- [ ] NTP-Sync funktioniert, fallback auf System-Zeit
- [ ] Sound spielt non-blocking während Timer läuft
- [ ] Konfiguration speichert/lädt korrekt
- [ ] 5 Timer gleichzeitig ohne Konflikt
- [ ] Global Reset mit Bestätigung

**Responsive & Mobile:**
- [ ] Mobile (320px): Buttons ≥44x44px, vertikales Layout
- [ ] Tablet (768px): 2-column Grid Layout
- [ ] Desktop (1025px+): Optimales Grid-Layout
- [ ] Landscape Mode: Alle Timer sichtbar ohne Scroll
- [ ] Touch-Interactions: Tap, Long-tap, Swipe (optional)
- [ ] Font-Size > 16px auf Input-Feldern (Auto-Zoom Prevention)

**Audio & Sound:**
- [ ] Beep mit verschiedenen Frequenzen
- [ ] Externe Sound-Dateien laden & abspielen
- [ ] Non-blocking während Timer-Lauf
- [ ] Lautstärke-Kontrolle funktioniert

**Persistierung & Storage:**
- [ ] Konfiguration in Cookies speichern
- [ ] JSON-Export/Import funktioniert
- [ ] Offline-Betrieb ohne NTP

**Accessibility (WCAG AA):**
- [ ] ARIA-Labels auf allen Buttons
- [ ] Keyboard-Navigation (Tab, Enter, Escape)
- [ ] Fokus-Indikatoren deutlich sichtbar
- [ ] Color Contrast ≥ 4.5:1
- [ ] Responsive auf alle Viewport-Größen

---

## 📚 Ressourcen & References

- **Web Audio API:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- **TTS :** https://github.com/OHF-Voice/piper1-gpl
- **requestAnimationFrame:** https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame
- **NTP zu JavaScript:** ntpjs library oder world-time-api
- **Material Design:** https://material.io/design
- **Local Storage & Cookies:** Web Storage API

---

**Letzte Aktualisierung:** März 2026
