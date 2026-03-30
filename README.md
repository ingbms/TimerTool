# TimerTool

Browser-only timer management tool with up to 5 configurable timers.

## Features

- NTP time sync on startup and periodically (default every 30 minutes)
- Automatic fallback to system time if NTP is unavailable or offline
- 0.1 second display precision
- Drift-resistant timing based on absolute timestamps
- Up to 5 timers
- Modes:
  - Countdown
  - Fixed base time + repeating interval + optional offset before trigger
- Optional per-timer sound config:
  - Beep frequency, waveform, volume
  - Burst duration, repeat count, pause between bursts
  - Optional audio file URL playback
- Global controls:
  - Start all, pause all, resume all, reset all (with confirmation)
- Persistence:
  - Cookie-based auto-save
  - JSON export and import

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

## Credits

- Creator: INGBMS - S.M.Art
- License: CC BY-NC-SA 4.0
