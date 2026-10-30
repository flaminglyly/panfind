/**
 * 微博源产品内配置：读写本机 JSON（勿提交 git）。
 * 路径：panfind/.data/weibo-config.json（可用 WEIBO_CONFIG_PATH 覆盖）
 *
 * Cookie 分槽（v0.3.3+）：
 * - cookieWeiboCom → weibo.com（searchblog / buildComments）
 * - cookieMWeibo   → m.weibo.cn（关键词 getIndex / hotflow）
 * - cookie         → 旧字段；若分槽为空则作为两者回退
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_PATH = path.join(ROOT, ".data", "weibo-config.json");

/**
 * @typedef {{
 *   enabled?: boolean,
 *   cookie?: string,
 *   cookieWeiboCom?: string,
 *   cookieMWeibo?: string,
 *   uids?: string[],
 *   bloggers?: { uid: string, nick?: string }[],
 *   fetchComments?: boolean,
 *   maxPages?: number,
 *   allowDemo?: boolean,
 *   updatedAt?: string,
 * }} WeiboFileConfig
 */

export function weiboConfigPath() {
  return (process.env.WEIBO_CONFIG_PATH || DEFAULT_PATH).trim();
}

/**
 * @returns {WeiboFileConfig}
 */
export function readWeiboFileConfig() {
  const p = weiboConfigPath();
  try {
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/**
 * @param {WeiboFileConfig} next
 */
export function writeWeiboFileConfig(next) {
  const p = weiboConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const payload = {
    ...next,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(p, JSON.stringify(payload, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    /* ignore on some FS */
  }
  return payload;
}

/**
 * Normalize uids from bloggers[] or uids[]
 * @param {WeiboFileConfig} file
 * @returns {string[]}
 */
export function uidsFromFile(file) {
  if (Array.isArray(file.bloggers) && file.bloggers.length) {
    return file.bloggers
      .map((b) => {
        const m = String(b?.uid || "").match(/(\d{5,})/);
        return m ? m[1] : "";
      })
      .filter(Boolean);
  }
  if (Array.isArray(file.uids)) {
    return file.uids
      .map((s) => {
        const m = String(s).match(/(\d{5,})/);
        return m ? m[1] : "";
      })
      .filter(Boolean);
  }
  return [];
}

/**
 * @param {string|undefined|null} v
 */
function trimCookie(v) {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

/**
 * Resolve dual-slot cookies with legacy fallback.
 * Priority per slot: dedicated field > env dedicated > legacy cookie > WEIBO_COOKIE.
 *
 * @param {WeiboFileConfig} file
 * @returns {{ cookieWeiboCom: string, cookieMWeibo: string, cookieLegacy: string }}
 */
export function resolveCookieSlots(file) {
  const legacy =
    trimCookie(file.cookie) || trimCookie(process.env.WEIBO_COOKIE);
  const envCom = trimCookie(process.env.WEIBO_COOKIE_COM);
  const envM = trimCookie(process.env.WEIBO_COOKIE_M);
  const cookieWeiboCom = trimCookie(file.cookieWeiboCom) || envCom || legacy;
  const cookieMWeibo = trimCookie(file.cookieMWeibo) || envM || legacy;
  return { cookieWeiboCom, cookieMWeibo, cookieLegacy: legacy };
}

/**
 * Public-safe view (never returns full cookie).
 * @param {WeiboFileConfig} file
 * @param {ReturnType<import('../sources/weibo.js').resolveWeiboConfig>} resolved
 */
export function publicWeiboConfigView(file, resolved) {
  const slots = resolveCookieSlots(file);
  const com = resolved.cookieWeiboCom || slots.cookieWeiboCom || "";
  const m = resolved.cookieMWeibo || slots.cookieMWeibo || "";
  const any = com || m;

  const bloggers =
    Array.isArray(file.bloggers) && file.bloggers.length
      ? file.bloggers.map((b) => ({
          uid: String(b.uid || "").replace(/\D/g, "") || String(b.uid || ""),
          nick: String(b.nick || "").slice(0, 40),
        }))
      : resolved.uids.map((uid) => ({ uid, nick: "" }));

  return {
    enabled: resolved.enabled,
    /** @deprecated use weiboComConfigured / mWeiboConfigured */
    cookiePresent: Boolean(any),
    cookieHint: any
      ? `已保存 · weibo.com ${com ? "有" : "无"} · m.weibo.cn ${m ? "有" : "无"}`
      : "",
    weiboComConfigured: Boolean(com),
    mWeiboConfigured: Boolean(m),
    cookieWeiboComHint: com ? `已保存 · 长度 ${com.length} · …${com.slice(-6)}` : "",
    cookieMWeiboHint: m ? `已保存 · 长度 ${m.length} · …${m.slice(-6)}` : "",
    bloggers,
    uids: resolved.uids,
    fetchComments: resolved.fetchComments,
    maxPages: resolved.maxPages,
    allowDemo: resolved.allowDemo,
    searchMode: resolved.searchModeHint,
    configPath: weiboConfigPath(),
    updatedAt: file.updatedAt || null,
    fromFile: Object.keys(file).length > 0,
  };
}
