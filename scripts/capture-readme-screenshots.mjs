/**
 * Снимки живого UI для README.
 * Требует: npm run dev на :3000 и локальный seed (manager@local.test).
 *
 *   node scripts/capture-readme-screenshots.mjs
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(
  process.env.PLAYWRIGHT_REQUIRE || "/tmp/pw-crm-shots/package.json",
);
const { chromium } = require("playwright");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/screenshots");
const BASE = process.env.CRM_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.CRM_EMAIL || "manager@local.test";
const PASSWORD = process.env.CRM_PASSWORD || "manager123";

mkdirSync(OUT, { recursive: true });

async function hideDevChrome(page) {
  await page.addStyleTag({
    content: `nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }`,
  }).catch(() => {});
}

async function settle(page, ms = 900) {
  await hideDevChrome(page);
  await page.waitForTimeout(ms);
  await page
    .locator(".animate-pulse")
    .first()
    .waitFor({ state: "hidden", timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(250);
}

async function shot(page, name) {
  const file = join(OUT, name);
  await page.screenshot({
    path: file,
    type: "jpeg",
    quality: 82,
    animations: "disabled",
  });
  console.log("  wrote", name);
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await settle(page, 1100);
}

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
  locale: "ru-RU",
});
await context.addInitScript(() => {
  localStorage.setItem("bs-crm-theme", "dark");
  localStorage.setItem("bs-crm-layout", "desktop");
  document.cookie = "bs-crm-layout=desktop; path=/; max-age=31536000; SameSite=Lax";
});

const page = await context.newPage();

try {
  console.log("login…");
  await goto(page, "/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await shot(page, "01-login.jpg");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(/\/calendar/, { timeout: 20000 });
  await settle(page, 1800);
  await shot(page, "02-calendar.jpg");

  console.log("quotes…");
  await goto(page, "/quotes");
  await settle(page, 1200);
  await shot(page, "03-quotes.jpg");

  const quotes = await page.evaluate(async () => {
    const res = await fetch("/api/quotes");
    if (!res.ok) return [];
    return res.json();
  });
  const list = Array.isArray(quotes) ? quotes : [];
  const best =
    [...list].sort(
      (a, b) => (b._count?.blocks || 0) - (a._count?.blocks || 0),
    )[0] || list[0];

  if (best?.id) {
    console.log("quote editor", best.eventName || best.proposalNumber, best.id);
    await goto(page, `/quotes/${best.id}?tab=quote`);
    await page.getByRole("tab", { name: "Смета" }).waitFor({ timeout: 15000 });
    await settle(page, 1400);
    await shot(page, "04-quote-editor.jpg");

    await page.getByRole("tab", { name: "Основное" }).click();
    await settle(page, 700);
    await shot(page, "05-event-card.jpg");

    await page.getByRole("tab", { name: "Команда" }).click();
    await settle(page, 900);
    await shot(page, "06-quote-team.jpg");

    await page.getByRole("tab", { name: "Спека" }).click();
    await settle(page, 900);
    await shot(page, "07-quote-spec.jpg");
  } else {
    console.warn("no quotes in local DB — skip editor shots");
  }

  console.log("roster / catalog / payroll…");
  await goto(page, "/roster");
  await settle(page, 1600);
  await shot(page, "08-roster.jpg");

  await goto(page, "/catalog");
  await settle(page, 1400);
  await shot(page, "09-catalog.jpg");

  await goto(page, "/payroll");
  await settle(page, 1400);
  await shot(page, "10-payroll.jpg");

  console.log("finance / database…");
  await goto(page, "/statistics");
  await settle(page, 1800);
  await shot(page, "11-statistics.jpg");

  await goto(page, "/unpaid");
  await settle(page, 1200);
  await shot(page, "12-unpaid.jpg");

  await goto(page, "/calculations");
  await settle(page, 1200);
  await shot(page, "13-calculations.jpg");

  await goto(page, "/clients");
  await settle(page, 1100);
  await shot(page, "14-clients.jpg");

  await goto(page, "/venues");
  await settle(page, 900);
  await shot(page, "15-venues.jpg");

  await goto(page, "/repairs");
  await settle(page, 1100);
  await shot(page, "16-repairs.jpg");

  await goto(page, "/legal-entities");
  await settle(page, 900);
  await shot(page, "17-legal-entities.jpg");

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(`${BASE}/calendar`, { waitUntil: "domcontentloaded" });
  await settle(mobile, 1600);
  await mobile.screenshot({
    path: join(OUT, "18-calendar-mobile.jpg"),
    type: "jpeg",
    quality: 82,
    animations: "disabled",
  });
  console.log("  wrote 18-calendar-mobile.jpg");
  await mobile.close();

  console.log("done →", OUT);
} finally {
  await browser.close();
}
