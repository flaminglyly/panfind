/**
 * 微博搜索源（公开内容 + 用户自备 Cookie）。
 *
 * 配置优先级：产品内 `.data/weibo-config.json`（设置面板）> 环境变量。
 *
 * 不做：账号破解、扫码代登、验证码/限流绕过、未授权访问。
 * 不记录 / 不回传 Cookie 明文。
 */
import {
  readWeiboFileConfig,
  resolveCookieSlots,
  uidsFromFile,
} from "../config/weibo-store.js";
import { keywordRelevant, scoreItem } from "../rank.js";
import {
  extractPanLinksFromWeiboEntity,
  snippetFromWeiboEntity,
  stripHtml,
} from "./extract.js";

const UA_PC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

/** Screenshot-seed / placeholder UIDs — never treat as live bloggers */
const PLACEHOLDER_UIDS = new Set(["10001", "10002"]);

/**
 * @returns {{
 *   enabled: boolean,
 *   cookie: string,
 *   cookieWeiboCom: string,
 *   cookieMWeibo: string,
 *   weiboComConfigured: boolean,
 *   mWeiboConfigured: boolean,
 *   uids: string[],
 *   fetchComments: boolean,
 *   maxPages: number,
 *   allowDemo: boolean,
 *   searchModeHint: string,
 * }}
 */
export function resolveWeiboConfig() {
  const file = readWeiboFileConfig();
  const envEnabled = ["1", "true", "yes"].includes(String(process.env.ENABLE_WEIBO || "").toLowerCase());
  const envUids = String(process.env.WEIBO_UIDS || "")
    .split(/[,\s]+/)
    .map((s) => {
      const m = s.match(/(\d{5,})/);
      return m ? m[1] : "";
    })
    .filter(Boolean);
  const envFetchComments = !["0", "false", "no"].includes(
    String(process.env.WEIBO_FETCH_COMMENTS ?? "1").toLowerCase()
  );
  const envMaxPages = Math.min(5, Math.max(1, Number(process.env.WEIBO_MAX_PAGES || 2) || 2));
  const envAllowDemo = ["1", "true", "yes"].includes(
    String(process.env.WEIBO_ALLOW_DEMO || "").toLowerCase()
  );

  const enabled = typeof file.enabled === "boolean" ? file.enabled : envEnabled;
  const { cookieWeiboCom, cookieMWeibo } = resolveCookieSlots(file);
  /** Any cookie — backward-compat alias for “configured” checks */
  const cookie = cookieWeiboCom || cookieMWeibo;
  const fileUids = uidsFromFile(file);
  const rawUids = fileUids.length ? fileUids : envUids;
  // Drop demo placeholders so leftover screenshot seeds don't force broken UID mode
  const uids = rawUids.filter((u) => !PLACEHOLDER_UIDS.has(u));
  const fetchComments =
    typeof file.fetchComments === "boolean" ? file.fetchComments : envFetchComments;
  const maxPages =
    typeof file.maxPages === "number" && file.maxPages > 0
      ? Math.min(5, Math.max(1, file.maxPages))
      : envMaxPages;
  const allowDemo = typeof file.allowDemo === "boolean" ? file.allowDemo : envAllowDemo;

  const searchModeHint = !enabled
    ? "off"
    : !cookie
      ? allowDemo
        ? "demo"
        : "need-cookie"
      : uids.length
        ? "uids"
        : cookieMWeibo
          ? "keyword"
          : cookieWeiboCom
            ? "uids-only"
            : "need-cookie";

  return {
    enabled,
    cookie,
    cookieWeiboCom,
    cookieMWeibo,
    weiboComConfigured: Boolean(cookieWeiboCom),
    mWeiboConfigured: Boolean(cookieMWeibo),
    uids,
    fetchComments,
    maxPages,
    allowDemo,
    searchModeHint,
  };
}

/**
 * Pick Cookie string for a request host. Never cross-send dedicated slots.
 * @param {ReturnType<typeof resolveWeiboConfig>} cfg
 * @param {string|URL} urlOrHost
 * @returns {string}
 */
export function cookieForHost(cfg, urlOrHost) {
  let host = "";
  try {
    host = typeof urlOrHost === "string" && !urlOrHost.includes("://")
      ? urlOrHost
      : new URL(String(urlOrHost)).hostname;
  } catch {
    host = String(urlOrHost || "");
  }
  host = host.toLowerCase();
  if (host === "m.weibo.cn" || host.endsWith(".m.weibo.cn")) {
    return cfg.cookieMWeibo || "";
  }
  if (host === "weibo.com" || host.endsWith(".weibo.com")) {
    return cfg.cookieWeiboCom || "";
  }
  // Unknown host: prefer weibo.com slot then m
  return cfg.cookieWeiboCom || cfg.cookieMWeibo || "";
}

