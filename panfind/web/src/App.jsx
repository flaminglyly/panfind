import { useEffect, useRef, useState } from "react";
import {
  ALL_CLOUD_IDS,
  cloudTypesQueryValue,
  filterResultsByClouds,
  isCloudSelected,
  toggleCloudSelection,
} from "./cloudFilter.js";

const CLOUD_OPTIONS = [
  { id: "baidu", label: "百度网盘" },
  { id: "quark", label: "夸克网盘" },
  { id: "xunlei", label: "迅雷网盘" },
  { id: "uc", label: "UC网盘" },
];

const CLOUD_LABEL = {
  baidu: "百度",
  quark: "夸克",
  xunlei: "迅雷",
  uc: "UC",
};

const LS_KEY = "panfind.weibo.draft";

function isWeiboHit(hit) {
  return (
    hit?.origin === "weibo" ||
    String(hit?.source || "").startsWith("weibo:") ||
    Boolean(hit?.weiboUid || hit?.weiboNick || hit?.weiboPostUrl)
  );
}

/** Demo or missing mid/uid: do not offer a clickable weibo URL */
function weiboLinkOpenable(hit) {
  if (!hit) return false;
  if (hit.demo === true || hit.weiboLinkOk === false) return false;
  const u = String(hit.weiboPostUrl || "").trim();
  if (!u) return false;
  // Guard against leftover fake demo profile URLs
  if (/weibo\.com\/u\/(?:10001|10002|demo)/i.test(u)) return false;
  return /^https?:\/\//i.test(u);
}

function emptyBlogger() {
  return { uid: "", nick: "" };
}

