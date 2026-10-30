import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const OUT = process.env.OUT_DIR || "/cursor/stores/self/media/pc-search-weibo-ui";
const BASE = process.env.WEB_BASE || "http://127.0.0.1:5173";
const API = process.env.API_BASE || "http://127.0.0.1:8787";
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome-stable";
fs.mkdirSync(OUT, { recursive: true });

// Seed product config (demo) so settings + results show weibo provenance
const seed = await fetch(`${API}/api/config/weibo`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    enabled: true,
    allowDemo: true,
    fetchComments: true,
    maxPages: 2,
    bloggers: [
      { uid: "10001", nick: "资源菌Demo" },
      { uid: "5487050770", nick: "样例资源博主" },
    ],
  }),
}).then((r) => r.json());
console.log("seed", seed.ok, seed.config?.searchMode, seed.config?.uidCount ?? seed.config?.uids?.length);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,1100"],
  defaultViewport: { width: 1440, height: 1100 },
});

try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector(".settings-btn", { timeout: 20000 });
  await page.screenshot({
    path: path.join(OUT, "01-home-settings-btn.webp"),
    type: "webp",
    quality: 82,
  });
  console.log("01", fs.statSync(path.join(OUT, "01-home-settings-btn.webp")).size);

  await page.click(".settings-btn");
  await page.waitForSelector(".settings-panel", { timeout: 15000 });
  await page.waitForFunction(
    () => (document.body?.innerText || "").includes("资源博主") || (document.body?.innerText || "").includes("Cookie"),
    { timeout: 15000 }
  );
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({
    path: path.join(OUT, "02-weibo-settings-panel.webp"),
    type: "webp",
    quality: 82,
  });
  console.log("02", fs.statSync(path.join(OUT, "02-weibo-settings-panel.webp")).size);

  await page.click(".settings-close");
  await page.goto(`${BASE}/?kw=${encodeURIComponent("三体")}`, {
    waitUntil: "networkidle2",
    timeout: 90000,
  });
  await page.waitForFunction(() => document.querySelectorAll(".result").length > 0, { timeout: 90000 });
  await page.waitForFunction(
    () => document.querySelector(".weibo-origin") || (document.body?.innerText || "").includes("微博来源"),
    { timeout: 30000 }
  );
  await page.evaluate(() => {
    const row = document.querySelector(".result-weibo") || document.querySelector(".weibo-origin")?.closest(".result");
    if (row) {
      row.scrollIntoView({ block: "center" });
      row.style.outline = "2px solid #c53030";
    }
  });
  await new Promise((r) => setTimeout(r, 350));
  await page.screenshot({
    path: path.join(OUT, "03-weibo-origin-on-results.webp"),
    type: "webp",
    quality: 82,
  });
  console.log("03", fs.statSync(path.join(OUT, "03-weibo-origin-on-results.webp")).size);
} finally {
  await browser.close();
}
