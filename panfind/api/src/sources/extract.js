/**
 * Extract baidu / quark / xunlei (/ optional UC) share links + 提取码
 * from plain text / HTML / Weibo status|comment JSON (url_struct etc.).
 */

const PATTERNS = {
  baidu: /https?:\/\/(?:pan|yun)\.baidu\.com\/s\/[a-zA-Z0-9_-]+(?:\?[^\s"'<>]*)?/gi,
  quark: /https?:\/\/pan\.quark\.cn\/s\/[a-zA-Z0-9]+(?:\?[^\s"'<>]*)?/gi,
  xunlei: /https?:\/\/pan\.xunlei\.com\/s\/[a-zA-Z0-9_-]+(?:\?[^\s"'<>]*)?/gi,
  uc: /https?:\/\/(?:drive|pan)\.uc\.cn\/s\/[a-zA-Z0-9_-]+(?:\?[^\s"'<>]*)?/gi,
};

/** Hosts that identify a cloud type without needing /s/ path (for ori_url variants) */
const HOST_TYPE = [
  { re: /(?:pan|yun)\.baidu\.com/i, type: "baidu" },
  { re: /pan\.quark\.cn/i, type: "quark" },
  { re: /pan\.xunlei\.com/i, type: "xunlei" },
  { re: /(?:drive|pan)\.uc\.cn/i, type: "uc" },
];

const PWD_RE =
  /(?:密码|提取码|访问码|pwd|code)[:：\s]*([a-zA-Z0-9]{3,6})|pwd=([a-zA-Z0-9]{3,6})/i;

/** Letter / word prefixes before masked「网页链接」or URL (colon optional) */
const PREFIX_TYPE_RE =
  /(?:^|[\s,，、;；|｜(\[【])((?:夸克|百度|迅雷|xunlei|uc|UC|bd|BD|xl|XL|[kKdDuU迅]))[:：\s]*$/i;

const SHORT_HOST_RE = /(?:^|\.)(?:t\.cn|weibo\.cn|weibo\.com|sinaurl\.cn)$/i;

/**
 * @param {string} htmlOrText
 * @returns {string}
 */
export function stripHtml(htmlOrText) {
  return String(htmlOrText || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map blogger prefix → cloudType.
 * @param {string} raw
 * @returns {'baidu'|'quark'|'xunlei'|'uc'|''}
 */
export function mapPrefixToCloudType(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[:：\s]+$/g, "");
  if (!s) return "";
  if (s === "k" || s === "夸克" || s === "quark") return "quark";
  if (s === "d" || s === "百度" || s === "bd" || s === "baidu") return "baidu";
  // U / UC → UC 网盘（截图常见「U 网页链接」无冒号）
  if (s === "u" || s === "uc" || s === "uc网盘") return "uc";
  if (s === "迅" || s === "迅雷" || s === "xl" || s === "xunlei") return "xunlei";
  return "";
}

/**
 * @param {string} url
 * @returns {'baidu'|'quark'|'xunlei'|'uc'|''}
 */
export function detectCloudTypeFromUrl(url) {
  const u = String(url || "");
  for (const { re, type } of HOST_TYPE) {
    if (re.test(u)) return /** @type {any} */ (type);
  }
  return "";
}

/**
 * Unwrap weibo/sinaurl redirect wrappers → target URL.
 * @param {string} raw
 * @returns {string}
 */
export function unwrapWeiboRedirect(raw) {
  let url = String(raw || "").trim();
  if (!url) return "";
  // Common HTML entity / encoded forms
  try {
    if (/%2f|%3a/i.test(url) && !/^https?:\/\//i.test(url)) {
      url = decodeURIComponent(url);
    }
  } catch {
    /* ignore */
  }
  try {
    const u = new URL(url);
    // https://weibo.cn/sinaurl?u=https%3A%2F%2Fpan.quark.cn%2Fs%2F...
    const nested =
      u.searchParams.get("u") ||
      u.searchParams.get("url") ||
      u.searchParams.get("target") ||
      u.searchParams.get("toasturl");
    if (nested) {
      try {
        return decodeURIComponent(nested);
      } catch {
        return nested;
      }
    }
  } catch {
    /* not a URL */
  }
  return url;
}

/**
 * @param {string} text
 * @param {string} url
 * @returns {string}
 */
function passwordNear(text, url) {
  try {
    const u = new URL(url);
    const fromQ = u.searchParams.get("pwd") || u.searchParams.get("password");
    if (fromQ) return fromQ.trim();
  } catch {
    /* ignore */
  }
  const start = text.indexOf(url);
  if (start < 0) {
    const m = text.match(PWD_RE);
    return (m && (m[1] || m[2])) || "";
  }
  const after = text.slice(start + url.length, start + url.length + 80);
  const mAfter = after.match(PWD_RE);
  if (mAfter) return (mAfter[1] || mAfter[2] || "").trim();
  const before = text.slice(Math.max(0, start - 40), start);
  const mBefore = before.match(PWD_RE);
  return ((mBefore && (mBefore[1] || mBefore[2])) || "").trim();
}

/**
 * Infer pan type from text immediately before a URL / 「网页链接」 marker.
 * @param {string} text
 * @param {number} atIndex index of url or marker in text
 * @returns {'baidu'|'quark'|'xunlei'|'uc'|''}
 */
export function inferCloudTypeFromPrefix(text, atIndex) {
  if (!text || atIndex < 0) return "";
  const before = text.slice(Math.max(0, atIndex - 24), atIndex);
  const m = before.match(PREFIX_TYPE_RE);
  if (!m) return "";
  return mapPrefixToCloudType(m[1]);
}

/**
 * Collect URL-like strings from a Weibo url_struct / url_objects entry.
 * Prefer expanded long/ori URLs over short_url / display title.
 * @param {any} us
 * @returns {string[]}
 */
export function urlsFromUrlStructEntry(us) {
  if (!us || typeof us !== "object") return [];
  /** @type {string[]} */
  const cands = [];
  const push = (v) => {
    if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) cands.push(v.trim());
  };

  push(us.long_url);
  push(us.ori_url);
  push(us.url_ori);
  push(us.page_url);
  push(us.object_url);
  push(us.h5_target_url);
  push(us.target_url);
  push(us.scheme);
  // url_title is often「网页链接」— only keep if it looks like a URL
  if (typeof us.url_title === "string" && /^https?:\/\//i.test(us.url_title)) {
    push(us.url_title);
  }
  push(us.short_url);

  // Nested url_objects shape: { object: { object: { url }, info: { url_long } }, url_ori }
  const obj = us.object;
  if (obj && typeof obj === "object") {
    if (obj.info && typeof obj.info === "object") {
      push(obj.info.url_long);
      push(obj.info.url);
      push(obj.info.uri);
    }
    const inner = obj.object;
    if (inner && typeof inner === "object") {
      push(inner.url);
      push(inner.display_url);
      push(inner.target_url);
    }
    push(obj.url);
  }

  return cands;
}

/**
 * Walk Weibo status / comment JSON for structured URL fields.
 * @param {any} entity
 * @returns {string[]}
 */
export function collectStructuredUrls(entity) {
  if (!entity || typeof entity !== "object") return [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  const add = (u) => {
    const unwrapped = unwrapWeiboRedirect(u);
    if (!unwrapped || seen.has(unwrapped)) return;
    seen.add(unwrapped);
    out.push(unwrapped);
  };

  if (Array.isArray(entity.url_struct)) {
    for (const us of entity.url_struct) {
      for (const u of urlsFromUrlStructEntry(us)) add(u);
    }
  }
  if (Array.isArray(entity.url_objects)) {
    for (const uo of entity.url_objects) {
      for (const u of urlsFromUrlStructEntry(uo)) add(u);
    }
  }

  // longTextContent variants
  const long =
    entity.longText?.longTextContent ||
    entity.longTextContent ||
    entity.long_text ||
    "";
  if (long) {
    for (const m of String(long).match(/https?:\/\/[^\s"'<>]+/gi) || []) add(m);
  }

  // hrefs in HTML text (often sinaurl?u=…)
  const html = String(entity.text || "");
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    add(m[1]);
  }

  // Bare http(s) in text_raw / text
  for (const field of ["text_raw", "text", "scheme"]) {
    const t = entity[field];
    if (typeof t !== "string") continue;
    for (const m of t.match(/https?:\/\/[^\s"'<>]+/gi) || []) add(m);
  }

  // page_info media / card
  const pi = entity.page_info;
  if (pi && typeof pi === "object") {
    add(pi.page_url);
    add(pi.url_ori);
    if (pi.urls && typeof pi.urls === "object") {
      for (const v of Object.values(pi.urls)) {
        if (typeof v === "string") add(v);
      }
    }
  }

  return out;
}

/**
 * @typedef {{ cloudType: 'baidu'|'quark'|'xunlei'|'uc', url: string, password: string, fromPrefix?: boolean, shortUrl?: string }} ExtractedLink
 */

/**
 * @param {string} raw
 * @param {Set<string>|string[]} [allowed]
 * @returns {ExtractedLink[]}
 */
export function extractPanLinks(raw, allowed = ["baidu", "quark", "xunlei"]) {
  const text = stripHtml(raw);
  const allow = allowed instanceof Set ? allowed : new Set(allowed);
  /** @type {ExtractedLink[]} */
  const out = [];
  const seen = new Set();

  for (const [cloudType, re] of Object.entries(PATTERNS)) {
    if (!allow.has(cloudType)) continue;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const url = m[0].replace(/[),.;，。]+$/, "");
      const key = `${cloudType}|${url.replace(/[?#].*$/, "")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        cloudType: /** @type {any} */ (cloudType),
        url,
        password: passwordNear(text, url),
      });
    }
  }
  return out;
}

/**
 * Whether URL looks like a Weibo/t.cn short link (not yet a pan host).
 * @param {string} url
 */
export function isShortOrWeiboUrl(url) {
  try {
    const u = new URL(url);
    return SHORT_HOST_RE.test(u.hostname) || /\/sinaurl/i.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Best pan URL from one url_struct / url_objects entry.
 * Prefer expanded pan host; else short URL for prefix fallback.
 * @param {any} us
 * @returns {{ panUrl: string, shortUrl: string, hostType: string }}
 */
function pickUrlsFromStructEntry(us) {
  const cands = urlsFromUrlStructEntry(us).map(unwrapWeiboRedirect).filter(Boolean);
  let panUrl = "";
  let hostType = "";
  let shortUrl = "";
  for (const u of cands) {
    const t = detectCloudTypeFromUrl(u);
    if (t && !panUrl) {
      panUrl = u;
      hostType = t;
    } else if (isShortOrWeiboUrl(u) && !shortUrl) {
      shortUrl = u;
    }
  }
  // Also accept non-short non-pan as last-resort "long" (rare)
  if (!panUrl) {
    const other = cands.find((u) => !isShortOrWeiboUrl(u));
    if (other) panUrl = other;
  }
  return { panUrl, shortUrl, hostType };
}

/**
 * Extract pan links from a Weibo status or comment object.
 * Uses url_struct / url_objects / longText / text_raw / HTML hrefs, plus
 * blogger prefixes (k/d/uc/迅) when the expanded URL is missing or ambiguous.
 *
 * @param {any} entity
 * @param {Set<string>|string[]} [allowed]
 * @returns {ExtractedLink[]}
 */
export function extractPanLinksFromWeiboEntity(entity, allowed = ["baidu", "quark", "xunlei"]) {
  const allow = allowed instanceof Set ? allowed : new Set(allowed);
  const textRaw = String(entity?.text_raw || "");
  const textPlain = stripHtml(entity?.text || textRaw);
  const contextBlob = [textRaw, textPlain].filter(Boolean).join("\n");

  /** @type {ExtractedLink[]} */
  const out = [];
  const seen = new Set();

  const pushLink = (cloudType, url, opts = {}) => {
    if (!cloudType || !allow.has(cloudType)) return;
    if (!url || !/^https?:\/\//i.test(url)) return;
    const clean = url.replace(/[),.;，。]+$/, "");
    // Dedupe by URL path (ignore type) so wrong-prefix short URLs don't shadow pan hosts
    const urlKey = clean.replace(/[?#].*$/, "");
    if (seen.has(urlKey)) return;
    seen.add(urlKey);
    const pwdFromUrl = passwordNear(clean, clean);
    out.push({
      cloudType: /** @type {any} */ (cloudType),
      url: clean,
      password: pwdFromUrl || passwordNear(contextBlob, clean) || opts.password || "",
      ...(opts.fromPrefix ? { fromPrefix: true } : {}),
      ...(opts.shortUrl ? { shortUrl: opts.shortUrl } : {}),
    });
  };

  // Ordered prefixes — colon optional: 「K 网页链接」「K: https://…」「U 网页链接」
  // Longer tokens first (uc before u, 迅雷 before 迅) via alternation order
  const prefixRe =
    /(?:^|[\s,，、;；|｜])((?:夸克|百度|迅雷|xunlei|uc|UC|bd|BD|xl|XL|[kKdDuU迅]))(?=[:：\s]|网页链接|$)/g;
  /** @type {string[]} */
  const orderedPrefixes = [];
  const prefixSource = textRaw || textPlain;
  let pm;
  while ((pm = prefixRe.exec(prefixSource)) !== null) {
    const t = mapPrefixToCloudType(pm[1]);
    if (t) orderedPrefixes.push(t);
  }
  if (!orderedPrefixes.length && textPlain && textPlain !== textRaw) {
    prefixRe.lastIndex = 0;
    while ((pm = prefixRe.exec(textPlain)) !== null) {
      const t = mapPrefixToCloudType(pm[1]);
      if (t) orderedPrefixes.push(t);
    }
  }

  // 1) Walk url_struct / url_objects as atomic cards (prefix index ↔ entry index)
  const structs = [
    ...(Array.isArray(entity?.url_struct) ? entity.url_struct : []),
    ...(Array.isArray(entity?.url_objects) ? entity.url_objects : []),
  ];
  let prefixIdx = 0;
  for (const us of structs) {
    const { panUrl, shortUrl, hostType } = pickUrlsFromStructEntry(us);
    const prefixType =
      prefixIdx < orderedPrefixes.length ? orderedPrefixes[prefixIdx] : "";
    // Advance prefix cursor when this entry looks like a link card
    if (panUrl || shortUrl || (us && us.url_title === "网页链接")) {
      prefixIdx += 1;
    }
    if (panUrl && hostType) {
      const fromPat = extractPanLinks(panUrl, allow);
      if (fromPat.length) {
        for (const l of fromPat) pushLink(l.cloudType, l.url, { password: l.password });
      } else {
        pushLink(hostType, panUrl);
      }
      continue;
    }
    if (panUrl) {
      // Expanded URL but unknown host — try regex, else prefix
      const fromPat = extractPanLinks(panUrl, allow);
      if (fromPat.length) {
        for (const l of fromPat) pushLink(l.cloudType, l.url, { password: l.password });
      } else if (prefixType) {
        pushLink(prefixType, panUrl, { fromPrefix: true, shortUrl: shortUrl || undefined });
      }
      continue;
    }
    // Only short URL — record with prefix when possible
    if (shortUrl && prefixType) {
      pushLink(prefixType, shortUrl, { fromPrefix: true, shortUrl });
    }
  }

  // 2) Plaintext / HTML regex + href unwrap leftovers
  for (const link of extractPanLinks(contextBlob, allow)) {
    pushLink(link.cloudType, link.url, { password: link.password });
  }
  for (const rawUrl of collectStructuredUrls(entity)) {
    const url = unwrapWeiboRedirect(rawUrl);
    const byHost = detectCloudTypeFromUrl(url);
    if (!byHost) continue;
    const fromPat = extractPanLinks(url, allow);
    if (fromPat.length) {
      for (const l of fromPat) pushLink(l.cloudType, l.url, { password: l.password });
    } else {
      pushLink(byHost, url);
    }
  }

  return out;
}

/**
 * Build a diagnostic snippet from a comment/status (no Cookie).
 * @param {any} entity
 * @param {number} [maxLen=160]
 */
export function snippetFromWeiboEntity(entity, maxLen = 160) {
  const plain = stripHtml(entity?.text_raw || entity?.text || "");
  const urls = collectStructuredUrls(entity).slice(0, 3);
  let s = plain;
  if (urls.length) s += ` | urls:${urls.map((u) => u.slice(0, 80)).join(",")}`;
  if (Array.isArray(entity?.url_struct) && entity.url_struct.length) {
    s += ` | url_struct×${entity.url_struct.length}`;
  }
  s = s.replace(/\s+/g, " ").trim();
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}
