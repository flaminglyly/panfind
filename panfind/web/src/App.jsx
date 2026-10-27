import { useEffect, useRef, useState } from "react";

const CLOUD_OPTIONS = [
  { id: "baidu", label: "百度网盘" },
  { id: "quark", label: "夸克网盘" },
  { id: "xunlei", label: "迅雷网盘" },
];

const CLOUD_LABEL = {
  baidu: "百度",
  quark: "夸克",
  xunlei: "迅雷",
};

export default function App() {
  const [kw, setKw] = useState("");
  const [clouds, setClouds] = useState(["baidu", "quark", "xunlei"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(0);
  const searchedOnce = useRef(false);

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
      // Auto-search from deep link (?kw=) for smoke / shareable URLs
      queueMicrotask(() => {
        if (!cancelled) {
          const fakeEvent = { preventDefault() {} };
          // defer until clouds/state ready
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
    setClouds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((c) => c !== id);
      }
      return [...prev, id];
    });
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
      const params = new URLSearchParams({
        kw: q,
        cloud_types: clouds.join(","),
      });
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
        <h1 className="brand">
          <span className="brand-mark" aria-hidden="true" />
          盘搜
          <span className="brand-en">PanFind</span>
        </h1>
        <p className="tagline">公开分享元搜索 · 百度 / 夸克 / 迅雷 · 按匹配质量排序</p>
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
          {CLOUD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="filter-chip"
              aria-pressed={clouds.includes(opt.id)}
              onClick={() => toggleCloud(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </form>

      {(health || data) && (
        <div className="meta-bar" style={{ marginTop: 22 }}>
          <span className={`mode-badge ${(data ?? health)?.demoMode ? "" : "live"}`}>
            <span className="mode-dot" />
            {(data ?? health)?.modeLabel || (health?.demoMode ? "演示模式" : "实时聚合")}
          </span>
          {!data && health?.liveReady && <span>已连接 PanSou，输入关键词即可检索公开分享</span>}
          {!data && health?.demoMode && <span>当前为演示数据；配置并启动上游后可切实时</span>}
          {data && (
            <span>
              「{data.query}」共 {data.total} 条 · {data.tookMs} ms
            </span>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {!searchedOnce.current && !error && (
        <p className="hint">试试：「速度与激情」「凡人修仙传」「三体」「Python」</p>
      )}

      {data &&
        (data.total === 0 ? (
          <p className="empty">没有找到相关公开分享，换个关键词试试。</p>
        ) : (
          <div className="results">
            {data.results.map((hit, i) => (
              <article
                key={hit.id}
                className="result"
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
                    <span>{hit.source}</span>
                    {hit.datetime && (
                      <span>{new Date(hit.datetime).toLocaleDateString("zh-CN")}</span>
                    )}
                    {hit.password ? (
                      <span className="pwd">提取码 {hit.password}</span>
                    ) : (
                      <span>无需提取码</span>
                    )}
                  </div>
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
                  <a href={hit.url} target="_blank" rel="noreferrer noopener">
                    打开
                  </a>
                </div>
              </article>
            ))}
          </div>
        ))}

      <footer className="footer">
        盘搜仅聚合公开分享链接元数据，不存储网盘文件，不收集私有盘凭证，不提供提取码破解。
        <br />
        结果指向第三方分享，请自行确认版权与有效性。侵权请联系下架。架构参考 PanSou（MIT）元搜索范式。
      </footer>

      <div className={`toast ${toast ? "show" : ""}`} role="status">
        {toast}
      </div>
    </div>
  );
}