/** @deprecated use resolveWeiboConfig */
export function weiboConfigFromEnv() {
  return resolveWeiboConfig();
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
 * Sanitize URL for diagnostics — never attach Cookie.
 * @param {string|URL} u
 */
function safeRequestUrl(u) {
  try {
    const url = typeof u === "string" ? new URL(u) : new URL(u.toString());
    return `${url.origin}${url.pathname}?${url.searchParams.toString()}`.slice(0, 240);
  } catch {
    return String(u).slice(0, 240);
  }
}

/**
 * @param {object} weibo
 * @param {string} uid
 * @returns {{ url: string, ok: boolean }}
 */
function buildWeiboPostUrl(weibo, uid) {
  const mid = String(weibo?.mid || weibo?.idstr || weibo?.id || "").trim();
  const mblogid = String(weibo?.mblogid || weibo?.bid || "").trim();
  const realUid = String(uid || weibo?.user?.id || weibo?.user?.idstr || "").trim();
  if (realUid && /^\d{5,}$/.test(realUid) && mblogid) {
    return { url: `https://weibo.com/${realUid}/${mblogid}`, ok: true };
  }
  if (mid && /^\d+$/.test(mid)) {
    return { url: `https://m.weibo.cn/detail/${mid}`, ok: true };
  }
  if (typeof weibo?.scheme === "string" && /^https?:\/\//.test(weibo.scheme)) {
    return { url: weibo.scheme, ok: true };
  }
  return { url: "", ok: false };
}

/**
 * @param {string} kw
 * @param {Set<string>} typeSet
 */
function demoWeiboHits(kw, typeSet) {
  const samples = [
    {
      uid: "demo-10001",
      nick: "资源菌Demo",
      title: `${kw} 合集（微博演示）`,
      entity: {
        text_raw: `${kw} 更新 夸克：https://pan.quark.cn/s/demoWeiboQuark01 百度：https://pan.baidu.com/s/1demoWeiboBd01 提取码 ab12 迅雷：https://pan.xunlei.com/s/demoWeiboXl01?pwd=xl99`,
      },
      created: new Date().toISOString(),
    },
    {
      uid: "demo-10002",
      nick: "盘搜样例博主",
      title: `【分享】${kw}`,
      entity: {
        text_raw: `正文无链，评论见下。关键词 ${kw}`,
      },
      // 模拟「k: 网页链接」掩码评论（url_struct 带 long_url）
      commentEntity: {
        text_raw: "k: 网页链接, d: 网页链接, uc: 网页链接",
        text: "k: <a href='https://t.cn/demoK'>网页链接</a>, d: <a href='https://t.cn/demoD'>网页链接</a>",
        url_struct: [
          {
            short_url: "https://t.cn/demoK",
            url_title: "网页链接",
            long_url: "https://pan.quark.cn/s/demoWeiboQuark02",
          },
          {
            short_url: "https://t.cn/demoD",
            url_title: "网页链接",
            long_url: "https://pan.baidu.com/s/1demoWeiboBd02?pwd=xy88",
            ori_url: "https://pan.baidu.com/s/1demoWeiboBd02?pwd=xy88",
          },
          {
            short_url: "https://t.cn/demoUc",
            url_title: "网页链接",
            long_url: "https://drive.uc.cn/s/demoWeiboUc01",
          },
        ],
      },
      created: new Date(Date.now() - 86400000).toISOString(),
    },
  ];
  /** @type {import('../types.js').SearchHit[]} */
  const hits = [];
  for (const s of samples) {
    const entities = [s.entity, s.commentEntity].filter(Boolean);
    const linkSeen = new Set();
    for (const ent of entities) {
      for (const link of extractPanLinksFromWeiboEntity(ent, typeSet)) {
        const key = `${link.cloudType}|${link.url.replace(/[?#].*$/, "")}`;
        if (linkSeen.has(key)) continue;
        linkSeen.add(key);
        const source = `weibo:demo:${s.uid}`;
        hits.push({
          id: `weibo-demo-${link.cloudType}-${hash(link.url)}`,
          title: s.title,
          url: link.url,
          password: link.password,
          cloudType: link.cloudType,
          score: scoreItem({ title: s.title, source, datetime: s.created, keywords: [kw] }, kw),
          source,
          datetime: s.created,
          note: `${s.nick} · 演示·不可跳转（非实时微博）`,
          weiboNick: s.nick,
          weiboUid: s.uid,
          weiboPostUrl: "",
          weiboLinkOk: false,
          weiboLinkNote: "演示·不可跳转",
          origin: "weibo",
          demo: true,
        });
      }
    }
  }
  return hits.filter((h) => typeSet.has(h.cloudType));
}

/**
 * @param {string} cookie
 * @param {string} uid
 * @param {string} keyword
 * @param {number} page
 * @param {AbortSignal} signal
 */
async function fetchUserSearchPage(cookie, uid, keyword, page, signal) {
  const u = new URL("https://weibo.com/ajax/profile/searchblog");
  u.searchParams.set("uid", uid);
  u.searchParams.set("feature", "0");
  u.searchParams.set("q", keyword);
  u.searchParams.set("page", String(page));
  const reqUrl = safeRequestUrl(u);
  const res = await fetch(u, {
    method: "GET",
    headers: {
      "User-Agent": UA_PC,
      Referer: `https://weibo.com/u/${uid}`,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
      Cookie: cookie,
    },
    signal,
  });
  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error(`微博认证失败 HTTP ${res.status}（请更新 Cookie）`), {
      httpStatus: res.status,
      requestUrl: reqUrl,
    });
  }
  if (!res.ok) {
    throw Object.assign(new Error(`博主内搜 HTTP ${res.status}`), {
      httpStatus: res.status,
      requestUrl: reqUrl,
    });
  }
  const body = await res.json();
  const ok = body?.ok === 1 || body?.ok === true || String(body?.ok) === "1";
  if (!ok) {
    throw Object.assign(
      new Error(body?.msg || body?.message || `博主内搜返回 ok=${body?.ok}`),
      { httpStatus: res.status, okCode: body?.ok, requestUrl: reqUrl }
    );
  }
  return { list: body?.data?.list || [], requestUrl: reqUrl, httpStatus: res.status, okCode: body?.ok };
}

/**
 * 关键词公开检索（m.weibo.cn）。
 * containerid 经 URLSearchParams 单参数编码（100103type=1&q=关键词）。
 * @param {string} cookie
 * @param {string} keyword
 * @param {number} page
 * @param {AbortSignal} signal
 */
