import { DEMO_SHARES } from "./fixtures.js";
import { keywordMatch, scoreItem } from "./rank.js";

const ALLOWED = new Set(["baidu", "quark", "xunlei"]);

/**
 * @param {string | string[] | undefined} raw
 * @returns {('baidu'|'quark'|'xunlei')[]}
 */
export function normalizeCloudTypes(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === "string" && raw.trim()) list = raw.split(",");
  const cleaned = [...new Set(list.map((s) => String(s).trim().toLowerCase()).filter((s) => ALLOWED.has(s)))];
  return /** @type {('baidu'|'quark'|'xunlei')[]} */ (cleaned.length ? cleaned : ["baidu", "quark", "xunlei"]);
}

/**
 * Demo-mode search over fixtures with PanSou-style ranking.
 * @param {string} kw
 * @param {('baidu'|'quark'|'xunlei')[]} cloudTypes
 */
export function searchDemo(kw, cloudTypes) {
  const query = (kw || "").trim();
  const typeSet = new Set(cloudTypes);
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
 * Try upstream PanSou-compatible API.
 * @param {string} baseUrl
 * @param {string} kw
 * @param {('baidu'|'quark'|'xunlei')[]} cloudTypes
 * @param {number} timeoutMs
 */
export async function searchUpstream(baseUrl, kw, cloudTypes, timeoutMs = 45000) {
  const root = baseUrl.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${root}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        kw,
        res: "merge",
        src: "all",
        cloud_types: cloudTypes,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
    const payload = await res.json();
    // Official pansou wraps: { code, message, data: { total, merged_by_type, results? } }
    if (payload && typeof payload === "object" && "data" in payload) {
      if (payload.code !== undefined && payload.code !== 0) {
        throw new Error(payload.message || `upstream code ${payload.code}`);
      }
      return normalizeUpstream(payload.data || {}, kw, cloudTypes);
    }
    return normalizeUpstream(payload, kw, cloudTypes);
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
 * @param {any} data
 * @param {string} kw
 * @param {('baidu'|'quark'|'xunlei')[]} cloudTypes
 */
function normalizeUpstream(data, kw, cloudTypes) {
  /** @type {import('./types.js').SearchHit[]} */
  const hits = [];
  const typeSet = new Set(cloudTypes);
  const merged = data?.merged_by_type || {};
  const seen = new Set();

  for (const cloudType of cloudTypes) {
    const links = merged[cloudType] || [];
    for (const link of links) {
      if (!link?.url) continue;
      const url = String(link.url).trim();
      const dedupeKey = `${cloudType}|${url.replace(/[?#].*$/, "")}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      // Skip obvious demo/fixture URLs if any leaked
      if (/\/s\/1?demo/i.test(url) || url.includes("demoBaidu") || url.includes("demoQuark") || url.includes("demoXunlei")) {
        continue;
      }
      const source = link.source || "unknown";
      const title = link.note || link.work_title || link.url;
      const item = {
        title,
        note: title,
        source,
        datetime: link.datetime,
        keywords: [],
      };
      hits.push({
        id: `live-${cloudType}-${hash(url)}`,
        title,
        url,
        password: resolvePassword(url, link.password),
        cloudType,
        score: scoreItem(item, kw),
        source,
        datetime: link.datetime || "",
        note: title,
      });
    }
  }

  // Fallback: walk results[].links if merge empty
  if (hits.length === 0 && Array.isArray(data?.results)) {
    for (const row of data.results) {
      for (const link of row.links || []) {
        const cloudType = link.type;
        if (!typeSet.has(cloudType) || !link.url) continue;
        const url = String(link.url).trim();
        const dedupeKey = `${cloudType}|${url.replace(/[?#].*$/, "")}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const source = row.channel ? `tg:${row.channel}` : "unknown";
        const title = link.work_title || row.title || link.url;
        hits.push({
          id: `live-${cloudType}-${hash(url)}`,
          title,
          url,
          password: resolvePassword(url, link.password),
          cloudType,
          score: scoreItem({ title, source, datetime: link.datetime || row.datetime }, kw),
          source,
          datetime: link.datetime || row.datetime || "",
          note: title,
        });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);
  // Cap payload for PC UI / gateway clients
  return hits.slice(0, 80);
}
