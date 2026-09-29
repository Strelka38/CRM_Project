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

const HIDE_DEV = `
nextjs-portal,
[data-nextjs-toast],
#__next-build-watcher,
[data-next-badge-root],
button[aria-label="Open Next.js Dev Tools"] {
  display: none !important;
}
`;

async function hideDevChrome(page) {
  await page.addStyleTag({ content: HIDE_DEV }).catch(() => {});
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
  await hideDevChrome(page);
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
  await page.goto(`${BASE}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await settle(page, 1100);
}

async function login(page) {
  await goto(page, "/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
}

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
});

const desktop = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
  locale: "ru-RU",
});
await desktop.addInitScript(() => {
  localStorage.setItem("bs-crm-theme", "dark");
  localStorage.setItem("bs-crm-layout", "desktop");
  localStorage.setItem("calendar.dashCollapsed", "1");
  document.cookie = "bs-crm-layout=desktop; path=/; max-age=31536000; SameSite=Lax";
});

const page = await desktop.newPage();

try {
  console.log("login…");
  await login(page);
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

  await goto(page, "/settings/access");
  await settle(page, 1200);
  await shot(page, "24-role-access.jpg");

  const storage = await desktop.storageState();
  const mobile = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
    locale: "ru-RU",
    storageState: storage,
  });
  await mobile.addInitScript(() => {
    localStorage.setItem("bs-crm-theme", "dark");
    localStorage.setItem("bs-crm-layout", "mobile");
    document.cookie =
      "bs-crm-layout=mobile; path=/; max-age=31536000; SameSite=Lax";
  });

  const phone = await mobile.newPage();
  console.log("mobile…");
  await goto(phone, "/calendar");
  await settle(phone, 1800);
  await shot(phone, "18-calendar-mobile.jpg");

  await goto(phone, "/notifications");
  await settle(phone, 1200);
  await shot(phone, "19-notifications-mobile.jpg");

  await goto(phone, "/payroll");
  await settle(phone, 1400);
  await shot(phone, "20-payroll-mobile.jpg");

  await goto(phone, "/quotes");
  await settle(phone, 1200);
  await shot(phone, "21-quotes-mobile.jpg");

  if (best?.id) {
    await goto(phone, `/quotes/${best.id}?tab=quote`);
    await phone.getByRole("tab", { name: "Смета" }).waitFor({ timeout: 15000 });
    await settle(phone, 1400);
    await shot(phone, "22-quote-editor-mobile.jpg");

    const summary = phone.getByRole("button", { name: "Сводная" });
    if (await summary.count()) {
      await summary.click();
      await settle(phone, 800);
      await shot(phone, "23-quote-summary-mobile.jpg");
    }
  }

  await phone.close();
  await mobile.close();

  console.log("done →", OUT);
} finally {
  await browser.close();
}
