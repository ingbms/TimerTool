# TimerTool

Browser-only timer management tool with up to 4 configurable timers.

## Features

- **NTP time synchronization:** Automatic sync on startup and periodically (default every 30 minutes)
- **Fallback mechanism:** Automatic fallback to system time if NTP is unavailable or offline
- **High precision:** 0.1 second display precision with drift-resistant timing
- **Up to 4 configurable timers** with multiple operation modes:
  - Countdown mode
  - Fixed base time with repeating intervals and optional offset before trigger
  - Optional autostart: automatically activates at base time and pauses at end time
- **Per-timer sound configuration:**
  - Customizable beep frequency, waveform, and volume
  - Configurable burst duration, repeat count, and pause between bursts
  - Support for external audio file playback via URL
- **Global controls:**
  - Start all, reset all (confirmation required)
- **Data persistence:**
  - Cookie-based auto-save
  - JSON export and import

## Screenshots

**Main dashboard (4 active schedule timers, global actions, NTP status panel):**

![TimerTool main dashboard with four running timers, global controls, and NTP sync panel](pics/Screenshot%202026-03-31%20002337.png)

**Timer configuration modal (fixed-time/interval mode with autostart, offset, and sound settings):**

![TimerTool timer configuration modal showing fixed-time interval fields and sound options](pics/Screenshot%202026-03-31%20002528.png)

## Documentation

- Overview: [documantation/README.md](documantation/README.md)
- Config reference: [documantation/KONFIGURATION.md](documantation/KONFIGURATION.md)
- Use cases and config examples: [documantation/ANWENDUNGSSZENARIEN.md](documantation/ANWENDUNGSSZENARIEN.md)

## Structure

- `index.html`
- `css/style.css`
- `css/animations.css`
- `js/main.js`
- `js/timer.js`
- `js/ntp.js`
- `js/audio.js`
- `js/storage.js`
- `js/ui.js`

## Run locally

Open `index.html` directly in a browser or serve the folder via a static server.

## GitHub Pages

Because this is a static site, it can be published directly via GitHub Pages.

## Use Cases

TimerTool is suitable for any scenario requiring flexible, browser-based time management. Original use case: timing-critical financial trading operations; also useful for interval-based activities, reminders, and automated scheduling throughout the day.

## License & Disclaimer

This project is provided as-is without warranty or guarantee of support. Use at your own discretion.

## Credits

- Creator: INGBMS - S.M.Art
- License: CC BY-NC-SA 4.0
