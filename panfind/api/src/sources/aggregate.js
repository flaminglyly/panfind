import {
  countByCloudType,
  filterHitsByCloudTypes,
  searchDemo,
  searchUpstream,
} from "../search.js";
import { searchHunhepanFamily } from "./hunhepan.js";
import { searchWeibo, weiboConfigFromEnv } from "./weibo.js";

/**
 * Normalize share URL for dedupe.
 * @param {string} url
 */
export function canonicalUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    const keep = new URLSearchParams();
    const pwd = u.searchParams.get("pwd") || u.searchParams.get("password");
    if (pwd) keep.set("pwd", pwd);
    u.search = keep.toString() ? `?${keep}` : "";
    return `${u.origin}${u.pathname}${u.search}`.replace(/\/$/, "");
  } catch {
    return String(url || "").split("#")[0];
  }
}

/**
 * @param {import('../types.js').SearchHit[][]} batches
 * @param {number} limit
 */
export function mergeAndDedupe(batches, limit = 120) {
  /** @type {Map<string, import('../types.js').SearchHit>} */
  const map = new Map();
  for (const batch of batches) {
    for (const hit of batch) {
      if (!hit?.url) continue;
      const key = `${hit.cloudType}|${canonicalUrl(hit.url)}`;
      const prev = map.get(key);
      if (!prev || hit.score > prev.score) {
        map.set(key, hit);
      } else if (prev && hit.source && !String(prev.source).includes(String(hit.source).split(":")[0])) {
        prev.source = `${prev.source}+${hit.source.split(":")[0]}`;
      }
    }
  }
  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Parallel multi-source search.
 * @param {object} opts
 * @param {string} opts.kw
 * @param {('baidu'|'quark'|'xunlei'|'uc')[]} opts.cloudTypes
 * @param {string} [opts.pansouUrl]
 * @param {boolean} opts.forceDemo
 * @param {boolean} [opts.enableExt=true]
 * @param {boolean} [opts.enableWeibo]
 */
export async function searchMulti(opts) {
  const {
    kw,
    cloudTypes,
    pansouUrl,
    forceDemo,
    enableExt = true,
    enableWeibo = weiboConfigFromEnv().enabled,
  } = opts;

  /** @type {Record<string, any>} */
  const sourceStats = {};
  /** @type {import('../types.js').SearchHit[][]} */
  const batches = [];
  const tasks = [];

  if (!forceDemo && pansouUrl) {
    tasks.push(
      (async () => {
        const t0 = Date.now();
        try {
          const { hits, meta } = await searchUpstream(pansouUrl, kw, cloudTypes);
          const warn =
            Array.isArray(meta?.warnings) && meta.warnings.length
              ? meta.warnings.join("；")
              : "";
          sourceStats.pansou = {
            ok: true,
            count: hits.length,
            tookMs: Date.now() - t0,
            byType: meta?.byType || {},
            detail: meta,
          };
          if (warn) sourceStats.pansou.warning = warn;
          batches.push(hits);
        } catch (err) {
          sourceStats.pansou = {
            ok: false,
            count: 0,
            error: err instanceof Error ? err.message : String(err),
            tookMs: Date.now() - t0,
          };
        }
      })()
    );
  }

  if (!forceDemo && enableExt) {
    tasks.push(
      (async () => {
        const t0 = Date.now();
        try {
          const { hits, meta } = await searchHunhepanFamily(kw, cloudTypes);
          const warn =
            Array.isArray(meta?.warnings) && meta.warnings.length
              ? meta.warnings.join("；")
              : "";
          sourceStats.hunhepanFamily = {
            ok: true,
            count: hits.length,
            tookMs: Date.now() - t0,
            byType: meta?.byType || {},
            detail: meta,
          };
          if (warn) sourceStats.hunhepanFamily.warning = warn;
          batches.push(hits);
        } catch (err) {
          sourceStats.hunhepanFamily = {
            ok: false,
            count: 0,
            error: err instanceof Error ? err.message : String(err),
            tookMs: Date.now() - t0,
          };
        }
      })()
    );
  }

  if (!forceDemo && enableWeibo) {
    tasks.push(
      (async () => {
        const t0 = Date.now();
        try {
          const { hits, meta } = await searchWeibo(kw, cloudTypes);
          const liveEmpty =
            meta?.mode === "live" && hits.length === 0;
          const errMsg =
            meta?.error ||
            (Array.isArray(meta?.errors) && meta.errors[0]) ||
            meta?.reason ||
            (liveEmpty ? "微博实时检索 0 条（见 detail）" : "");
          const warnMsg =
            meta?.warning ||
            (Array.isArray(meta?.warnings) && meta.warnings[0]) ||
            "";
          sourceStats.weibo = {
            ok: meta?.ok === true || (hits.length > 0 && meta?.mode === "demo"),
            count: hits.length,
            tookMs: Date.now() - t0,
            byType: countByCloudType(hits),
            detail: meta,
            configured: Boolean(weiboConfigFromEnv().cookie),
          };
          if (errMsg) sourceStats.weibo.error = errMsg;
          if (warnMsg) sourceStats.weibo.warning = warnMsg;
          if (hits.length) batches.push(hits);
        } catch (err) {
          sourceStats.weibo = {
            ok: false,
            count: 0,
            error: err instanceof Error ? err.message : String(err),
            tookMs: Date.now() - t0,
          };
        }
      })()
    );
  }

  await Promise.all(tasks);

  // Final hard filter — never surface unselected pan types after merge
  let results = filterHitsByCloudTypes(mergeAndDedupe(batches, 120), cloudTypes);
  let demoMode = false;
  let modeLabel = "多源实时聚合";

  const anyLive = Object.values(sourceStats).some((s) => s.ok && s.count > 0);
  if (!anyLive) {
    results = filterHitsByCloudTypes(searchDemo(kw, cloudTypes), cloudTypes);
    demoMode = true;
    modeLabel = forceDemo ? "演示模式（强制）" : "演示模式（无可用上游）";
  } else {
    const parts = [];
    if (sourceStats.pansou?.ok) parts.push(`PanSou ${sourceStats.pansou.count}`);
    if (sourceStats.hunhepanFamily?.ok) parts.push(`混合盘系 ${sourceStats.hunhepanFamily.count}`);
    if (sourceStats.weibo?.count > 0) {
      const sm = sourceStats.weibo.detail?.searchMode;
      const mode =
        sourceStats.weibo.detail?.mode === "demo"
          ? "微博演示"
          : sm === "keyword"
            ? "微博关键词"
            : sm === "uids"
              ? "微博博主"
              : "微博";
      parts.push(`${mode} ${sourceStats.weibo.count}`);
    }
    modeLabel = `多源实时（${parts.join(" + ")} → 去重 ${results.length}）`;
    // Partial demo: weibo fixtures mixed with live — mark demoMode only if ALL batches are demo-ish
    const onlyWeiboDemo =
      !sourceStats.pansou?.count &&
      !sourceStats.hunhepanFamily?.count &&
      sourceStats.weibo?.detail?.mode === "demo";
    if (onlyWeiboDemo) {
      demoMode = true;
      modeLabel = `演示（微博夹具 ${sourceStats.weibo.count}；请配置 Cookie 切实时）`;
    }
  }

  return { results, demoMode, modeLabel, sourceStats };
}
