/**
 * PanSou-style multi-dimensional ranking:
 * source quality + keyword match + freshness
 */

const SOURCE_WEIGHT = {
  "demo:tg:": 0.85,
  "demo:plugin:": 0.75,
  "tg:": 0.9,
  "plugin:": 0.8,
  unknown: 0.4,
};

/**
 * @param {string} source
 * @returns {number}
 */
export function sourceQuality(source) {
  if (!source) return SOURCE_WEIGHT.unknown;
  for (const [prefix, w] of Object.entries(SOURCE_WEIGHT)) {
    if (prefix !== "unknown" && source.startsWith(prefix)) return w;
  }
  return SOURCE_WEIGHT.unknown;
}

/**
 * @param {string} text
 * @param {string} query
 * @returns {number} 0..1
 */
export function keywordMatch(text, query) {
  const t = (text || "").toLowerCase();
  const q = (query || "").trim().toLowerCase();
  if (!q || !t) return 0;
  if (t === q) return 1;
  if (t.includes(q)) return 0.85;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  let hit = 0;
  for (const tok of tokens) {
    if (t.includes(tok)) hit += 1;
  }
  const ratio = hit / tokens.length;
  // Chinese: also score by consecutive char overlap of length >= 2
  let charBonus = 0;
  if (/[\u4e00-\u9fff]/.test(q)) {
    let best = 0;
    for (let len = Math.min(q.length, 6); len >= 2; len--) {
      for (let i = 0; i <= q.length - len; i++) {
        if (t.includes(q.slice(i, i + len))) best = Math.max(best, len / q.length);
      }
    }
    charBonus = best * 0.9;
  }
  return Math.min(1, Math.max(ratio * 0.7, charBonus));
}

/**
 * @param {string} [iso]
 * @returns {number} 0..1
 */
export function freshness(iso) {
  if (!iso) return 0.35;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 0.35;
  const days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (days <= 7) return 1;
  if (days <= 30) return 0.85;
  if (days <= 90) return 0.7;
  if (days <= 365) return 0.5;
  if (days <= 730) return 0.35;
  return 0.2;
}

/**
 * @param {{ title: string, note?: string, source: string, datetime?: string, keywords?: string[] }} item
 * @param {string} query
 * @returns {number}
 */
export function scoreItem(item, query) {
  const text = [item.title, item.note, ...(item.keywords || [])].filter(Boolean).join(" ");
  const sq = sourceQuality(item.source);
  const km = keywordMatch(text, query);
  const fr = freshness(item.datetime);
  // Weights aligned with approach doc: source > keyword > freshness
  return Number((sq * 0.45 + km * 0.4 + fr * 0.15).toFixed(4));
}