async function fetchKeywordSearchPage(cookie, keyword, page, signal) {
  // type=1 综合；另附独立 q/t 兼容部分网关
  const containerid = `100103type=1&q=${keyword}`;
  const u = new URL("https://m.weibo.cn/api/container/getIndex");
  u.searchParams.set("containerid", containerid);
  u.searchParams.set("page_type", "searchall");
  u.searchParams.set("page", String(page));
  u.searchParams.set("q", keyword);
  u.searchParams.set("t", "0");
  const reqUrl = safeRequestUrl(u);
  const res = await fetch(u, {
    method: "GET",
    headers: {
      "User-Agent": UA_MOBILE,
      Referer: `https://m.weibo.cn/search?containerid=${encodeURIComponent(containerid)}`,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "X-Requested-With": "XMLHttpRequest",
      "MWeibo-Pwa": "1",
      Cookie: cookie,
    },
    signal,
  });
  const text = await res.text();
  /** @type {any} */
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    throw Object.assign(
      new Error(`关键词检索非 JSON（HTTP ${res.status}，body ${text.slice(0, 80)}）`),
      { httpStatus: res.status, requestUrl: reqUrl }
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error(`微博认证失败 HTTP ${res.status}（请更新 Cookie）`), {
      httpStatus: res.status,
      requestUrl: reqUrl,
      okCode: body?.ok,
    });
  }
  if (!res.ok) {
    throw Object.assign(new Error(`关键词检索 HTTP ${res.status}`), {
      httpStatus: res.status,
      requestUrl: reqUrl,
      okCode: body?.ok,
    });
  }
  if (body?.ok === -100 || body?.ok === "-100") {
    throw Object.assign(
      new Error(
        "微博移动端要求登录（ok=-100）。请在「微博设置」填写「m.weibo.cn Cookie」槽（先打开 https://m.weibo.cn 登录后再复制 Cookie；weibo.com Cookie 不能替代）"
      ),
      { httpStatus: res.status, okCode: -100, requestUrl: reqUrl }
    );
  }
  if (!(body?.ok === 1 || body?.ok === true || String(body?.ok) === "1")) {
    throw Object.assign(
      new Error(body?.msg || body?.message || `关键词检索返回 ok=${JSON.stringify(body?.ok)}`),
      { httpStatus: res.status, okCode: body?.ok, requestUrl: reqUrl }
    );
  }
  const cards = body?.data?.cards || body?.data?.card_group || [];
  const list = extractMblogsFromCards(Array.isArray(cards) ? cards : []);
  return {
    list,
    requestUrl: reqUrl,
    httpStatus: res.status,
    okCode: body?.ok,
    cardCount: Array.isArray(cards) ? cards.length : 0,
  };
}

/**
 * Recursively collect mblog objects from card trees.
 * @param {any[]} cards
 * @returns {object[]}
 */
