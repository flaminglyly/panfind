import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  publicWeiboConfigView,
  readWeiboFileConfig,
  uidsFromFile,
  weiboConfigPath,
  writeWeiboFileConfig,
} from "./config/weibo-store.js";
import { normalizeCloudTypes, probeUpstream } from "./search.js";
import { searchMulti } from "./sources/aggregate.js";
import { hunhepanEndpoints } from "./sources/hunhepan.js";
import { resolveWeiboConfig, weiboStatusSummary } from "./sources/weibo.js";
import { getVersionInfo, getVersionSummary } from "./version.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PORT = Number(process.env.PORT || 8787);
const PANSOU_URL = (process.env.PANSOU_URL || "").trim();
const FORCE_DEMO = ["1", "true", "yes"].includes(String(process.env.DEMO_MODE || "").toLowerCase());
const ENABLE_EXT = !["0", "false", "no"].includes(String(process.env.ENABLE_EXT_SOURCES ?? "1").toLowerCase());
const VERSION = getVersionSummary();

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", async (_req, res) => {
  let upstream = null;
  if (PANSOU_URL && !FORCE_DEMO) {
    upstream = await probeUpstream(PANSOU_URL);
  }
  const pansouOk = Boolean(PANSOU_URL) && !FORCE_DEMO && Boolean(upstream?.ok);
  const weibo = weiboStatusSummary();
  const liveReady = !FORCE_DEMO && (pansouOk || ENABLE_EXT || (weibo.enabled && (weibo.configured || weibo.allowDemo)));
  const demoMode = FORCE_DEMO;
  let modeLabel = "演示模式";
  if (FORCE_DEMO) modeLabel = "演示模式（强制 DEMO_MODE）";
  else {
    const bits = [];
    if (pansouOk) bits.push("PanSou");
    if (ENABLE_EXT) bits.push("混合盘系");
    if (weibo.enabled && weibo.configured) bits.push("微博");
    else if (weibo.enabled && weibo.allowDemo) bits.push("微博演示");
    modeLabel = bits.length ? `多源实时（${bits.join(" + ")}）` : "演示模式（未配置上游）";
  }

  res.json({
    ok: true,
    product: "盘搜",
    version: VERSION.version,
    buildTime: VERSION.buildTime,
    channel: VERSION.channel,
    demoMode,
    liveReady,
    modeLabel,
    pansouConfigured: Boolean(PANSOU_URL),
    pansouUrl: PANSOU_URL || null,
    upstreamOk: upstream ? upstream.ok : null,
    upstream: upstream?.detail ?? null,
    extSourcesEnabled: ENABLE_EXT,
    extSources: ENABLE_EXT ? hunhepanEndpoints() : [],
    weibo,
  });
});

/** 版本摘要 */
app.get("/api/version", (_req, res) => {
  res.json({ ok: true, ...getVersionSummary() });
});

/** 变更说明（中文 changelog） */
app.get("/api/changelog", (_req, res) => {
  const info = getVersionInfo();
  res.json({
    ok: true,
    version: info.version,
    buildTime: info.buildTime,
    name: info.name,
    changelog: info.changelog,
  });
});

/** 产品内微博配置（脱敏）；Cookie 永不回传明文 */
app.get("/api/config/weibo", (_req, res) => {
  const file = readWeiboFileConfig();
  const resolved = resolveWeiboConfig();
  res.json({ ok: true, config: publicWeiboConfigView(file, resolved) });
});

/**
 * 保存微博配置到本机 .data/weibo-config.json（gitignored）。
 * body: {
 *   enabled, cookie?, cookieWeiboCom?, cookieMWeibo?,
 *   clearCookie?, clearCookieWeiboCom?, clearCookieMWeibo?,
 *   bloggers?, uids?, fetchComments?, maxPages?, allowDemo?
 * }
 */
