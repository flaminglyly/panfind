import { DEMO_SHARES } from "./fixtures.js";
import { keywordMatch, scoreItem } from "./rank.js";

/** @typedef {'baidu'|'quark'|'xunlei'|'uc'} CloudType */

/** All supported pan types (empty selection / omitted param → this set). */
export const ALL_CLOUD_TYPES = /** @type {CloudType[]} */ (["baidu", "quark", "xunlei", "uc"]);

const ALLOWED = new Set(ALL_CLOUD_TYPES);

/** Upstream aliases → product cloudType (lowercase keys). */
const TYPE_ALIASES = {
  baidu: "baidu",
  bd: "baidu",
  bdy: "baidu",
  baiduyun: "baidu",
  quark: "quark",
  kuake: "quark",
  kk: "quark",
  xunlei: "xunlei",
  thunder: "xunlei",
  xl: "xunlei",
  xly: "xunlei",
  uc: "uc",
  ucpan: "uc",
  uck: "uc",
};

/**
 * Map raw type label + URL → product CloudType or "".
 * @param {string} raw
 * @param {string} [url]
 * @returns {CloudType|''}
 */
export function coerceCloudType(raw, url = "") {
  const t = String(raw || "")
    .trim()
    .toLowerCase();
  if (t && TYPE_ALIASES[t] && ALLOWED.has(TYPE_ALIASES[t])) {
    return /** @type {CloudType} */ (TYPE_ALIASES[t]);
  }
  if (ALLOWED.has(t)) return /** @type {CloudType} */ (t);
  const u = String(url || "").toLowerCase();
  if (/pan\.baidu\.com|yun\.baidu\.com/.test(u)) return "baidu";
  if (/pan\.quark\.cn/.test(u)) return "quark";
  if (/pan\.xunlei\.com/.test(u)) return "xunlei";
  if (/(?:drive|pan)\.uc\.cn/.test(u)) return "uc";
  return "";
}

/**
 * @param {import('./types.js').SearchHit[]} hits
 * @returns {Record<string, number>}
 */
export function countByCloudType(hits) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const h of hits || []) {
    const t = h?.cloudType || "unknown";
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}

/**
 * @param {Record<string, number>} byType
 * @param {CloudType[]} requested
 * @returns {string[]}
 */
export function missingRequestedTypes(byType, requested) {
  const req = requested?.length ? requested : ALL_CLOUD_TYPES;
  return req.filter((t) => !byType?.[t]);
}

/**
 * Parse client `cloud_types` / `cloudTypes`.
 * Empty / missing / invalid-only → all types (UX: none selected = all).
 * Non-empty selection → strict allow-list.
 * @param {string | string[] | undefined} raw
 * @returns {CloudType[]}
 */
export function normalizeCloudTypes(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === "string" && raw.trim()) list = raw.split(/[,|]/);
  const cleaned = [
    ...new Set(
      list
        .map((s) => String(s).trim().toLowerCase())
        .filter((s) => ALLOWED.has(s))
    ),
  ];
  return /** @type {CloudType[]} */ (cleaned.length ? cleaned : [...ALL_CLOUD_TYPES]);
}

/**
 * Hard drop hits whose cloudType is outside the allow-list.
 * @param {import('./types.js').SearchHit[]} hits
 * @param {CloudType[]} cloudTypes
 */
export function filterHitsByCloudTypes(hits, cloudTypes) {
  const typeSet = new Set(cloudTypes?.length ? cloudTypes : ALL_CLOUD_TYPES);
  return (hits || []).filter((h) => h && typeSet.has(h.cloudType));
}

/**
 * Demo-mode search over fixtures with PanSou-style ranking.
 * @param {string} kw
 * @param {CloudType[]} cloudTypes
 */
