import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const OUT = process.env.OUT_DIR || "/cursor/stores/self/media/pc-search-multi";
const BASE = process.env.WEB_BASE || "http://127.0.0.1:5173";
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome-stable";
fs.mkdirSync(OUT, { recursive: true });

const shots = [
  { file: "01-home-multi.webp", url: `${BASE}/`, wait: "home" },
  { file: "02-santi-multi.webp", url: `${BASE}/?kw=${encodeURIComponent("三体")}`, wait: "results" },
  { file: "03-sudu-multi.webp", url: `${BASE}/?kw=${encodeURIComponent("速度与激情")}`, wait: "results" },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,1100"],
  defaultViewport: { width: 1440, height: 1100 },
});

try {
  for (const shot of shots) {
    const page = await browser.newPage();
    await page.goto(shot.url, { waitUntil: "networkidle2", timeout: 90000 });
    if (shot.wait === "home") {
      await page.waitForFunction(() => (document.body?.innerText || "").includes("多源") || (document.body?.innerText || "").includes("实时"), {
        timeout: 20000,
      });
    } else {
      await page.waitForFunction(() => document.querySelectorAll(".result").length >= 3, { timeout: 90000 });
    }
    const mode = await page.evaluate(() => document.querySelector(".mode-badge")?.textContent?.trim() || "");
    const n = await page.$$eval(".result", (els) => els.length);
    console.log(shot.file, mode, "results=", n);
    const dest = path.join(OUT, shot.file);
    await page.screenshot({ path: dest, type: "webp", quality: 82 });
    console.log("wrote", dest, fs.statSync(dest).size);
    await page.close();
  }
} finally {
  await browser.close();
}
