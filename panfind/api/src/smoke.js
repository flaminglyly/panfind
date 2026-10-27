const BASE = process.env.SMOKE_BASE || `http://127.0.0.1:${process.env.PORT || 8787}`;

const keywords = ["速度与激情", "凡人修仙传", "三体", "Python"];

async function main() {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  console.log("health:", health);

  for (const kw of keywords) {
    const url = `${BASE}/api/search?kw=${encodeURIComponent(kw)}&cloud_types=baidu,quark,xunlei`;
    const data = await fetch(url).then((r) => r.json());
    console.log(`\n== ${kw} == mode=${data.modeLabel} total=${data.total} took=${data.tookMs}ms`);
    for (const hit of (data.results || []).slice(0, 3)) {
      console.log(`  [${hit.cloudType}] score=${hit.score} ${hit.title} | pwd=${hit.password || "-"}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
