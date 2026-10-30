/**
 * Unit tests: Weibo masked「网页链接」+ k/d/uc/迅 prefixes.
 * Run: node --test src/sources/extract.test.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectStructuredUrls,
  detectCloudTypeFromUrl,
  extractPanLinks,
  extractPanLinksFromWeiboEntity,
  inferCloudTypeFromPrefix,
  mapPrefixToCloudType,
  snippetFromWeiboEntity,
  unwrapWeiboRedirect,
} from "./extract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/weibo-comment-masked.json"), "utf8")
);

test("mapPrefixToCloudType covers k/d/uc/迅 and CJK variants", () => {
  assert.equal(mapPrefixToCloudType("k"), "quark");
  assert.equal(mapPrefixToCloudType("K:"), "quark");
  assert.equal(mapPrefixToCloudType("夸克"), "quark");
  assert.equal(mapPrefixToCloudType("d"), "baidu");
  assert.equal(mapPrefixToCloudType("D"), "baidu");
  assert.equal(mapPrefixToCloudType("百度"), "baidu");
  assert.equal(mapPrefixToCloudType("uc"), "uc");
  assert.equal(mapPrefixToCloudType("U"), "uc");
  assert.equal(mapPrefixToCloudType("u"), "uc");
  assert.equal(mapPrefixToCloudType("迅"), "xunlei");
  assert.equal(mapPrefixToCloudType("迅雷"), "xunlei");
  assert.equal(mapPrefixToCloudType("xl"), "xunlei");
});

test("uppercase K/D/U without colon + plain pan URLs", () => {
  const plain = extractPanLinksFromWeiboEntity(
    {
      text_raw:
        "K: https://pan.quark.cn/s/plainK01\nD: https://pan.baidu.com/s/1plainD01 提取码:2w6c\nUC: https://drive.uc.cn/s/plainU01\n迅: https://pan.xunlei.com/s/plainXl01",
    },
    ["baidu", "quark", "xunlei", "uc"]
  );
  const types = new Set(plain.map((l) => l.cloudType));
  assert.ok(types.has("quark"));
  assert.ok(types.has("baidu"));
  assert.ok(types.has("uc"));
  assert.ok(types.has("xunlei"));
  assert.equal(plain.find((l) => l.cloudType === "baidu")?.password, "2w6c");

  const masked = extractPanLinksFromWeiboEntity(
    {
      text_raw: "K 网页链接 D 网页链接 U 网页链接",
      url_struct: [
        { url_title: "网页链接", short_url: "http://t.cn/K1", long_url: "https://pan.quark.cn/s/maskK" },
        { url_title: "网页链接", short_url: "http://t.cn/D1", long_url: "https://pan.baidu.com/s/1maskD" },
        { url_title: "网页链接", short_url: "http://t.cn/U1", long_url: "https://drive.uc.cn/s/maskU" },
      ],
    },
    ["baidu", "quark", "xunlei", "uc"]
  );
  assert.ok(masked.some((l) => l.cloudType === "quark" && l.url.includes("maskK")));
  assert.ok(masked.some((l) => l.cloudType === "baidu" && l.url.includes("maskD")));
  assert.ok(masked.some((l) => l.cloudType === "uc" && l.url.includes("maskU")));
});

test("unwrapWeiboRedirect decodes sinaurl?u=", () => {
  const wrapped =
    "https://weibo.cn/sinaurl?u=https%3A%2F%2Fpan.quark.cn%2Fs%2FabcQuarkLockLove";
  assert.equal(unwrapWeiboRedirect(wrapped), "https://pan.quark.cn/s/abcQuarkLockLove");
});

test("detectCloudTypeFromUrl", () => {
  assert.equal(detectCloudTypeFromUrl("https://pan.baidu.com/s/1x"), "baidu");
  assert.equal(detectCloudTypeFromUrl("https://pan.quark.cn/s/x"), "quark");
  assert.equal(detectCloudTypeFromUrl("https://pan.xunlei.com/s/x"), "xunlei");
  assert.equal(detectCloudTypeFromUrl("https://drive.uc.cn/s/x"), "uc");
  assert.equal(detectCloudTypeFromUrl("https://pan.uc.cn/s/x"), "uc");
  assert.equal(detectCloudTypeFromUrl("http://t.cn/xxx"), "");
});

test("UC prefixes U/UC/uc: masked + plain drive.uc.cn", () => {
  const plain = extractPanLinks(
    "UC: https://drive.uc.cn/s/plainUc99 提取码:u9k2\nalso https://pan.uc.cn/s/plainUcPan",
    ["baidu", "quark", "xunlei", "uc"]
  );
  assert.ok(plain.some((l) => l.cloudType === "uc" && l.url.includes("drive.uc.cn")));
  assert.ok(plain.some((l) => l.cloudType === "uc" && l.url.includes("pan.uc.cn")));

  const maskedU = extractPanLinksFromWeiboEntity(
    {
      text_raw: "U 网页链接",
      url_struct: [
        { url_title: "网页链接", short_url: "http://t.cn/Uonly", long_url: "https://drive.uc.cn/s/maskUonly" },
      ],
    },
    ["uc"]
  );
  assert.equal(maskedU.length, 1);
  assert.equal(maskedU[0].cloudType, "uc");
  assert.ok(maskedU[0].url.includes("maskUonly"));

  const allowNoUc = extractPanLinksFromWeiboEntity(
    {
      text_raw: "uc: https://drive.uc.cn/s/shouldDrop",
    },
    ["baidu", "quark", "xunlei"]
  );
  assert.ok(!allowNoUc.some((l) => l.cloudType === "uc"));
});

test("inferCloudTypeFromPrefix before 网页链接", () => {
  const text = "k: 网页链接, d: 网页链接";
  const iK = text.indexOf("网页链接");
  assert.equal(inferCloudTypeFromPrefix(text, iK), "quark");
  const iD = text.indexOf("网页链接", iK + 1);
  assert.equal(inferCloudTypeFromPrefix(text, iD), "baidu");
});

test("plain extractPanLinks still works", () => {
  const links = extractPanLinks(
    "夸克 https://pan.quark.cn/s/plain01 百度 https://pan.baidu.com/s/1plain02 提取码 ab12"
  );
  assert.equal(links.length, 2);
  assert.ok(links.some((l) => l.cloudType === "quark"));
  assert.ok(links.some((l) => l.cloudType === "baidu" && l.password === "ab12"));
});

test("fixture comment: k/d/uc url_struct → pan links (incl. nested 迅 reply)", () => {
  const root = fixture.data.data[0];
  const allow = new Set(["baidu", "quark", "xunlei", "uc"]);
  const fromRoot = extractPanLinksFromWeiboEntity(root, allow);
  const types = new Set(fromRoot.map((l) => l.cloudType));
  assert.ok(types.has("quark"), `expected quark, got ${[...types]}`);
  assert.ok(types.has("baidu"), `expected baidu, got ${[...types]}`);
  assert.ok(types.has("uc"), `expected uc, got ${[...types]}`);
  assert.ok(
    fromRoot.some((l) => l.url.includes("pan.quark.cn/s/abcQuarkLockLove")),
    "quark long_url"
  );
  assert.ok(
    fromRoot.some((l) => l.url.includes("pan.baidu.com/s/1abcBaiduLockLove")),
    "baidu long_url"
  );
  const bd = fromRoot.find((l) => l.cloudType === "baidu");
  assert.equal(bd?.password, "lk88");

  const reply = root.comments[0];
  const fromReply = extractPanLinksFromWeiboEntity(reply, allow);
  assert.equal(fromReply.length, 1);
  assert.equal(fromReply[0].cloudType, "xunlei");
  assert.ok(fromReply[0].url.includes("pan.xunlei.com"));
  assert.equal(fromReply[0].password, "xl77");
});

test("fixture short-only comment: prefix 夸克 → record short URL as quark", () => {
  const c = fixture.data.data[1];
  const links = extractPanLinksFromWeiboEntity(c, ["baidu", "quark", "xunlei"]);
  assert.ok(links.length >= 1, "should infer at least one link from prefix+short");
  assert.equal(links[0].cloudType, "quark");
  assert.ok(links[0].url.includes("t.cn/A6OnlyShort") || links[0].fromPrefix);
});

test("collectStructuredUrls prefers long_url over 网页链接 title", () => {
  const urls = collectStructuredUrls(fixture.data.data[0]);
  assert.ok(urls.some((u) => u.includes("pan.quark.cn")));
  assert.ok(!urls.includes("网页链接"));
});

test("snippetFromWeiboEntity is truncated and Cookie-free", () => {
  const snip = snippetFromWeiboEntity(fixture.data.data[0], 80);
  assert.ok(snip.length <= 81);
  assert.ok(!/SUB=|Cookie/i.test(snip));
  assert.match(snip, /网页链接|url_struct/);
});

test("product allow-list without uc still gets baidu/quark/xunlei", () => {
  const root = fixture.data.data[0];
  const links = extractPanLinksFromWeiboEntity(root, ["baidu", "quark", "xunlei"]);
  const types = new Set(links.map((l) => l.cloudType));
  assert.ok(types.has("quark"));
  assert.ok(types.has("baidu"));
  assert.ok(!types.has("uc"));
  const reply = extractPanLinksFromWeiboEntity(root.comments[0], ["baidu", "quark", "xunlei"]);
  assert.equal(reply[0]?.cloudType, "xunlei");
});
