/**
 * Extra aggregation source: 混合盘系公开 API（与 pansou hunhepan 插件同源）。
 * MIT 自研适配器，不依赖 PanHub 等非商用许可前端。
 */
import { countByCloudType, missingRequestedTypes } from "../search.js";
import { scoreItem } from "../rank.js";

const ENDPOINTS = [
  { id: "hunhepan", url: "https://hunhepan.com/open/search/disk" },
  { id: "qkpanso", url: "https://qkpanso.com/v1/search/disk" },
  { id: "kuake8", url: "https://kuake8.com/v1/search/disk" },
  { id: "misoso", url: "https://www.misoso.cc/v1/search/disk" },
];

/**
 * Upstream disk_type codes (often UPPERCASE) → product type.
 * Observed live: BDY / QUARK / XUNLEI / ALY — UC 几乎不出现。
 */
const TYPE_MAP = {
  baidu: "baidu",
  bd: "baidu",
  bdy: "baidu",
  baiduyun: "baidu",
  quark: "quark",
  kuake: "quark",
  kk: "quark",
  xunlei: "xunlei",
  thunder: "xunlei",
  xly: "xunlei",
  xl: "xunlei",
  uc: "uc",
  ucpan: "uc",
  uck: "uc",
  // Aliyun etc. mapped but filtered out unless product adds chip
  aliyun: "aliyun",
  alipan: "aliyun",
  ali: "aliyun",
  aly: "aliyun",
};

/**
 * @param {string} raw
 * @param {string} [url]
 * @returns {string}
 */
export function mapDiskType(raw, url = "") {
  const t = String(raw || "")
    .trim()
    .toLowerCase();
  if (TYPE_MAP[t]) return TYPE_MAP[t];
  const u = String(url || "").toLowerCase();
  if (u.includes("pan.baidu.com") || u.includes("yun.baidu.com")) return "baidu";
  if (u.includes("pan.quark.cn") || u.includes("quark.cn")) return "quark";
  if (u.includes("pan.xunlei.com") || u.includes("xunlei.com")) return "xunlei";
  if (u.includes("drive.uc.cn") || u.includes("pan.uc.cn")) return "uc";
  if (u.includes("aliyundrive.com") || u.includes("alipan.com")) return "aliyun";
  return t;
}

/**
 * @param {string} s
 */
function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
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
 * @param {string} url
 * @param {string} [password]
 */
function resolvePassword(url, password) {
  if (password) return String(password).trim();
  try {
    const u = new URL(url);
    return (u.searchParams.get("pwd") || u.searchParams.get("password") || "").trim();
  } catch {
    return "";
  }
}

/**
 * @param {string} apiURL
 * @param {string} keyword
 * @param {number} page
 * @param {AbortSignal} signal
 */
async function fetchPage(apiURL, keyword, page, signal) {
  const res = await fetch(apiURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "PanFind/0.1 (+public-share-meta-search)",
    },
    // Minimal body is more compatible across hunhepan-family mirrors
    body: JSON.stringify({
      page,
      q: keyword,
      size: 30,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.code !== 200) throw new Error(body.msg || `code ${body.code}`);
  return body.data?.list || [];
}

/**
 * Search one endpoint (first 2 pages).
 * @param {{id:string,url:string}} ep
 * @param {string} kw
 * @param {AbortSignal} signal
 */
async function searchEndpoint(ep, kw, signal) {
  const pages = await Promise.allSettled([
    fetchPage(ep.url, kw, 1, signal),
    fetchPage(ep.url, kw, 2, signal),
  ]);
  /** @type {any[]} */
  const items = [];
  for (const p of pages) {
    if (p.status === "fulfilled") items.push(...p.value);
  }
  return { id: ep.id, items };
}

/**
 * @param {string} kw
 * @param {('baidu'|'quark'|'xunlei'|'uc')[]} cloudTypes
 * @param {number} timeoutMs
 * @returns {Promise<{hits: import('../types.js').SearchHit[], meta: object}>}
 */
export async function searchHunhepanFamily(kw, cloudTypes, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const typeSet = new Set(cloudTypes?.length ? cloudTypes : ["baidu", "quark", "xunlei", "uc"]);
  /** @type {Record<string, number>} */
  const perSource = {};
  /** @type {Record<string, number>} */
  const rawTypeCounts = {};
  /** @type {string[]} */
  const errors = [];

  try {
    const settled = await Promise.allSettled(
      ENDPOINTS.map((ep) => searchEndpoint(ep, kw, controller.signal))
    );

    /** @type {import('../types.js').SearchHit[]} */
    const hits = [];
    const seen = new Set();

    for (const r of settled) {
      if (r.status === "rejected") {
        errors.push(String(r.reason?.message || r.reason));
        continue;
      }
      const { id, items } = r.value;
      let kept = 0;
      for (const item of items) {
        const url = String(item.link || "").trim();
        if (!url) continue;
        const rawType = String(item.disk_type || "").trim() || "?";
        rawTypeCounts[rawType] = (rawTypeCounts[rawType] || 0) + 1;
        const cloudType = mapDiskType(item.disk_type, url);
        if (!typeSet.has(cloudType)) continue;
        const key = `${cloudType}|${url.replace(/[?#].*$/, "")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const title = stripHtml(item.disk_name) || url;
        const source = `ext:${id}`;
        const datetime = item.shared_time
          ? item.shared_time.replace(" ", "T") + "Z"
          : item.update_time
            ? String(item.update_time).replace(" ", "T") + "Z"
            : "";
        hits.push({
          id: `ext-${id}-${cloudType}-${hash(url)}`,
          title,
          url,
          password: resolvePassword(url, item.disk_pass || ""),
          cloudType,
          score: scoreItem({ title, source, datetime, keywords: item.tags || [] }, kw),
          source,
          datetime,
          note: title,
        });
        kept += 1;
      }
      perSource[id] = kept;
    }

    hits.sort((a, b) => b.score - a.score);
    const byType = countByCloudType(hits);
    const missing = missingRequestedTypes(byType, [...typeSet]);
    /** @type {string[]} */
    const warnings = [];
    if (!Object.keys(rawTypeCounts).some((k) => k.toUpperCase() === "UC" || k.toLowerCase() === "uc")) {
      warnings.push("混合盘系上游本次未返回 UC 类型（disk_type 无 UC）");
    }
    if (missing.includes("xunlei")) {
      warnings.push("混合盘系本次无迅雷结果（上游 XUNLEI 稀少或被夸克源淹没）");
    }
    if (missing.includes("uc")) {
      warnings.push("混合盘系本次无 UC 结果");
    }

    return {
      hits,
      meta: {
        engine: "hunhepan-family",
        perSource,
        rawTypeCounts,
        byType,
        missingTypes: missing,
        warnings,
        errors,
        endpoints: ENDPOINTS.map((e) => e.id),
        note: "qkpanso/kuake8 等镜像几乎全是夸克；迅雷偶发于 hunhepan.com；UC 上游极少收录",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export function hunhepanEndpoints() {
  return ENDPOINTS.map((e) => e.id);
}
