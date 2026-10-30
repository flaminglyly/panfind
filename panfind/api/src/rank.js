/**
 * Ranking + hard keyword relevance.
 *
 * Chinese queries without spaces are ONE phrase (e.g.「王子的黑手党骑士」).
 * Do not score/accept via single-char or arbitrary bigram slices of that phrase.
 */

const SOURCE_WEIGHT = {
  "demo:tg:": 0.85,
  "demo:plugin:": 0.75,
  "demo:weibo:": 0.7,
  "tg:": 0.9,
  "plugin:": 0.8,
  "weibo:": 0.82,
  "ext:": 0.72,
  unknown: 0.4,
};

/**
 * Normalize for matching: trim, NFKC, casefold, collapse whitespace,
 * strip zero-width / soft-hyphen. Full-width Latin → half-width via NFKC.
 * @param {string} s
 * @returns {string}
 */
export function normalizeSearchText(s) {
  return String(s || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * True when query is a contiguous CJK (etc.) phrase with no whitespace tokens.
 * @param {string} q normalized
 */
export function isContiguousPhraseQuery(q) {
  const n = normalizeSearchText(q);
  if (!n) return false;
  if (/\s/.test(n)) return false;
  // Has CJK / fullwidth / kana — treat as single phrase, never char-split
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(n);
}

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
 * Hard relevance — DROP if false.
 * - Contiguous Chinese phrase (no spaces): require full normalized substring.
 * - Whitespace-separated: every token length>=2 must appear (Latin multi-word).
 * Nickname alone is never passed here.
 *
 * @param {string} text
 * @param {string} query
 * @returns {boolean}
 */
export function keywordRelevant(text, query) {
  const t = normalizeSearchText(text);
  const q = normalizeSearchText(query);
  if (!q || !t) return false;
  if (t.includes(q)) return true;
  if (isContiguousPhraseQuery(q)) {
    // Whole phrase only — never 王 / 子 / 黑手党 partials
    return false;
  }
  const tokens = q.split(/\s+/).filter((tok) => tok.length >= 2);
  if (tokens.length === 0) return t.includes(q);
  return tokens.every((tok) => t.includes(tok));
}

/**
 * Soft score 0..1 for ranking.
 * Contiguous Chinese phrases: only exact/full includes (no bigram charBonus).
 * @param {string} text
 * @param {string} query
 * @returns {number} 0..1
 */
export function keywordMatch(text, query) {
  const t = normalizeSearchText(text);
  const q = normalizeSearchText(query);
  if (!q || !t) return 0;
  if (t === q) return 1;
  if (t.includes(q)) return 0.85;

  // Chinese phrase without spaces: no partial credit
  if (isContiguousPhraseQuery(q)) return 0;

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  let hit = 0;
  for (const tok of tokens) {
    if (t.includes(tok)) hit += 1;
  }
  const ratio = hit / tokens.length;
  return Math.min(1, ratio * 0.7);
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
  const title = String(item.title || "");
  const text = [item.title, ...(item.keywords || [])].filter(Boolean).join(" ");
  const sq = sourceQuality(item.source);
  const km = keywordMatch(text, query);
  const titleKm = keywordMatch(title, query);
  const fr = freshness(item.datetime);

  let score = sq * 0.3 + km * 0.55 + fr * 0.15;

  // Title/snippet without full phrase cannot outrank true phrase hits
  if (!keywordRelevant(title, query) && !keywordRelevant(text, query)) {
    score *= 0.15;
  } else if (titleKm < 0.3) {
    score *= 0.55;
  }
  if (km < 0.2) score *= 0.25;

  return Number(score.toFixed(4));
}
