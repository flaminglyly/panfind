import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const OUT = process.env.OUT_DIR || "/cursor/stores/self/media/pc-search-weibo";
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
  await page.waitForFunction(() => (document.body?.innerText || "").includes("微博"), { timeout: 20000 });
  await page.screenshot({
    path: path.join(OUT, "01-home-weibo-ready.webp"),
    type: "webp",
    quality: 82,
  });
  console.log("home", fs.statSync(path.join(OUT, "01-home-weibo-ready.webp")).size);

  await page.goto(`${BASE}/?kw=${encodeURIComponent("三体")}`, {
    waitUntil: "networkidle2",
    timeout: 90000,
  });
  await page.waitForFunction(() => document.querySelectorAll(".result").length > 0, { timeout: 90000 });
  await page.waitForFunction(() => (document.body?.innerText || "").includes("微博"), { timeout: 20000 });
  await page.screenshot({
    path: path.join(OUT, "02-santi-with-weibo.webp"),
    type: "webp",
    quality: 82,
  });
  console.log("search", fs.statSync(path.join(OUT, "02-santi-with-weibo.webp")).size);

  // Highlight weibo rows if present by scrolling to first weibo source
  const found = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".result")].find((el) =>
      (el.innerText || "").includes("weibo:")
    );
    if (row) {
      row.scrollIntoView({ block: "center" });
      row.style.outline = "2px solid #0f766e";
      return true;
    }
    return false;
  });
  if (found) {
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({
      path: path.join(OUT, "03-weibo-source-rows.webp"),
      type: "webp",
      quality: 82,
    });
    console.log("weibo-rows", fs.statSync(path.join(OUT, "03-weibo-source-rows.webp")).size);
  } else {
    console.log("no weibo rows in first page of ranked list (may be truncated by cap)");
  }
} finally {
  await browser.close();
}
