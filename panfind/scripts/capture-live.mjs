import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const OUT = process.env.OUT_DIR || "/cursor/stores/self/media/pc-search-live";
const BASE = process.env.WEB_BASE || "http://127.0.0.1:5173";
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome-stable";

fs.mkdirSync(OUT, { recursive: true });

const shots = [
  { file: "01-home-live.webp", url: `${BASE}/`, wait: "home" },
  { file: "02-search-sudu-live.webp", url: `${BASE}/?kw=${encodeURIComponent("速度与激情")}`, wait: "results" },
  { file: "03-search-santi-live.webp", url: `${BASE}/?kw=${encodeURIComponent("三体")}`, wait: "results" },
  { file: "04-search-fanren-live.webp", url: `${BASE}/?kw=${encodeURIComponent("凡人修仙传")}`, wait: "results" },
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
    await page.goto(shot.url, { waitUntil: "networkidle2", timeout: 60000 });
    if (shot.wait === "home") {
      await page.waitForFunction(
        () => {
          const t = document.body?.innerText || "";
          return t.includes("实时聚合") || t.includes("演示模式");
        },
        { timeout: 15000 }
      );
    } else {
      await page.waitForFunction(
        () => {
          const t = document.body?.innerText || "";
          return t.includes("实时聚合（PanSou）") && document.querySelectorAll(".result").length > 0;
        },
        { timeout: 60000 }
      );
      // ensure not demo urls in first results
      const bad = await page.evaluate(() =>
        [...document.querySelectorAll(".result-url")].slice(0, 5).some((el) => /demo/i.test(el.textContent || ""))
      );
      if (bad) throw new Error(`Demo URLs found in ${shot.file}`);
    }
    const mode = await page.evaluate(() => document.querySelector(".mode-badge")?.textContent?.trim() || "");
    console.log(shot.file, "mode=", mode, "results=", await page.$$eval(".result", (els) => els.length));
    const dest = path.join(OUT, shot.file);
    await page.screenshot({ path: dest, type: "webp", quality: 82, fullPage: false });
    console.log("wrote", dest, fs.statSync(dest).size);
    await page.close();
  }
} finally {
  await browser.close();
}