export default function App() {
  const [kw, setKw] = useState("");
  // [] = 全部类型（芯片全亮）；非空 = 严格白名单
  const [clouds, setClouds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [toast, setToast] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [changelog, setChangelog] = useState([]);
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgMsg, setCfgMsg] = useState("");
  const [cfg, setCfg] = useState({
    enabled: false,
    cookiePresent: false,
    cookieHint: "",
    weiboComConfigured: false,
    mWeiboConfigured: false,
    cookieWeiboComHint: "",
    cookieMWeiboHint: "",
    cookieWeiboComInput: "",
    cookieMWeiboInput: "",
    clearCookieWeiboCom: false,
    clearCookieMWeibo: false,
    bloggers: [emptyBlogger()],
    fetchComments: true,
    maxPages: 2,
    allowDemo: false,
    searchMode: "off",
    configPath: "",
  });
  const toastTimer = useRef(0);
  const searchedOnce = useRef(false);

  const appVersion = health?.version || "…";
  const appBuildTime = health?.buildTime || "";
  // Chip selection filters the visible list live (empty chips = show all from last response)
  const visibleResults = filterResultsByClouds(data?.results, clouds);
  const visibleTotal = visibleResults.length;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => {
        if (!cancelled) setHealth(h);
      })
      .catch(() => {
        if (!cancelled) setHealth({ demoMode: true, modeLabel: "健康检查失败" });
      });

    const params = new URLSearchParams(window.location.search);
    const initial = (params.get("kw") || params.get("q") || "").trim();
    if (initial) {
      setKw(initial);
      queueMicrotask(() => {
        if (!cancelled) {
          const fakeEvent = { preventDefault() {} };
          setTimeout(() => {
            if (!cancelled) runSearch(fakeEvent, initial);
          }, 50);
        }
      });
    }

    return () => {
      cancelled = true;
      clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only deep link
  }, []);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  }

  function toggleCloud(id) {
    setClouds((prev) => toggleCloudSelection(prev, id, ALL_CLOUD_IDS));
  }

  async function loadWeiboConfig() {
    setCfgLoading(true);
    setCfgMsg("");
    try {
      const res = await fetch("/api/config/weibo");
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "加载配置失败");
      const c = json.config || {};
      let draft = null;
      try {
        draft = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      } catch {
        draft = null;
      }
      const bloggers =
        Array.isArray(c.bloggers) && c.bloggers.length
          ? c.bloggers.map((b) => ({ uid: b.uid || "", nick: b.nick || "" }))
          : draft?.bloggers?.length
            ? draft.bloggers
            : [emptyBlogger()];
      setCfg({
        enabled: Boolean(c.enabled),
        cookiePresent: Boolean(c.cookiePresent),
        cookieHint: c.cookieHint || "",
        weiboComConfigured: Boolean(c.weiboComConfigured),
        mWeiboConfigured: Boolean(c.mWeiboConfigured),
        cookieWeiboComHint: c.cookieWeiboComHint || "",
        cookieMWeiboHint: c.cookieMWeiboHint || "",
        cookieWeiboComInput: "",
        cookieMWeiboInput: "",
        clearCookieWeiboCom: false,
        clearCookieMWeibo: false,
        bloggers,
        fetchComments: c.fetchComments !== false,
        maxPages: c.maxPages || 2,
        allowDemo: Boolean(c.allowDemo),
        searchMode: c.searchMode || "off",
        configPath: c.configPath || "",
      });
    } catch (err) {
      setCfgMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setCfgLoading(false);
    }
  }

  function openSettings() {
    setSettingsOpen(true);
    loadWeiboConfig();
  }

  async function openAbout() {
    setAboutOpen(true);
    try {
      const res = await fetch("/api/changelog");
      const json = await res.json();
      if (res.ok && json.ok) {
        setChangelog(Array.isArray(json.changelog) ? json.changelog : []);
        if (json.version || json.buildTime) {
          setHealth((h) => ({
            ...(h || {}),
            version: json.version || h?.version,
            buildTime: json.buildTime || h?.buildTime,
            name: json.name || h?.name,
          }));
        }
      }
    } catch {
      /* keep empty changelog */
    }
  }

  function updateBlogger(i, field, value) {
    setCfg((prev) => {
      const bloggers = prev.bloggers.map((b, idx) =>
        idx === i ? { ...b, [field]: value } : b
      );
      return { ...prev, bloggers };
    });
  }

  function addBlogger() {
    setCfg((prev) => ({ ...prev, bloggers: [...prev.bloggers, emptyBlogger()] }));
  }

  function removeBlogger(i) {
    setCfg((prev) => {
      const bloggers = prev.bloggers.filter((_, idx) => idx !== i);
      return { ...prev, bloggers: bloggers.length ? bloggers : [emptyBlogger()] };
    });
  }

  async function saveWeiboConfig(e) {
    e?.preventDefault();
    setCfgSaving(true);
    setCfgMsg("");
    try {
      const bloggers = cfg.bloggers
        .map((b) => ({
          uid: String(b.uid || "").trim(),
          nick: String(b.nick || "").trim(),
        }))
        .filter((b) => /\d{5,}/.test(b.uid));

      const body = {
        enabled: cfg.enabled,
        bloggers,
        fetchComments: cfg.fetchComments,
        maxPages: Number(cfg.maxPages) || 2,
        allowDemo: cfg.allowDemo,
        clearCookieWeiboCom: cfg.clearCookieWeiboCom,
        clearCookieMWeibo: cfg.clearCookieMWeibo,
      };
      if (cfg.cookieWeiboComInput.trim()) body.cookieWeiboCom = cfg.cookieWeiboComInput.trim();
      if (cfg.cookieMWeiboInput.trim()) body.cookieMWeibo = cfg.cookieMWeiboInput.trim();

      // localStorage 草稿（不含完整 cookie，仅开关与博主列表）
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          enabled: cfg.enabled,
          bloggers,
          allowDemo: cfg.allowDemo,
          fetchComments: cfg.fetchComments,
          maxPages: cfg.maxPages,
          savedAt: Date.now(),
        })
      );

      const res = await fetch("/api/config/weibo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "保存失败");
      setCfgMsg(json.message || "已保存");
      showToast("微博设置已保存");
      setCfg((prev) => ({
        ...prev,
        cookieWeiboComInput: "",
        cookieMWeiboInput: "",
        clearCookieWeiboCom: false,
        clearCookieMWeibo: false,
        cookiePresent: json.config?.cookiePresent ?? prev.cookiePresent,
        cookieHint: json.config?.cookieHint || prev.cookieHint,
        weiboComConfigured: Boolean(json.config?.weiboComConfigured),
        mWeiboConfigured: Boolean(json.config?.mWeiboConfigured),
        cookieWeiboComHint: json.config?.cookieWeiboComHint || "",
        cookieMWeiboHint: json.config?.cookieMWeiboHint || "",
        searchMode: json.config?.searchMode || prev.searchMode,
        bloggers:
          Array.isArray(json.config?.bloggers) && json.config.bloggers.length
            ? json.config.bloggers
            : prev.bloggers,
      }));
      const h = await fetch("/api/health").then((r) => r.json());
      setHealth(h);
    } catch (err) {
      setCfgMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setCfgSaving(false);
    }
  }

  async function runSearch(e, overrideKw) {
    e?.preventDefault();
    const q = (overrideKw ?? kw).trim();
    if (!q) {
      setError("请输入关键词");
      return;
    }
    setLoading(true);
    setError("");
    searchedOnce.current = true;
    try {
      // Empty chips → omit param → API treats as all types
      const params = new URLSearchParams({ kw: q });
      const ct = cloudTypesQueryValue(clouds);
      if (ct) params.set("cloud_types", ct);
      const res = await fetch(`/api/search?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `请求失败 ${res.status}`);
      setData(json);
      const next = new URL(window.location.href);
      next.searchParams.set("kw", q);
      window.history.replaceState({}, "", next);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`已复制${label}`);
    } catch {
      showToast("复制失败，请手动选择");
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-top">
          <button type="button" className="settings-btn" onClick={openAbout}>
            关于 v{appVersion}
          </button>
          <button type="button" className="settings-btn" onClick={openSettings}>
            微博设置
          </button>
        </div>
        <h1 className="brand">
          <span className="brand-mark" aria-hidden="true" />
          盘搜
          <span className="brand-en">PanFind</span>
        </h1>
        <p className="tagline">公开分享元搜索 · 百度 / 夸克 / 迅雷 / UC · 按匹配质量排序</p>
      </header>

      <form className="search-panel" onSubmit={runSearch}>
        <div className="search-row">
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="输入影视、剧集、文档等关键词…"
            aria-label="搜索关键词"
            autoFocus
          />
          <button type="submit" disabled={loading}>
            {loading ? "搜索中…" : "搜索"}
          </button>
        </div>
        <div className="filters" role="group" aria-label="网盘类型">
          {CLOUD_OPTIONS.map((opt) => {
            const on = isCloudSelected(clouds, opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                className={`filter-chip ${on ? "is-on" : "is-off"}`}
                aria-pressed={on}
                title={on ? `已选 · 点击排除「${opt.label}」` : `未选 · 点击加入「${opt.label}」`}
                onClick={() => toggleCloud(opt.id)}
              >
                <span className="filter-chip-mark" aria-hidden="true">
                  {on ? "✓" : "–"}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="filter-hint" role="note">
          {clouds.length === 0
            ? "网盘筛选：全部（实心=计入结果；再点可排除）"
            : `网盘筛选：仅 ${clouds.map((id) => CLOUD_LABEL[id] || id).join("、")}（点 ✓ 排除；全排除后恢复全部）`}
        </p>
      </form>

      {(health || data) && (
        <div className="meta-bar" style={{ marginTop: 22 }}>
          <span className={`mode-badge ${(data ?? health)?.demoMode ? "" : "live"}`}>
            <span className="mode-dot" />
            {(data ?? health)?.modeLabel || (health?.demoMode ? "演示模式" : "实时聚合")}
          </span>
          {!data && health?.liveReady && (
            <span>
              {health.weibo?.enabled
                ? `多源就绪（含微博）· weibo.com Cookie ${
                    health.weibo.weiboComConfigured ? "有" : "无"
                  } · m.weibo.cn Cookie ${health.weibo.mWeiboConfigured ? "有" : "无"}`
                : health.extSourcesEnabled
                  ? "多源就绪（PanSou + 混合盘系），输入关键词检索公开分享"
                  : "已连接上游，输入关键词即可检索公开分享"}
            </span>
          )}
          {!data && health?.demoMode && <span>当前为演示数据；配置并启动上游后可切实时</span>}
          {data && (
            <span>
              「{data.query}」共 {visibleTotal} 条
              {visibleTotal !== data.total ? `（筛选前 ${data.total}）` : ""} · {data.tookMs} ms
              {data.sourceStats
                ? ` · 源 ${Object.entries(data.sourceStats)
                    .map(([k, v]) => `${k}:${v.count ?? 0}`)
                    .join(" / ")}`
                : ""}
            </span>
          )}
        </div>
      )}

      {data?.sourceStats &&
        (data.sourceStats.pansou?.warning || data.sourceStats.hunhepanFamily?.warning) && (
          <div className="weibo-diag is-warn" role="status" data-testid="cloud-type-diag">
            <strong>网盘类型</strong>
            {data.sourceStats.pansou?.warning ? (
              <span>PanSou：{data.sourceStats.pansou.warning}</span>
            ) : null}
            {data.sourceStats.pansou?.byType ? (
              <span>
                PanSou 分型{" "}
                {Object.entries(data.sourceStats.pansou.byType)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(" ") || "无"}
              </span>
            ) : null}
            {data.sourceStats.hunhepanFamily?.warning ? (
              <span>混合盘系：{data.sourceStats.hunhepanFamily.warning}</span>
            ) : null}
            {data.sourceStats.hunhepanFamily?.byType ? (
              <span>
                混合盘系分型{" "}
                {Object.entries(data.sourceStats.hunhepanFamily.byType)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(" ") || "无"}
              </span>
            ) : null}
            {data.sourceStats.weibo?.byType ? (
              <span>
                微博分型{" "}
                {Object.entries(data.sourceStats.weibo.byType)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(" ") || "无"}
              </span>
            ) : null}
          </div>
        )}

      {data?.sourceStats?.weibo &&
        (data.sourceStats.weibo.error || data.sourceStats.weibo.warning) && (
          <div
            className={`weibo-diag ${data.sourceStats.weibo.error ? "is-error" : "is-warn"}`}
            role="status"
            data-testid="weibo-diag"
          >
            <strong>微博源</strong>
            {data.sourceStats.weibo.error ? (
              <span>错误：{data.sourceStats.weibo.error}</span>
            ) : null}
            {data.sourceStats.weibo.warning ? (
              <span>提示：{data.sourceStats.weibo.warning}</span>
            ) : null}
            {data.sourceStats.weibo.detail?.searchMode ? (
              <span>模式 {data.sourceStats.weibo.detail.searchMode}</span>
            ) : null}
            {data.sourceStats.weibo.detail?.postsScanned != null ? (
              <span>扫帖 {data.sourceStats.weibo.detail.postsScanned}</span>
            ) : null}
            {data.sourceStats.weibo.detail?.commentsFetched != null ? (
              <span>评论 {data.sourceStats.weibo.detail.commentsFetched}</span>
            ) : null}
            {Array.isArray(data.sourceStats.weibo.detail?.commentFetchMeta) &&
            data.sourceStats.weibo.detail.commentFetchMeta[0] ? (
              <span
                className="weibo-diag-url"
                title={JSON.stringify(data.sourceStats.weibo.detail.commentFetchMeta[0])}
              >
                评论接口{" "}
                {data.sourceStats.weibo.detail.commentFetchMeta[0].endpoint || "?"}
                {data.sourceStats.weibo.detail.commentFetchMeta[0].midUsed
                  ? ` mid=${data.sourceStats.weibo.detail.commentFetchMeta[0].midUsed}`
                  : ""}
                {data.sourceStats.weibo.detail.commentFetchMeta[0].httpStatus != null
                  ? ` HTTP ${data.sourceStats.weibo.detail.commentFetchMeta[0].httpStatus}`
                  : ""}
              </span>
            ) : null}
            {Array.isArray(data.sourceStats.weibo.detail?.commentSamples) &&
            data.sourceStats.weibo.detail.commentSamples[0] ? (
              <span
                className="weibo-diag-url"
                title={data.sourceStats.weibo.detail.commentSamples.join("\n")}
              >
                样例 {data.sourceStats.weibo.detail.commentSamples[0]}
              </span>
            ) : null}
            {Array.isArray(data.sourceStats.weibo.detail?.requestUrls) &&
            data.sourceStats.weibo.detail.requestUrls[0] ? (
              <span className="weibo-diag-url" title={data.sourceStats.weibo.detail.requestUrls.join("\n")}>
                请求 {data.sourceStats.weibo.detail.requestUrls.slice(-1)[0]}
              </span>
            ) : null}
          </div>
        )}

      {error && <p className="error">{error}</p>}

      {!searchedOnce.current && !error && (
        <p className="hint">试试：「速度与激情」「凡人修仙传」「三体」「Python」</p>
      )}

      {data &&
        (visibleTotal === 0 ? (
          <p className="empty">
            {data.total === 0
              ? "没有找到相关公开分享，换个关键词试试。"
              : "当前网盘类型筛选下没有结果，试试勾选更多类型或重新搜索。"}
          </p>
        ) : (
          <div className="results">
            {visibleResults.map((hit, i) => {
              const weibo = isWeiboHit(hit);
              return (
                <article
                  key={hit.id}
                  className={`result ${weibo ? "result-weibo" : ""}`}
                  style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}
                >
                  <span className={`cloud-tag ${hit.cloudType}`}>
                    {CLOUD_LABEL[hit.cloudType] || hit.cloudType}
                  </span>
                  <div className="result-main">
                    <h2>{hit.title}</h2>
                    <p className="result-url">{hit.url}</p>
                    <div className="result-meta">
                      <span>评分 {hit.score.toFixed(2)}</span>
                      <span className={`src-tag ${weibo ? "src-weibo" : ""}`} title="数据来源">
                        {hit.source}
                      </span>
                      {hit.datetime && (
                        <span>{new Date(hit.datetime).toLocaleDateString("zh-CN")}</span>
                      )}
                      {hit.password ? (
                        <span className="pwd">提取码 {hit.password}</span>
                      ) : (
                        <span>无需提取码</span>
                      )}
                    </div>
                    {weibo && (
                      <div className="weibo-origin" data-testid="weibo-origin">
                        <span className="weibo-pill">微博来源</span>
                        <span>
                          博主 {hit.weiboNick || "未知"}
                          {hit.weiboUid ? ` · UID ${hit.weiboUid}` : ""}
                          {hit.weiboMid ? ` · mid ${hit.weiboMid}` : ""}
                        </span>
                        {weiboLinkOpenable(hit) ? (
                          <a href={hit.weiboPostUrl} target="_blank" rel="noreferrer noopener">
                            打开微博
                          </a>
                        ) : (
                          <span className="weibo-dead" title="演示夹具或缺少真实 mid/uid，禁止跳转假链">
                            {hit.weiboLinkNote || (hit.demo ? "演示·不可跳转" : "无可用微博链接")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="result-actions">
                    <button type="button" onClick={() => copyText(hit.url, "链接")}>
                      复制链接
                    </button>
                    {hit.password ? (
                      <button type="button" onClick={() => copyText(hit.password, "提取码")}>
                        复制提取码
                      </button>
                    ) : null}
                    {weibo && weiboLinkOpenable(hit) ? (
                      <button type="button" onClick={() => copyText(hit.weiboPostUrl, "微博链接")}>
                        复制微博链
                      </button>
                    ) : null}
                    <a href={hit.url} target="_blank" rel="noreferrer noopener">
                      打开
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        ))}

      <footer className="footer">
        <div className="footer-version">
          <button type="button" className="version-link" onClick={openAbout}>
            盘搜 v{appVersion}
          </button>
          {appBuildTime ? (
            <span className="build-time">
              构建 {new Date(appBuildTime).toLocaleString("zh-CN", { hour12: false })}
            </span>
          ) : null}
          <button type="button" className="version-link" onClick={openAbout}>
            变更说明
          </button>
        </div>
        盘搜仅聚合公开分享链接元数据，不存储网盘文件，不收集私有盘凭证，不提供提取码破解。
        <br />
        结果指向第三方分享，请自行确认版权与有效性。侵权请联系下架。架构参考 PanSou（MIT）元搜索范式。
      </footer>

      {aboutOpen && (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="关于与变更说明">
          <div className="settings-panel about-panel">
            <div className="settings-head">
              <h2>关于盘搜</h2>
              <button type="button" className="settings-close" onClick={() => setAboutOpen(false)}>
                关闭
              </button>
            </div>
            <p className="about-lead">
              版本 <strong>v{appVersion}</strong>
              {appBuildTime
                ? ` · 构建于 ${new Date(appBuildTime).toLocaleString("zh-CN", { hour12: false })}`
                : ""}
              {health?.channel ? ` · ${health.channel}` : ""}
            </p>
            <p className="settings-hint">
              公开分享元搜索。也可通过 <code>/api/health</code>、<code>/api/version</code>、
              <code>/api/changelog</code> 查看版本与变更。
            </p>
            <h3 className="changelog-heading">变更说明</h3>
            <div className="changelog-list">
              {changelog.length === 0 ? (
                <p className="settings-hint">加载中或暂无条目…</p>
              ) : (
                changelog.map((rel) => (
                  <section key={rel.version} className="changelog-item">
                    <header>
                      <span className="changelog-ver">v{rel.version}</span>
                      <span className="changelog-date">{rel.date}</span>
                      <span className="changelog-title">{rel.title}</span>
                    </header>
                    <ul>
                      {(rel.items || []).map((line, i) => (
                        <li key={`${rel.version}-${i}`}>{line}</li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>
            <div className="settings-actions">
              <button type="button" className="ghost" onClick={() => setAboutOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="微博设置">
          <div className="settings-panel">
            <div className="settings-head">
              <h2>微博源设置</h2>
              <button type="button" className="settings-close" onClick={() => setSettingsOpen(false)}>
                关闭
              </button>
            </div>
            {cfgLoading ? (
              <p className="settings-hint">加载中…</p>
            ) : (
              <form className="settings-form" onSubmit={saveWeiboConfig}>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(e) => setCfg((p) => ({ ...p, enabled: e.target.checked }))}
                  />
                  <span>启用微博源（ENABLE_WEIBO）</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={cfg.allowDemo}
                    onChange={(e) => setCfg((p) => ({ ...p, allowDemo: e.target.checked }))}
                  />
                  <span>无 Cookie 时使用演示夹具（WEIBO_ALLOW_DEMO）</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={cfg.fetchComments}
                    onChange={(e) => setCfg((p) => ({ ...p, fetchComments: e.target.checked }))}
                  />
                  <span>拉取热评提取链接</span>
                </label>

                <p className="settings-hint">
                  Cookie 按域名分槽保存到本机（不提交 git）。
                  <strong>weibo.com</strong> 用于博主内搜与评论；
                  <strong>m.weibo.cn</strong> 用于关键词公开检索。两处登录态不同，请分别打开对应站点再复制。
                </p>
                <p className="settings-hint">
                  状态：weibo.com {cfg.weiboComConfigured ? "已配置" : "未配置"} · m.weibo.cn{" "}
                  {cfg.mWeiboConfigured ? "已配置" : "未配置"}
                  {cfg.cookieHint ? `（${cfg.cookieHint}）` : ""}
                </p>

                <label className="field-label">
                  weibo.com Cookie（博主内搜 searchblog、评论 buildComments）
                  <textarea
                    rows={3}
                    value={cfg.cookieWeiboComInput}
                    onChange={(e) =>
                      setCfg((p) => ({
                        ...p,
                        cookieWeiboComInput: e.target.value,
                        clearCookieWeiboCom: false,
                      }))
                    }
                    placeholder={
                      cfg.weiboComConfigured
                        ? `${cfg.cookieWeiboComHint}（留空则保持）`
                        : "先打开 https://weibo.com 登录 → F12 → 复制 Cookie…"
                    }
                    spellCheck={false}
                    autoComplete="off"
                  />
                </label>
                {cfg.weiboComConfigured && (
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={cfg.clearCookieWeiboCom}
                      onChange={(e) =>
                        setCfg((p) => ({ ...p, clearCookieWeiboCom: e.target.checked }))
                      }
                    />
                    <span>清除 weibo.com Cookie</span>
                  </label>
                )}

                <label className="field-label">
                  m.weibo.cn Cookie（关键词公开检索 getIndex；评论 hotflow 回退）
                  <textarea
                    rows={3}
                    value={cfg.cookieMWeiboInput}
                    onChange={(e) =>
                      setCfg((p) => ({
                        ...p,
                        cookieMWeiboInput: e.target.value,
                        clearCookieMWeibo: false,
                      }))
                    }
                    placeholder={
                      cfg.mWeiboConfigured
                        ? `${cfg.cookieMWeiboHint}（留空则保持）`
                        : "先打开 https://m.weibo.cn 登录 → F12 → 复制 Cookie…（weibo.com 的不能替代）"
                    }
                    spellCheck={false}
                    autoComplete="off"
                  />
                </label>
                {cfg.mWeiboConfigured && (
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={cfg.clearCookieMWeibo}
                      onChange={(e) =>
                        setCfg((p) => ({ ...p, clearCookieMWeibo: e.target.checked }))
                      }
                    />
                    <span>清除 m.weibo.cn Cookie</span>
                  </label>
                )}

                <div className="field-label">
                  资源博主列表（可选；为空则关键词公开检索）
                  <div className="blogger-list">
                    {cfg.bloggers.map((b, i) => (
                      <div className="blogger-row" key={`b-${i}`}>
                        <input
                          value={b.uid}
                          onChange={(e) => updateBlogger(i, "uid", e.target.value)}
                          placeholder="UID / weibo.com/u/…"
                          aria-label={`博主 UID ${i + 1}`}
                        />
                        <input
                          value={b.nick}
                          onChange={(e) => updateBlogger(i, "nick", e.target.value)}
                          placeholder="备注昵称（可选）"
                          aria-label={`博主昵称 ${i + 1}`}
                        />
                        <button type="button" className="linkish" onClick={() => removeBlogger(i)}>
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="add-blogger" onClick={addBlogger}>
                    + 添加博主
                  </button>
                </div>

                <label className="field-label">
                  检索页数（1–5）
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={cfg.maxPages}
                    onChange={(e) => setCfg((p) => ({ ...p, maxPages: Number(e.target.value) || 2 }))}
                  />
                </label>

                <p className="settings-hint">
                  当前模式：{cfg.searchMode}
                  {cfg.configPath ? ` · 文件 ${cfg.configPath}` : ""}
                  <br />
                  关键词检索走 m.weibo.cn，请从已登录的 m.weibo.cn 复制 Cookie（含 SUB）。若仅 PC weibo.com
                  Cookie，可能返回 ok=-100。博主 UID 留空则全站关键词搜；填错 UID 会先失败再自动回退关键词。
                  <br />
                  仅公开内容；不破解登录/限流。开关/博主草稿在 localStorage；Cookie 只写入本机配置文件（不入库）。
                </p>

                {cfgMsg && <p className="settings-msg">{cfgMsg}</p>}

                <div className="settings-actions">
                  <button type="submit" disabled={cfgSaving}>
                    {cfgSaving ? "保存中…" : "保存配置"}
                  </button>
                  <button type="button" className="ghost" onClick={() => setSettingsOpen(false)}>
                    取消
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`} role="status">
        {toast}
      </div>
    </div>
  );
}
