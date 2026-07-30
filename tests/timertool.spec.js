const { test, expect } = require("@playwright/test");
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

let server;
let appUrl;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.join(root, decodeURIComponent(pathname));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, {
        "content-type": contentTypes[path.extname(file).toLowerCase()] || "application/octet-stream",
        "last-modified": stat.mtime.toUTCString(),
        date: new Date().toUTCString(),
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      fs.createReadStream(file).pipe(res);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  appUrl = `http://127.0.0.1:${server.address().port}/index.html`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function openFresh(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    document.cookie.split(";").forEach((entry) => {
      const name = entry.split("=")[0].trim();
      if (name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });
  });
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("clock-display")?.textContent !== "--:--:--");
}

function wallPartsExpression(timezone) {
  return (tz) => {
    const values = {};
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).formatToParts(new Date()).forEach((part) => {
      if (part.type !== "literal") values[part.type] = Number(part.value);
    });
    return values;
  };
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function secondsOfDay(value) {
  const [hours, minutes, seconds] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function durationSeconds(value) {
  const [hours, minutes, seconds] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

async function configureScheduleTimer(page, index, { timezone, intervalSeconds, name }) {
  const parts = await page.evaluate(wallPartsExpression(timezone), timezone);
  const hhmm = `${pad2(parts.hour)}:${pad2(parts.minute)}`;
  const card = page.locator(".timer-card").nth(index);
  await card.locator('button[data-action="config"]').click();
  await page.fill("#config-name", name);
  await page.selectOption("#config-mode", "schedule");
  await page.fill("#config-schedule-start", hhmm);
  await page.fill("#config-interval-seconds", String(intervalSeconds));
  await page.fill("#config-offset-seconds", "0");
  await page.fill("#config-end-time", "");
  await page.fill("#config-max-triggers", "0");
  await page.uncheck("#config-autostart");
  await page.uncheck("#config-sound-enabled");
  await page.click("#modal-save-btn");
}

async function configureCountdownTimer(page, index, seconds, name) {
  const card = page.locator(".timer-card").nth(index);
  await card.locator('button[data-action="config"]').click();
  await page.fill("#config-name", name);
  await page.selectOption("#config-mode", "countdown");
  await page.fill("#config-duration-seconds", String(seconds));
  await page.uncheck("#config-sound-enabled");
  await page.click("#modal-save-btn");
}

test("sync falls back to a valid CORS time source", async ({ page }) => {
  await page.route("**/index.html?time-sync=*", (route) => route.fulfill({ status: 500, body: "fail" }));
  await page.route("https://gettimeapi.dev/v1/time?timezone=UTC", (route) => {
    route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
      body: JSON.stringify({ timestamp: Date.now() / 1000, iso8601: new Date().toISOString() }),
    });
  });
  await page.route("https://worldtimeapi.org/api/timezone/Etc/UTC", (route) => route.abort("failed"));
  await page.route("https://timeapi.io/api/Time/current/zone?timeZone=UTC", (route) => {
    route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
      body: JSON.stringify({ dateTime: new Date(Date.now() - 16 * 60 * 1000).toISOString().replace("Z", "") }),
    });
  });

  await openFresh(page);
  await page.click("#sync-now-btn");
  await expect(page.locator("#sync-status")).toContainText("Time source: NTP");
  await expect(page.locator("#sync-status")).not.toContainText("unreachable");
});