app.put("/api/config/weibo", (req, res) => {
  try {
    const body = req.body || {};
    const prev = readWeiboFileConfig();
    /** @type {import('./config/weibo-store.js').WeiboFileConfig} */
    const next = { ...prev };

    if (typeof body.enabled === "boolean") next.enabled = body.enabled;
    if (typeof body.fetchComments === "boolean") next.fetchComments = body.fetchComments;
    if (typeof body.allowDemo === "boolean") next.allowDemo = body.allowDemo;
    if (body.maxPages !== undefined) {
      const n = Number(body.maxPages);
      if (Number.isFinite(n)) next.maxPages = Math.min(5, Math.max(1, n));
    }

    // Dual Cookie slots (v0.3.3+)
    if (body.clearCookieWeiboCom === true) {
      next.cookieWeiboCom = "";
    } else if (typeof body.cookieWeiboCom === "string" && body.cookieWeiboCom.trim()) {
      next.cookieWeiboCom = body.cookieWeiboCom.trim();
    }
    if (body.clearCookieMWeibo === true) {
      next.cookieMWeibo = "";
    } else if (typeof body.cookieMWeibo === "string" && body.cookieMWeibo.trim()) {
      next.cookieMWeibo = body.cookieMWeibo.trim();
    }

    // Legacy single cookie / clear-all
    if (body.clearCookie === true) {
      next.cookie = "";
      if (body.clearCookieWeiboCom !== false && body.cookieWeiboCom === undefined) {
        next.cookieWeiboCom = "";
      }
      if (body.clearCookieMWeibo !== false && body.cookieMWeibo === undefined) {
        next.cookieMWeibo = "";
      }
    } else if (typeof body.cookie === "string" && body.cookie.trim()) {
      const c = body.cookie.trim();
      next.cookie = c;
      // Seed empty dedicated slots for migration (do not overwrite existing slots)
      const hasCom = typeof next.cookieWeiboCom === "string" && next.cookieWeiboCom.trim();
      const hasM = typeof next.cookieMWeibo === "string" && next.cookieMWeibo.trim();
      if (!hasCom && body.cookieWeiboCom === undefined) next.cookieWeiboCom = c;
      if (!hasM && body.cookieMWeibo === undefined) next.cookieMWeibo = c;
    }

    if (Array.isArray(body.bloggers)) {
      next.bloggers = body.bloggers
        .map((b) => {
          const uidMatch = String(b?.uid || "").match(/(\d{5,})/);
          if (!uidMatch) return null;
          return {
            uid: uidMatch[1],
            nick: String(b?.nick || "").trim().slice(0, 40),
          };
        })
        .filter(Boolean);
      next.uids = next.bloggers.map((b) => b.uid);
    } else if (Array.isArray(body.uids)) {
      next.uids = body.uids
        .map((s) => {
          const m = String(s).match(/(\d{5,})/);
          return m ? m[1] : "";
        })
        .filter(Boolean);
      next.bloggers = next.uids.map((uid) => ({ uid, nick: "" }));
    }

    const saved = writeWeiboFileConfig(next);
    const resolved = resolveWeiboConfig();
    res.json({
      ok: true,
      config: publicWeiboConfigView(saved, resolved),
      message: `已保存到 ${weiboConfigPath()}`,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

async function handleSearch(req, res) {
  const started = Date.now();
  const body = req.method === "GET" ? req.query : req.body || {};
  const kw = String(body.kw || body.q || "").trim();
  if (!kw) {
    return res.status(400).json({ error: "缺少关键词 kw", code: "MISSING_KW" });
  }
  if (kw.length > 80) {
    return res.status(400).json({ error: "关键词过长", code: "KW_TOO_LONG" });
  }

  const cloudTypes = normalizeCloudTypes(body.cloud_types || body.cloudTypes);
  const enableExt =
    body.enable_ext === undefined
      ? ENABLE_EXT
      : !["0", "false", "no"].includes(String(body.enable_ext).toLowerCase());
  const resolvedWeibo = resolveWeiboConfig();
  const enableWeibo =
    body.enable_weibo === undefined
      ? resolvedWeibo.enabled
      : !["0", "false", "no"].includes(String(body.enable_weibo).toLowerCase());

  const { results, demoMode, modeLabel, sourceStats } = await searchMulti({
    kw,
    cloudTypes,
    pansouUrl: PANSOU_URL,
    forceDemo: FORCE_DEMO,
    enableExt,
    enableWeibo,
  });

  res.json({
    query: kw,
    demoMode,
    modeLabel,
    total: results.length,
    results,
    cloudTypes,
    tookMs: Date.now() - started,
    sourceStats,
  });
}

app.get("/api/search", (req, res) => {
  handleSearch(req, res).catch((e) => {
    res.status(500).json({ error: e.message || "search failed" });
  });
});

app.post("/api/search", (req, res) => {
  handleSearch(req, res).catch((e) => {
    res.status(500).json({ error: e.message || "search failed" });
  });
});

const webDist = path.join(ROOT, "web", "dist");
app.use(express.static(webDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) res.status(404).json({ error: "Web UI 未构建，请先 npm run build 或分别启动 api/web" });
  });
});

app.listen(PORT, "0.0.0.0", () => {
  const w = resolveWeiboConfig();
  console.log(`[盘搜] API http://0.0.0.0:${PORT} v${VERSION.version} (${VERSION.buildTime})`);
  console.log(
    `[盘搜] PANSOU_URL=${PANSOU_URL || "(none)"} EXT=${ENABLE_EXT} WEIBO=${w.enabled} mode=${w.searchModeHint} DEMO=${FORCE_DEMO}`
  );
  console.log(`[盘搜] 微博配置文件 ${weiboConfigPath()}（UIDs 来自文件=${uidsFromFile(readWeiboFileConfig()).length}）`);
});
