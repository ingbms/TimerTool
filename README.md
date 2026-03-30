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