function extractMblogsFromCards(cards) {
  /** @type {object[]} */
  const out = [];
  /** @param {any} node */
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (typeof node !== "object") return;
    if (node.mblog && typeof node.mblog === "object") out.push(node.mblog);
    if (Array.isArray(node.card_group)) walk(node.card_group);
    if (Array.isArray(node.cards)) walk(node.cards);
    if (node.card_type === 9 && node.mblog) {
      /* already pushed */
    }
  }
  walk(cards);
  // de-dupe by mid
  const seen = new Set();
  return out.filter((m) => {
    const id = String(m.mid || m.idstr || m.id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Flatten comments + one level of nested replies (博主常把迅雷放回复里).
 * @param {any[]} list
 * @param {number} max
 * @returns {object[]}
 */
export function flattenCommentEntities(list, max = 20) {
  /** @type {object[]} */
  const out = [];
  for (const c of list) {
    if (!c || typeof c !== "object") continue;
    out.push(c);
    if (out.length >= max) break;
    const nested = c.comments || c.reply_comment || c.comment_reply;
    const nestList = Array.isArray(nested) ? nested : nested ? [nested] : [];
    for (const n of nestList) {
      if (!n || typeof n !== "object") continue;
      out.push(n);
      if (out.length >= max) break;
    }
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

/**
 * Normalize comment list from various Weibo comment API shapes.
 * @param {any} body
 * @returns {object[]}
 */
export function parseCommentApiBody(body) {
  if (!body || typeof body !== "object") return [];
  // PC buildComments: { ok:1, data: [comments...], root_comments? }
  if (Array.isArray(body.data)) return body.data.filter((c) => c && typeof c === "object");
  // m.weibo.cn hotflow: { ok:1, data: { data: [comments...] } }
  if (Array.isArray(body.data?.data)) return body.data.data.filter((c) => c && typeof c === "object");
  if (Array.isArray(body.root_comments)) return body.root_comments.filter((c) => c && typeof c === "object");
  if (Array.isArray(body.comments)) return body.comments.filter((c) => c && typeof c === "object");
  return [];
}

/**
 * Numeric status id for comment APIs (prefer idstr / mid over mblogid bid).
 * @param {object} weibo
 */
export function resolveStatusIdForComments(weibo) {
  const candidates = [weibo?.idstr, weibo?.mid, weibo?.id, weibo?.comment_manage_info?.comment_manage_info];
  for (const c of candidates) {
    if (c == null || c === "") continue;
    const s = String(c).trim();
    // Comment APIs need numeric mid/idstr (16+ digits), not alphanumeric mblogid
    if (/^\d{5,}$/.test(s)) return s;
  }
  return "";
}

/**
 * @typedef {{
 *   comments: object[],
 *   endpoint: string,
 *   requestUrl: string,
 *   httpStatus: number|null,
 *   okCode: any,
 *   midUsed: string,
 *   error?: string,
 * }} CommentFetchResult
 */

/**
 * Fetch comments: prefer weibo.com buildComments (weibo.com Cookie slot),
 * then fall back to m.weibo.cn hotflow (m.weibo Cookie slot).
 * @param {ReturnType<typeof resolveWeiboConfig>} cfg
 * @param {string} mid numeric status id
 * @param {string} uid blogger uid (helps PC API)
 * @param {AbortSignal} signal
 * @returns {Promise<CommentFetchResult>}
 */
async function fetchStatusComments(cfg, mid, uid, signal) {
  /** @type {CommentFetchResult} */
  const empty = {
    comments: [],
    endpoint: "",
    requestUrl: "",
    httpStatus: null,
    okCode: null,
    midUsed: mid,
  };
  if (!mid) {
    return { ...empty, error: "no-mid" };
  }

  const cookieCom = cookieForHost(cfg, "weibo.com");
  const cookieM = cookieForHost(cfg, "m.weibo.cn");

  // 1) PC ajax — weibo.com Cookie slot
  /** @type {CommentFetchResult|null} */
  let pc = null;
  if (cookieCom) {
    try {
      pc = await fetchBuildComments(cookieCom, mid, uid, signal);
      if (pc.comments.length) return pc;
    } catch (err) {
      pc = {
        ...empty,
        endpoint: "weibo.com/ajax/statuses/buildComments",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // 2) Mobile hotflow — m.weibo.cn Cookie slot only
  if (cookieM) {
    try {
      const mobile = await fetchHotflowComments(cookieM, mid, signal);
      if (mobile.comments.length) return mobile;
      return {
        ...(pc || mobile),
        error:
          (pc && pc.error) ||
          mobile.error ||
          `comments-empty (pc HTTP ${pc?.httpStatus ?? "skip"}; mobile HTTP ${mobile.httpStatus} ok=${mobile.okCode})`,
      };
    } catch (err2) {
      return {
        ...(pc || empty),
        endpoint: pc?.endpoint || "m.weibo.cn/comments/hotflow",
        error: `pc+mobile failed: ${pc?.error || "no-weibo.com-cookie"}; ${err2 instanceof Error ? err2.message : String(err2)}`,
      };
    }
  }

  if (pc) {
    return {
      ...pc,
      error:
        pc.error ||
        (cookieCom
          ? "buildComments empty；未配置「m.weibo.cn Cookie」无法回退 hotflow"
          : "未配置 weibo.com Cookie"),
    };
  }
  return {
    ...empty,
    error: "未配置 weibo.com / m.weibo.cn Cookie，无法拉评论",
  };
}

/**
 * https://weibo.com/ajax/statuses/buildComments
 * @param {string} cookie
 * @param {string} mid
 * @param {string} uid
 * @param {AbortSignal} signal
 * @returns {Promise<CommentFetchResult>}
 */
async function fetchBuildComments(cookie, mid, uid, signal) {
  const u = new URL("https://weibo.com/ajax/statuses/buildComments");
  u.searchParams.set("flow", "0");
  u.searchParams.set("is_reload", "1");
  u.searchParams.set("id", mid);
  u.searchParams.set("is_show_bulletin", "2");
  u.searchParams.set("is_mix", "0");
  u.searchParams.set("count", "20");
  u.searchParams.set("uid", uid || "");
  u.searchParams.set("fetch_level", "0");
  u.searchParams.set("locale", "zh-CN");
  const reqUrl = safeRequestUrl(u);
  const res = await fetch(u, {
    method: "GET",
    headers: {
      "User-Agent": UA_PC,
      Referer: uid ? `https://weibo.com/${uid}` : "https://weibo.com/",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
      Cookie: cookie,
    },
    signal,
  });
  const text = await res.text();
  /** @type {any} */
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    return {
      comments: [],
      endpoint: "weibo.com/ajax/statuses/buildComments",
      requestUrl: reqUrl,
      httpStatus: res.status,
      okCode: null,
      midUsed: mid,
      error: `buildComments non-JSON HTTP ${res.status}`,
    };
  }
  const list = parseCommentApiBody(body);
  return {
    comments: flattenCommentEntities(list, 20),
    endpoint: "weibo.com/ajax/statuses/buildComments",
    requestUrl: reqUrl,
    httpStatus: res.status,
    okCode: body?.ok,
    midUsed: mid,
    error: list.length
      ? undefined
      : res.ok
        ? `buildComments empty ok=${body?.ok}`
        : `buildComments HTTP ${res.status}`,
  };
}

/**
 * https://m.weibo.cn/comments/hotflow (fallback; needs m.weibo.cn Cookie)
 * @param {string} cookie
 * @param {string} mid
 * @param {AbortSignal} signal
 * @returns {Promise<CommentFetchResult>}
 */
async function fetchHotflowComments(cookie, mid, signal) {
  const u = new URL("https://m.weibo.cn/comments/hotflow");
  u.searchParams.set("id", mid);
  u.searchParams.set("mid", mid);
  u.searchParams.set("max_id_type", "0");
  const reqUrl = safeRequestUrl(u);
  const res = await fetch(u, {
    headers: {
      "User-Agent": UA_MOBILE,
      Referer: "https://m.weibo.cn/",
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "MWeibo-Pwa": "1",
      Cookie: cookie,
    },
    signal,
  });
  const text = await res.text();
  /** @type {any} */
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    return {
      comments: [],
      endpoint: "m.weibo.cn/comments/hotflow",
      requestUrl: reqUrl,
      httpStatus: res.status,
      okCode: null,
      midUsed: mid,
      error: `hotflow non-JSON HTTP ${res.status}`,
    };
  }
  const list = parseCommentApiBody(body);
  return {
    comments: flattenCommentEntities(list, 20),
    endpoint: "m.weibo.cn/comments/hotflow",
    requestUrl: reqUrl,
    httpStatus: res.status,
    okCode: body?.ok,
    midUsed: mid,
    error: list.length
      ? undefined
      : body?.ok === -100 || body?.ok === "-100"
        ? "hotflow ok=-100 (need m.weibo.cn login Cookie)"
        : res.ok
          ? `hotflow empty ok=${body?.ok}`
          : `hotflow HTTP ${res.status}`,
  };
}

/**
 * @param {string} cookie
 * @param {string} id
 * @param {AbortSignal} signal
 */
async function fetchLongText(cookie, id, signal) {
  const u = new URL("https://m.weibo.cn/statuses/extend");
  u.searchParams.set("id", id);
  const res = await fetch(u, {
    headers: {
      "User-Agent": UA_MOBILE,
      Referer: "https://m.weibo.cn/",
      Accept: "application/json",
      Cookie: cookie,
    },
    signal,
  });
  if (!res.ok) return "";
  const body = await res.json().catch(() => ({}));
  return stripHtml(body?.data?.longTextContent || "");
}

/**
 * @param {object} weibo
 * @param {string} kw
 * @param {string} fallbackUid
 * @param {ReturnType<typeof resolveWeiboConfig>} cfg
 * @param {Set<string>} typeSet
 * @param {Set<string>} seen
 * @param {AbortSignal} signal
 * @param {import('../types.js').SearchHit[]} hits
 * @param {{
 *   commentSnippets?: string[],
 *   commentsFetched?: number,
 *   commentAttempts?: number,
 *   commentFetchMeta?: object[],
 *   requestUrls?: string[],
 * }} [diag]
 * @returns {number} pan links added
 */
async function collectLinksFromWeibo(
  weibo,
  kw,
  fallbackUid,
  cfg,
  typeSet,
  seen,
  signal,
  hits,
  diag = {}
) {
  const textRaw = String(weibo.text_raw || "");
  const textHtml = String(weibo.text || "");
  const mid = resolveStatusIdForComments(weibo) || String(weibo.mid || weibo.idstr || weibo.id || "");
  const uid = String(weibo.user?.id || weibo.user?.idstr || fallbackUid || "").trim();
  const nick = weibo.user?.screen_name || uid || "微博用户";
  const title = stripHtml(textRaw || textHtml).slice(0, 80) || `${nick} 的微博`;
  const created = weibo.created_at
    ? new Date(weibo.created_at).toISOString()
    : new Date().toISOString();
  const { url: weiboPostUrl, ok: weiboLinkOk } = buildWeiboPostUrl(weibo, uid);
  let added = 0;

  /** @type {object[]} entities to run structured extractor on */
  const entities = [weibo];
  /** @type {string[]} */
  const postParts = [textRaw, stripHtml(textHtml)];

  if (weibo.isLongText && mid) {
    try {
      const mCookie = cookieForHost(cfg, "m.weibo.cn");
      if (mCookie) {
        const longText = await fetchLongText(mCookie, mid, signal);
        if (longText) {
          entities.push({ text_raw: longText, text: longText });
          postParts.push(longText);
        }
      }
    } catch {
      /* ignore */
    }
  }

  const postMatches = keywordRelevant(postParts.join("\n"), kw);

  // Always try comments when enabled — searchblog often omits comments_count or sets 0
  // while resource bloggers put pan links only in comments.
  /** @type {object[]} */
  const commentEntities = [];
  if (cfg.fetchComments) {
    const statusId = resolveStatusIdForComments(weibo);
    diag.commentAttempts = (diag.commentAttempts || 0) + 1;
    if (!statusId) {
      if (!Array.isArray(diag.commentFetchMeta)) diag.commentFetchMeta = [];
      diag.commentFetchMeta.push({
        midUsed: "",
        endpoint: "",
        httpStatus: null,
        error: "no-numeric-mid",
        comments_count: weibo.comments_count ?? null,
      });
    } else {
      try {
        const result = await fetchStatusComments(cfg, statusId, uid, signal);
        if (diag.commentsFetched != null) diag.commentsFetched += result.comments.length;
        else diag.commentsFetched = result.comments.length;
        if (!Array.isArray(diag.commentFetchMeta)) diag.commentFetchMeta = [];
        diag.commentFetchMeta.push({
          midUsed: result.midUsed,
          endpoint: result.endpoint,
          requestUrl: result.requestUrl,
          httpStatus: result.httpStatus,
          okCode: result.okCode,
          count: result.comments.length,
          error: result.error || null,
          comments_count_field: weibo.comments_count ?? null,
        });
        if (result.requestUrl && Array.isArray(diag.requestUrls)) {
          diag.requestUrls.push(result.requestUrl);
        }
        for (const c of result.comments) {
          commentEntities.push(c);
          if (Array.isArray(diag.commentSnippets) && diag.commentSnippets.length < 6) {
            const snip = snippetFromWeiboEntity(c, 140);
            if (snip) diag.commentSnippets.push(snip);
          }
        }
      } catch (err) {
        if (!Array.isArray(diag.commentFetchMeta)) diag.commentFetchMeta = [];
        diag.commentFetchMeta.push({
          midUsed: statusId,
          endpoint: "weibo.com/ajax/statuses/buildComments",
          httpStatus: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Hard filter: full phrase must appear in post body OR the comment that
   * yielded the pan link. Nickname alone is NOT enough. Chinese queries
   * without spaces are one contiguous phrase (no 王/子 bigram accept).
   * @type {{ cloudType: string, url: string, password: string, matchField: string, matchSnippet: string }[]}
   */
  const links = [];
  const linkSeen = new Set();
  let candidatesRaw = 0;

  /**
   * @param {object} ent
   * @param {'post'|'comment'} matchField
   * @param {boolean} allowed
   */
  const pushFromEntity = (ent, matchField, allowed) => {
    const entText = `${ent?.text_raw || ""}\n${stripHtml(ent?.text || "")}`;
    for (const link of extractPanLinksFromWeiboEntity(ent, typeSet)) {
      candidatesRaw += 1;
      if (!allowed) {
        diag.keywordDropped = (diag.keywordDropped || 0) + 1;
        continue;
      }
      const key = `${link.cloudType}|${link.url.replace(/[?#].*$/, "")}`;
      if (linkSeen.has(key)) continue;
      linkSeen.add(key);
      links.push({
        ...link,
        matchField,
        matchSnippet: stripHtml(entText).slice(0, 160),
      });
    }
  };

  if (postMatches) {
    for (const ent of entities) pushFromEntity(ent, "post", true);
    // Resource blogs: pan links in comments under a phrase-matching post
    for (const c of commentEntities) pushFromEntity(c, "post", true);
  } else {
    diag.skippedOffTopic = (diag.skippedOffTopic || 0) + 1;
    for (const c of commentEntities) {
      const cText = `${c?.text_raw || ""}\n${stripHtml(c?.text || "")}`;
      pushFromEntity(c, "comment", keywordRelevant(cText, kw));
    }
  }

  for (const link of links) {
    const key = `${link.cloudType}|${link.url.replace(/[?#].*$/, "")}`;
    if (seen.has(key)) continue;
    // Final safety: phrase must still appear in title OR match context
    const contextOk =
      keywordRelevant(title, kw) ||
      keywordRelevant(link.matchSnippet || "", kw) ||
      (link.matchField === "post" && postMatches);
    if (!contextOk) {
      diag.keywordDropped = (diag.keywordDropped || 0) + 1;
      continue;
    }
    seen.add(key);
    const source = `weibo:${uid || mid || "live"}`;
    // Rank with real match snippet (not raw kw injection) so truncated titles still score fairly
    const rankKeywords =
      keywordRelevant(title, kw) ? [] : link.matchSnippet ? [link.matchSnippet] : [];
    hits.push({
      id: `weibo-${uid || "x"}-${mid || hash(link.url)}-${link.cloudType}`,
      title,
      url: link.url,
      password: link.password,
      cloudType: link.cloudType,
      score: scoreItem({ title, source, datetime: created, keywords: rankKeywords }, kw),
      source,
      datetime: created,
      note: weiboLinkOk ? `${nick} · ${weiboPostUrl}` : `${nick} · 无可用微博链接`,
      weiboNick: nick,
      weiboUid: uid || "",
      weiboMid: mid || "",
      weiboPostUrl: weiboLinkOk ? weiboPostUrl : "",
      weiboLinkOk,
      weiboLinkNote: weiboLinkOk ? "" : "无可用微博链接",
      weiboMatchField: link.matchField || "",
      origin: "weibo",
      demo: false,
    });
    added += 1;
  }
  if (candidatesRaw > 0 && added === 0) {
    diag.keywordDropped = (diag.keywordDropped || 0) + Math.max(0, candidatesRaw - (diag.keywordDropped || 0));
  }
  diag.candidatesRaw = (diag.candidatesRaw || 0) + candidatesRaw;
  return added;
}

/**
 * Promote diagnostics for UI/API when live search yields nothing useful.
 * @param {object} meta
 */
function finalizeLiveMeta(meta) {
  const errors = Array.isArray(meta.errors) ? meta.errors : [];
  const warnings = Array.isArray(meta.warnings) ? meta.warnings : [];
  const posts = Number(meta.postsScanned || 0);
  const pan = Number(meta.panHitCount ?? meta.hitsLength ?? 0);
  const snippets = Array.isArray(meta.commentSamples) ? meta.commentSamples.filter(Boolean) : [];
  const commentMeta = Array.isArray(meta.commentFetchMeta) ? meta.commentFetchMeta : [];
  const nComments = Number(meta.commentsFetched || 0);

  if (errors.length && !meta.error) {
    meta.error = errors[0];
  }
  if (!meta.error && posts === 0 && !errors.length) {
    meta.error =
      meta.searchMode === "keyword"
        ? "关键词检索返回 0 帖（Cookie 可能缺 m.weibo.cn 登录态、已失效，或被风控）"
        : "博主内搜返回 0 帖";
  }
  const dropped = Number(meta.keywordDropped || 0);
  const skippedOff = Number(meta.skippedOffTopic || 0);
  if (dropped > 0 || skippedOff > 0) {
    const filterNote = `关键词硬过滤丢弃 ${dropped} 条盘链候选` +
      (skippedOff ? `、跳过 ${skippedOff} 条正文不含完整短语的帖` : "") +
      "（须正文或产出链接的评论含完整查询短语）";
    if (!warnings.includes(filterNote)) warnings.push(filterNote);
    if (pan === 0 && !meta.warning) meta.warning = filterNote;
  }

  if (!meta.error && posts > 0 && pan === 0) {
    let warn =
      meta.warning ||
      `扫到 ${posts} 帖` +
        (nComments ? `、${nComments} 条评论` : "、评论 0") +
        `，但未提取到百度/夸克/迅雷/UC链接`;
    if (nComments === 0 && commentMeta.length) {
      const last = commentMeta[commentMeta.length - 1] || {};
      const bits = [];
      if (last.midUsed) bits.push(`mid=${last.midUsed}`);
      if (last.endpoint) bits.push(`endpoint=${last.endpoint}`);
      if (last.httpStatus != null) bits.push(`HTTP ${last.httpStatus}`);
      if (last.okCode != null) bits.push(`ok=${last.okCode}`);
      if (last.error) bits.push(String(last.error).slice(0, 120));
      warn += `（评论拉取失败/空：${bits.join("，") || "无详情"}）`;
      if (last.requestUrl) {
        meta.commentRequestUrl = last.requestUrl;
        if (Array.isArray(meta.requestUrls) && !meta.requestUrls.includes(last.requestUrl)) {
          meta.requestUrls = [...meta.requestUrls, last.requestUrl].slice(0, 8);
        }
      }
    } else if (nComments === 0) {
      warn += "（未拉到评论：可能缺数字 mid，或评论接口未调用）";
    } else if (snippets.length) {
      warn += `；评论样例：${snippets.slice(0, 3).join(" ‖ ")}`;
    }
    meta.warning = warn;
    warnings.push(meta.warning);
    meta.commentSamples = snippets.slice(0, 6);
  }
  if (errors.length) meta.ok = false;
  else if (pan === 0) meta.ok = false;
  else meta.ok = true;

  meta.warnings = warnings;
  meta.hasError = Boolean(meta.error);
  meta.commentFetchMeta = commentMeta.slice(0, 6);
  return meta;
}

/**
 * @param {string} kw
 * @param {('baidu'|'quark'|'xunlei')[]} cloudTypes
 * @param {ReturnType<typeof resolveWeiboConfig>} cfg
 * @param {number} timeoutMs
 */
async function searchWeiboByUids(kw, cloudTypes, cfg, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const typeSet = new Set(cloudTypes);
  /** @type {import('../types.js').SearchHit[]} */
  const hits = [];
  const seen = new Set();
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const requestUrls = [];
  /** @type {string[]} */
  const commentSnippets = [];
  /** @type {object[]} */
  const commentFetchMeta = [];
  let posts = 0;
  let panHitCount = 0;
  let commentsFetched = 0;
  let keywordDropped = 0;
  let skippedOffTopic = 0;

  try {
    const uidSlice = cfg.uids.slice(0, 8);
    await Promise.all(
      uidSlice.map(async (uid) => {
        try {
          let any = false;
          for (let page = 1; page <= cfg.maxPages; page++) {
            const comCookie = cookieForHost(cfg, "weibo.com");
            if (!comCookie) {
              throw Object.assign(
                new Error(
                  "未配置「weibo.com Cookie」槽，无法博主内搜（searchblog）。请在微博设置粘贴 weibo.com 登录后的 Cookie"
                ),
                { requestUrl: "https://weibo.com/ajax/profile/searchblog" }
              );
            }
            const { list, requestUrl } = await fetchUserSearchPage(
              comCookie,
              uid,
              kw,
              page,
              controller.signal
            );
            requestUrls.push(requestUrl);
            if (!list.length) break;
            any = true;
            for (const weibo of list) {
              posts += 1;
              const diag = {
                commentSnippets,
                commentsFetched: 0,
                commentFetchMeta,
                requestUrls,
                keywordDropped: 0,
                skippedOffTopic: 0,
              };
              panHitCount += await collectLinksFromWeibo(
                weibo,
                kw,
                uid,
                cfg,
                typeSet,
                seen,
                controller.signal,
                hits,
                diag
              );
              commentsFetched += diag.commentsFetched || 0;
              keywordDropped += diag.keywordDropped || 0;
              skippedOffTopic += diag.skippedOffTopic || 0;
            }
          }
          if (!any) warnings.push(`uid ${uid}: 无关键词命中帖`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const req = /** @type {any} */ (err)?.requestUrl;
          errors.push(`uid ${uid}: ${msg}`);
          if (req) requestUrls.push(req);
        }
      })
    );
  } finally {
    clearTimeout(timer);
  }

  hits.sort((a, b) => b.score - a.score);
  return {
    hits,
    meta: finalizeLiveMeta({
      engine: "weibo",
      mode: "live",
      searchMode: "uids",
      uids: cfg.uids.length,
      postsScanned: posts,
      panHitCount,
      hitsLength: hits.length,
      commentsFetched,
      keywordDropped,
      skippedOffTopic,
      commentSamples: commentSnippets.slice(0, 6),
      commentFetchMeta: commentFetchMeta.slice(0, 6),
      errors,
      warnings,
      requestUrls: [...new Set(requestUrls)].slice(0, 8),
    }),
  };
}

/**
 * @param {string} kw
 * @param {('baidu'|'quark'|'xunlei')[]} cloudTypes
 * @param {ReturnType<typeof resolveWeiboConfig>} cfg
 * @param {number} timeoutMs
 */
async function searchWeiboByKeyword(kw, cloudTypes, cfg, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const typeSet = new Set(cloudTypes);
  /** @type {import('../types.js').SearchHit[]} */
  const hits = [];
  const seen = new Set();
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const requestUrls = [];
  /** @type {string[]} */
  const commentSnippets = [];
  /** @type {object[]} */
  const commentFetchMeta = [];
  let posts = 0;
  let panHitCount = 0;
  let commentsFetched = 0;
  let keywordDropped = 0;
  let skippedOffTopic = 0;
  let lastHttpStatus = null;
  let lastOkCode = null;
  let totalCards = 0;

  try {
    for (let page = 1; page <= cfg.maxPages; page++) {
      try {
        const mCookie = cookieForHost(cfg, "m.weibo.cn");
        if (!mCookie) {
          throw Object.assign(
            new Error(
              "未配置「m.weibo.cn Cookie」槽，无法关键词公开检索。请先打开 https://m.weibo.cn 登录，再复制 Cookie 填到设置里的移动端槽（仅有 weibo.com Cookie 不够）"
            ),
            {
              requestUrl: "https://m.weibo.cn/api/container/getIndex",
              okCode: "need-m-weibo-cookie",
            }
          );
        }
        const { list, requestUrl, httpStatus, okCode, cardCount } = await fetchKeywordSearchPage(
          mCookie,
          kw,
          page,
          controller.signal
        );
        requestUrls.push(requestUrl);
        lastHttpStatus = httpStatus;
        lastOkCode = okCode;
        totalCards += cardCount || 0;
        if (!list.length) {
          if (page === 1) {
            warnings.push(
              `关键词第1页 cards=${cardCount || 0} 但未解析到博文（接口成功但无帖）`
            );
          }
          break;
        }
        for (const weibo of list) {
          posts += 1;
          const diag = {
            commentSnippets,
            commentsFetched: 0,
            commentFetchMeta,
            requestUrls,
            keywordDropped: 0,
            skippedOffTopic: 0,
          };
          panHitCount += await collectLinksFromWeibo(
            weibo,
            kw,
            String(weibo.user?.id || weibo.user?.idstr || ""),
            cfg,
            typeSet,
            seen,
            controller.signal,
            hits,
            diag
          );
          commentsFetched += diag.commentsFetched || 0;
          keywordDropped += diag.keywordDropped || 0;
          skippedOffTopic += diag.skippedOffTopic || 0;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const e = /** @type {any} */ (err);
        errors.push(`kw-p${page}: ${msg}`);
        if (e?.requestUrl) requestUrls.push(e.requestUrl);
        if (e?.httpStatus != null) lastHttpStatus = e.httpStatus;
        if (e?.okCode != null) lastOkCode = e.okCode;
        break;
      }
    }
  } finally {
    clearTimeout(timer);
  }

  hits.sort((a, b) => b.score - a.score);
  return {
    hits,
    meta: finalizeLiveMeta({
      engine: "weibo",
      mode: "live",
      searchMode: "keyword",
      uids: 0,
      pages: cfg.maxPages,
      postsScanned: posts,
      keywordDropped,
      skippedOffTopic,
      panHitCount,
      hitsLength: hits.length,
      commentsFetched,
      commentSamples: commentSnippets.slice(0, 6),
      commentFetchMeta: commentFetchMeta.slice(0, 6),
      cardCount: totalCards,
      httpStatus: lastHttpStatus,
      okCode: lastOkCode,
      errors,
      warnings,
      requestUrls: [...new Set(requestUrls)].slice(0, 8),
    }),
  };
}

/**
 * @param {string} kw
 * @param {('baidu'|'quark'|'xunlei')[]} cloudTypes
 * @param {number} [timeoutMs]
 */
export async function searchWeibo(kw, cloudTypes, timeoutMs = 25000) {
  const cfg = resolveWeiboConfig();
  if (!cfg.enabled) {
    return {
      hits: [],
      meta: {
        engine: "weibo",
        skipped: true,
        ok: false,
        error: "ENABLE_WEIBO / 设置面板未开启",
        reason: "ENABLE_WEIBO / 设置面板未开启",
      },
    };
  }

  const typeSet = new Set(cloudTypes);

  if (cfg.cookieWeiboCom || cfg.cookieMWeibo) {
    /** @type {{ hits: any[], meta: any }} */
    let primary;
    if (cfg.uids.length > 0 && cfg.cookieWeiboCom) {
      primary = await searchWeiboByUids(kw, cloudTypes, cfg, timeoutMs);
      // UID 模式无帖或全失败 → 回退关键词（需 m.weibo.cn Cookie）
      const needFallback =
        primary.hits.length === 0 &&
        (primary.meta.postsScanned === 0 ||
          (Array.isArray(primary.meta.errors) && primary.meta.errors.length > 0));
      if (needFallback) {
        if (!cfg.cookieMWeibo) {
          return {
            hits: primary.hits,
            meta: finalizeLiveMeta({
              ...primary.meta,
              searchMode: "uids",
              fallbackFrom: "uids-blocked",
              uidsAttempted: cfg.uids.length,
              weiboComConfigured: cfg.weiboComConfigured,
              mWeiboConfigured: cfg.mWeiboConfigured,
              errors: [
                ...(primary.meta.errors || []),
                "博主内搜无结果，但未配置「m.weibo.cn Cookie」槽，无法回退关键词公开检索。请打开 m.weibo.cn 登录后粘贴到设置",
              ],
              warnings: primary.meta.warnings || [],
            }),
          };
        }
        const kwResult = await searchWeiboByKeyword(kw, cloudTypes, cfg, timeoutMs);
        const mergedErrors = [
          ...(primary.meta.errors || []),
          ...(kwResult.meta.errors || []),
        ];
        const mergedWarnings = [
          `已从博主内搜回退到关键词公开检索（UID 模式 posts=${primary.meta.postsScanned} hits=0）`,
          ...(primary.meta.warnings || []),
          ...(kwResult.meta.warnings || []),
        ];
        return {
          hits: kwResult.hits,
          meta: finalizeLiveMeta({
            ...kwResult.meta,
            searchMode: "keyword",
            fallbackFrom: "uids",
            uidsAttempted: cfg.uids.length,
            weiboComConfigured: cfg.weiboComConfigured,
            mWeiboConfigured: cfg.mWeiboConfigured,
            errors: mergedErrors,
            warnings: mergedWarnings,
            requestUrls: [
              ...new Set([...(primary.meta.requestUrls || []), ...(kwResult.meta.requestUrls || [])]),
            ].slice(0, 8),
          }),
        };
      }
      return {
        ...primary,
        meta: {
          ...primary.meta,
          weiboComConfigured: cfg.weiboComConfigured,
          mWeiboConfigured: cfg.mWeiboConfigured,
        },
      };
    }
    if (cfg.uids.length > 0 && !cfg.cookieWeiboCom && cfg.cookieMWeibo) {
      // 只有移动端 Cookie：跳过 searchblog，直接关键词
      const kwResult = await searchWeiboByKeyword(kw, cloudTypes, cfg, timeoutMs);
      return {
        hits: kwResult.hits,
        meta: finalizeLiveMeta({
          ...kwResult.meta,
          searchMode: "keyword",
          fallbackFrom: "no-weibo-com-cookie",
          warnings: [
            "未配置「weibo.com Cookie」，已跳过博主内搜，仅用 m.weibo.cn 关键词检索",
            ...(kwResult.meta.warnings || []),
          ],
          weiboComConfigured: false,
          mWeiboConfigured: true,
        }),
      };
    }
    if (!cfg.cookieMWeibo) {
      return {
        hits: [],
        meta: {
          engine: "weibo",
          mode: "live",
          searchMode: "need-m-weibo-cookie",
          ok: false,
          error:
            "关键词公开检索需要「m.weibo.cn Cookie」槽。请先打开 https://m.weibo.cn 登录，再复制 Cookie 填入设置（weibo.com Cookie 不能用于 m.weibo.cn）",
          weiboComConfigured: cfg.weiboComConfigured,
          mWeiboConfigured: false,
        },
      };
    }
    const kwOnly = await searchWeiboByKeyword(kw, cloudTypes, cfg, timeoutMs);
    return {
      ...kwOnly,
      meta: {
        ...kwOnly.meta,
        weiboComConfigured: cfg.weiboComConfigured,
        mWeiboConfigured: cfg.mWeiboConfigured,
      },
    };
  }

  if (cfg.allowDemo) {
    const hits = demoWeiboHits(kw, typeSet);
    return {
      hits,
      meta: {
        engine: "weibo",
        mode: "demo",
        searchMode: "demo",
        ok: true,
        reason: "未配置 Cookie，使用 weibo:demo 夹具",
        hint: "配置有效 Cookie 后走实时检索；演示结果在有 Cookie 时不会混入",
        warning:
          "当前为演示夹具。保存 Cookie 后若变为 0 条，请查看 sourceStats.weibo.error（常见：ok=-100 或博主 UID 无效）",
      },
    };
  }

  return {
    hits: [],
    meta: {
      engine: "weibo",
      mode: "disabled",
      ok: false,
      error: "需要 Cookie（设置面板或 WEIBO_COOKIE），或开启演示模式；UID 可选",
      reason: "需要 Cookie（设置面板或 WEIBO_COOKIE），或开启演示模式；UID 可选",
    },
  };
}

export function weiboStatusSummary() {
  const cfg = resolveWeiboConfig();
  const configured = Boolean(cfg.cookieWeiboCom || cfg.cookieMWeibo);
  return {
    enabled: cfg.enabled,
    configured,
    uidCount: cfg.uids.length,
    searchMode: cfg.searchModeHint,
    fetchComments: cfg.fetchComments,
    allowDemo: cfg.allowDemo,
    cookiePresent: configured,
    weiboComConfigured: cfg.weiboComConfigured,
    mWeiboConfigured: cfg.mWeiboConfigured,
  };
}