export function searchDemo(kw, cloudTypes) {
  const query = (kw || "").trim();
  const typeSet = new Set(cloudTypes?.length ? cloudTypes : ALL_CLOUD_TYPES);
  const scored = DEMO_SHARES.filter((row) => typeSet.has(row.cloudType))
    .map((row) => {
      const text = [row.title, ...(row.keywords || [])].join(" ");
      const match = keywordMatch(text, query);
      const score = scoreItem(row, query);
      return {
        id: `demo-${row.cloudType}-${hash(row.url)}`,
        title: row.title,
        url: row.url,
        password: row.password || "",
        cloudType: row.cloudType,
        score,
        source: row.source,
        datetime: row.datetime,
        note: row.title,
        _match: match,
      };
    })
    .filter((r) => {
      if (!query) return true;
      // Require meaningful keyword signal (not source/freshness alone)
      return r._match >= 0.35 || keywordLoose(r.title, query);
    })
    .sort((a, b) => b.score - a.score)
    .map(({ _match, ...rest }) => rest);

  return scored;
}

/**
 * @param {string} title
 * @param {string} query
 */
function keywordLoose(title, query) {
  const t = title.toLowerCase();
  const q = query.toLowerCase();
  if (t.includes(q)) return true;
  for (let i = 0; i < q.length - 1; i++) {
    if (t.includes(q.slice(i, i + 2))) return true;
  }
  return false;
}

/**
 * @param {string} s
 */
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Probe PanSou health. Returns { ok, detail } without throwing.
 * @param {string} baseUrl
 * @param {number} timeoutMs
 */