test("default schedule offset is shown as alarm time, not hidden in remaining time", async ({ page }) => {
  await openFresh(page);
  await page.selectOption("#timezone-select", "Europe/Berlin");
  await page.locator(".timer-card").nth(0).locator('button[data-action="start-stop"]').click();
  await page.waitForTimeout(700);

  const clock = await page.locator("#clock-display").textContent();
  const card = page.locator(".timer-card").nth(0);
  const display = await card.locator('[data-role="timer-display"]').textContent();
  const meta = await card.locator('[data-role="timer-meta"]').textContent();
  const nextAlarm = /Next alarm: (\d{2}:\d{2}:\d{2})/.exec(meta)?.[1];
  const slot = /Slot: (\d{2}:\d{2}:\d{2})/.exec(meta)?.[1];

  expect(nextAlarm).toBeTruthy();
  expect(slot).toBeTruthy();
  expect((secondsOfDay(slot) - secondsOfDay(nextAlarm) + 86400) % 86400).toBe(2);

  const expected = (secondsOfDay(nextAlarm) - secondsOfDay(clock) + 86400) % 86400;
  const actual = durationSeconds(display);
  expect(actual).toBeGreaterThanOrEqual(expected);
  expect(actual).toBeLessThanOrEqual(expected + 1);
});
test("multiple schedule timers align remaining time with selected timezone clock", async ({ page }) => {
  const timezone = "America/New_York";
  await openFresh(page);
  await page.selectOption("#timezone-select", timezone);

  await configureScheduleTimer(page, 0, { timezone, intervalSeconds: 60, name: "NY 1m" });
  await configureScheduleTimer(page, 1, { timezone, intervalSeconds: 120, name: "NY 2m" });
  await configureScheduleTimer(page, 2, { timezone, intervalSeconds: 180, name: "NY 3m" });
  await configureCountdownTimer(page, 3, 6, "Countdown 6s");
  await page.click("#start-all-btn");
  await page.waitForTimeout(900);

  const clock = await page.locator("#clock-display").textContent();
  for (let index = 0; index < 3; index += 1) {
    const card = page.locator(".timer-card").nth(index);
    const display = await card.locator('[data-role="timer-display"]').textContent();
    const meta = await card.locator('[data-role="timer-meta"]').textContent();
    expect(display).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(Number(display.split(":")[2])).toBeLessThan(60);
    const next = /Next alarm: (\d{2}:\d{2}:\d{2})/.exec(meta)?.[1];
    expect(next).toBeTruthy();
    const expected = (secondsOfDay(next) - secondsOfDay(clock) + 86400) % 86400;
    const actual = durationSeconds(display);
    expect(actual).toBeGreaterThanOrEqual(expected - 2);
    expect(actual).toBeLessThanOrEqual(expected + 1);
  }

  const countdownBefore = durationSeconds(await page.locator(".timer-card").nth(3).locator('[data-role="timer-display"]').textContent());
  await page.waitForTimeout(2200);
  const countdownAfter = durationSeconds(await page.locator(".timer-card").nth(3).locator('[data-role="timer-display"]').textContent());
  expect(countdownAfter).toBeLessThan(countdownBefore);
});

test("running timers continue updating after a successful sync correction", async ({ page }) => {
  let skewMs = 0;
  await page.route("**/index.html?time-sync=*", (route) => {
    route.fulfill({ status: 200, headers: { date: new Date(Date.now() + skewMs).toUTCString() }, body: "" });
  });
  await openFresh(page);
  await page.selectOption("#timezone-select", "Europe/Berlin");
  await configureScheduleTimer(page, 0, { timezone: "Europe/Berlin", intervalSeconds: 90, name: "Sync 90s" });
  await page.locator(".timer-card").nth(0).locator('button[data-action="start-stop"]').click();
  await page.waitForTimeout(600);
  const before = durationSeconds(await page.locator(".timer-card").nth(0).locator('[data-role="timer-display"]').textContent());
  skewMs = 3000;
  await page.click("#sync-now-btn");
  await expect(page.locator("#sync-status")).toContainText("Time source: NTP");
  await page.waitForTimeout(2500);
  const after = durationSeconds(await page.locator(".timer-card").nth(0).locator('[data-role="timer-display"]').textContent());
  expect(after).toBeLessThan(before - 1);
});

test("alarm plus backward sync does not move the displayed clock backwards", async ({ page }) => {
  let skewBack = false;
  await page.route("**/index.html?time-sync=*", (route) => {
    const epoch = Date.now() - (skewBack ? 4000 : 0);
    route.fulfill({ status: 200, headers: { date: new Date(epoch).toUTCString() }, body: "" });
  });
  await openFresh(page);
  await configureCountdownTimer(page, 0, 2, "Alarm 2s");
  await page.locator(".timer-card").nth(0).locator('button[data-action="start-stop"]').click();

  const samples = [];
  const sampler = setInterval(async () => {
    try {
      samples.push(await page.locator("#clock-display").textContent());
    } catch (_) {
      // Page may have closed after assertion failure.
    }
  }, 200);

  await page.waitForTimeout(1400);
  skewBack = true;
  await page.click("#sync-now-btn");
  await expect(page.locator("#toast-container")).toContainText("triggered", { timeout: 5000 });
  await page.waitForTimeout(1400);
  clearInterval(sampler);

  for (let index = 1; index < samples.length; index += 1) {
    expect(secondsOfDay(samples[index])).toBeGreaterThanOrEqual(secondsOfDay(samples[index - 1]));
  }
});
