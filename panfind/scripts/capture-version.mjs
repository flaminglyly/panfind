import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const OUT = process.env.OUT_DIR || "/cursor/stores/self/media/pc-search-version";
const BASE = process.env.WEB_BASE || "http://127.0.0.1:5173";
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome-stable";
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,1100"],
  defaultViewport: { width: 1440, height: 1100 },
});

try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(
    () => (document.body?.innerText || "").includes("v0.") || (document.body?.innerText || "").includes("变更说明"),
    { timeout: 20000 }
  );
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({
    path: path.join(OUT, "01-footer-version.webp"),
    type: "webp",
    quality: 82,
  });
  console.log("01", fs.statSync(path.join(OUT, "01-footer-version.webp")).size);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForSelector("button.settings-btn", { timeout: 10000 });
  // click 关于
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      (b.textContent || "").includes("关于")
    );
    if (btn) btn.click();
  });
  await page.waitForSelector(".about-panel, .changelog-list", { timeout: 15000 });
  await page.waitForFunction(
    () => (document.body?.innerText || "").includes("变更说明") || (document.body?.innerText || "").includes("0.3.0"),
    { timeout: 15000 }
  );
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({
    path: path.join(OUT, "02-changelog-drawer.webp"),
    type: "webp",
    quality: 82,
  });
  console.log("02", fs.statSync(path.join(OUT, "02-changelog-drawer.webp")).size);
} finally {
  await browser.close();
}
