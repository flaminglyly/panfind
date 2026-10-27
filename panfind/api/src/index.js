import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCloudTypes, probeUpstream, searchDemo, searchUpstream } from "./search.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PORT = Number(process.env.PORT || 8787);
const PANSOU_URL = (process.env.PANSOU_URL || "").trim();
const FORCE_DEMO = ["1", "true", "yes"].includes(String(process.env.DEMO_MODE || "").toLowerCase());

const app = express();
app.use(cors());
app.use(express.json({ limit: "64kb" }));

app.get("/api/health", async (_req, res) => {
  let upstream = null;
  if (PANSOU_URL && !FORCE_DEMO) {
    upstream = await probeUpstream(PANSOU_URL);
  }
  const liveReady = Boolean(PANSOU_URL) && !FORCE_DEMO && Boolean(upstream?.ok);
  const demoMode = FORCE_DEMO || !PANSOU_URL || !upstream?.ok;
  let modeLabel = "演示模式";
  if (FORCE_DEMO) modeLabel = "演示模式（强制 DEMO_MODE）";
  else if (!PANSOU_URL) modeLabel = "演示模式（未配置 PANSOU_URL）";
  else if (!upstream?.ok) modeLabel = "演示模式（上游不可达）";
  else modeLabel = "实时聚合（PanSou）";

  res.json({
    ok: true,
    product: "盘搜",
    demoMode,
    liveReady,
    modeLabel,
    pansouConfigured: Boolean(PANSOU_URL),
    pansouUrl: PANSOU_URL || null,
    upstreamOk: upstream ? upstream.ok : null,
    upstream: upstream?.detail ?? null,
  });
});

/**
 * GET/POST /api/search
 * Query: kw, cloud_types (comma or array)
 */
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
  let results = [];
  let demoMode = true;
  let modeLabel = "演示模式";
  let upstreamError = null;

  if (!FORCE_DEMO && PANSOU_URL) {
    try {
      results = await searchUpstream(PANSOU_URL, kw, cloudTypes);
      demoMode = false;
      modeLabel = "实时聚合（PanSou）";
    } catch (err) {
      upstreamError = err instanceof Error ? err.message : String(err);
      results = searchDemo(kw, cloudTypes);
      demoMode = true;
      modeLabel = "演示模式（上游不可用，已回退）";
    }
  } else {
    results = searchDemo(kw, cloudTypes);
    demoMode = true;
    modeLabel = FORCE_DEMO ? "演示模式（强制）" : "演示模式（未配置 PANSOU_URL）";
  }

  /** @type {import('./types.js').SearchResponse} */
  const payload = {
    query: kw,
    demoMode,
    modeLabel,
    total: results.length,
    results,
    cloudTypes,
    tookMs: Date.now() - started,
  };
  if (upstreamError) payload.upstreamError = upstreamError;
  res.json(payload);
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

// Serve built web when present
const webDist = path.join(ROOT, "web", "dist");
app.use(express.static(webDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) res.status(404).json({ error: "Web UI 未构建，请先 npm run build 或分别启动 api/web" });
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[盘搜] API http://0.0.0.0:${PORT}`);
  console.log(`[盘搜] mode=${FORCE_DEMO || !PANSOU_URL ? "demo" : "live"} PANSOU_URL=${PANSOU_URL || "(none)"}`);
});