export async function probeUpstream(baseUrl, timeoutMs = 4000) {
  const root = baseUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${root}/api/health`, { signal: controller.signal });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const body = await res.json().catch(() => ({}));
    return { ok: true, detail: body };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Optional PanSou /api/health snapshot (plugin_count etc.).
 * @param {string} baseUrl
 * @param {number} [timeoutMs]
 */
export async function fetchPansouHealth(baseUrl, timeoutMs = 2500) {
  const probed = await probeUpstream(baseUrl, timeoutMs);
  if (!probed.ok) return { ok: false, detail: probed.detail };
  const d = probed.detail && typeof probed.detail === "object" ? probed.detail : {};
  return {
    ok: true,
    pluginCount: Number(d.plugin_count ?? d.plugins?.length ?? 0),
    pluginsEnabled: d.plugins_enabled !== false,
    plugins: Array.isArray(d.plugins) ? d.plugins : [],
    channelsCount: Number(d.channels_count ?? (Array.isArray(d.channels) ? d.channels.length : 0)),
  };
}

/**
 * Try upstream PanSou-compatible API.
 * @param {string} baseUrl
 * @param {string} kw
 * @param {CloudType[]} cloudTypes
 * @param {number} timeoutMs
 * @returns {Promise<{ hits: import('./types.js').SearchHit[], meta: object }>}
 */
export async function searchUpstream(baseUrl, kw, cloudTypes, timeoutMs = 45000) {
  const root = baseUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  /** @type {object} */
  let healthMeta = {};
  try {
    // Parallel health probe — diagnose 0-plugin / TG-only setups
    const healthP = fetchPansouHealth(root, 2000).catch(() => ({ ok: false }));
    const res = await fetch(`${root}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        kw,
        res: "merge",
        src: "all",
        // Always ask upstream for all product types we support; local filter still applies
        cloud_types: cloudTypes?.length ? cloudTypes : ALL_CLOUD_TYPES,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
    const payload = await res.json();
    healthMeta = await healthP;
    // Official pansou wraps: { code, message, data: { total, merged_by_type, results? } }
    let data = payload;
    if (payload && typeof payload === "object" && "data" in payload) {
      if (payload.code !== undefined && payload.code !== 0) {
        throw new Error(payload.message || `upstream code ${payload.code}`);
      }
      data = payload.data || {};
    }
    const { hits, meta } = normalizeUpstream(data, kw, cloudTypes);
    const byType = countByCloudType(hits);
    const missing = missingRequestedTypes(byType, cloudTypes);
    /** @type {string[]} */
    const warnings = [];
    if (healthMeta?.ok && Number(healthMeta.pluginCount) === 0) {
      warnings.push(
        "PanSou 未加载插件（ENABLED_PLUGINS 为空），仅 TG 频道，迅雷/UC 极少；请用 run-v0.3.8.sh 或自行设置插件"
      );
    }
    if (missing.includes("xunlei") || missing.includes("uc")) {
      const miss = missing.filter((t) => t === "xunlei" || t === "uc");
      warnings.push(`该源本次无 ${miss.map((t) => (t === "xunlei" ? "迅雷" : "UC")).join("/")}`);
    }
    return {
      hits,
      meta: {
        ...meta,
        byType,
        missingTypes: missing,
        warnings,
        pluginCount: healthMeta?.pluginCount,
        channelsCount: healthMeta?.channelsCount,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} url
 * @param {string} [password]
 */
function resolvePassword(url, password) {
  if (password) return String(password).trim();
  try {
    const u = new URL(url);
    const pwd = u.searchParams.get("pwd") || u.searchParams.get("password") || "";
    return pwd.trim();
  } catch {
    return "";
  }
}

/**
 * Flatten pansou merged_by_type / results into ranked SearchHit[].
 * Scans ALL merged keys (alias + URL coerce) and always walks results[].links.
 * @param {any} data
 * @param {string} kw
 * @param {CloudType[]} cloudTypes
 * @returns {{ hits: import('./types.js').SearchHit[], meta: object }}
 */
export function normalizeUpstream(data, kw, cloudTypes) {
  /** @type {import('./types.js').SearchHit[]} */
  const hits = [];
  const types = cloudTypes?.length ? cloudTypes : ALL_CLOUD_TYPES;
  const typeSet = new Set(types);
  const merged = data?.merged_by_type || {};
  const rawMergedKeys = Object.keys(merged);
  const seen = new Set();
  let droppedUnknown = 0;

  /**
   * @param {string} url
   * @param {string} cloudType
   * @param {object} link
   * @param {string} source
   * @param {string} title
   * @param {string} datetime
   */
  const pushHit = (url, cloudType, link, source, title, datetime) => {
    if (!typeSet.has(cloudType)) {
      droppedUnknown += 1;
      return;
    }
    if (!url) return;
    if (/\/s\/1?demo/i.test(url) || /demoBaidu|demoQuark|demoXunlei|demoUc/i.test(url)) return;
    const dedupeKey = `${cloudType}|${url.replace(/[?#].*$/, "")}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const item = { title, note: title, source, datetime, keywords: [] };
    hits.push({
      id: `live-${cloudType}-${hash(url)}`,
      title,
      url,
      password: resolvePassword(url, link?.password),
      cloudType: /** @type {CloudType} */ (cloudType),
      score: scoreItem(item, kw),
      source,
      datetime: datetime || "",
      note: title,
    });
  };

  // 1) Every key in merged_by_type (not only exact baidu/quark/…)
  for (const rawKey of rawMergedKeys) {
    const links = merged[rawKey] || [];
    for (const link of links) {
      if (!link?.url) continue;
      const url = String(link.url).trim();
      const cloudType = coerceCloudType(rawKey, url) || coerceCloudType(link.type, url);
      if (!cloudType) {
        droppedUnknown += 1;
        continue;
      }
      const source = link.source || "unknown";
      const title = link.note || link.work_title || link.url;
      pushHit(url, cloudType, link, source, title, link.datetime || "");
    }
  }

  // 2) Always walk results[].links (not only when merge empty)
  if (Array.isArray(data?.results)) {
    for (const row of data.results) {
      for (const link of row.links || []) {
        if (!link?.url) continue;
        const url = String(link.url).trim();
        const cloudType = coerceCloudType(link.type, url);
        if (!cloudType) {
          droppedUnknown += 1;
          continue;
        }
        const source = row.channel ? `tg:${row.channel}` : link.source || "unknown";
        const title = link.work_title || row.title || link.url;
        pushHit(url, cloudType, link, source, title, link.datetime || row.datetime || "");
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return {
    hits: hits.slice(0, 80),
    meta: { rawMergedKeys, droppedUnknown, engine: "pansou" },
  };
}
