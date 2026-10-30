/**
 * PanSou / hunhepan type coerce + normalize.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coerceCloudType,
  countByCloudType,
  missingRequestedTypes,
  normalizeUpstream,
} from "./search.js";
import { mapDiskType } from "./sources/hunhepan.js";

test("coerceCloudType: aliases + URL hosts", () => {
  assert.equal(coerceCloudType("XUNLEI", ""), "xunlei");
  assert.equal(coerceCloudType("thunder", ""), "xunlei");
  assert.equal(coerceCloudType("BDY", ""), "baidu");
  assert.equal(coerceCloudType("QUARK", ""), "quark");
  assert.equal(coerceCloudType("UC", ""), "uc");
  assert.equal(coerceCloudType("", "https://pan.xunlei.com/s/abc"), "xunlei");
  assert.equal(coerceCloudType("", "https://drive.uc.cn/s/abc"), "uc");
  assert.equal(coerceCloudType("ALY", "https://www.aliyundrive.com/s/x"), "");
});

test("mapDiskType: hunhepan UPPERCASE XUNLEI / BDY / QUARK", () => {
  assert.equal(mapDiskType("XUNLEI", "https://pan.xunlei.com/s/x"), "xunlei");
  assert.equal(mapDiskType("BDY", "https://pan.baidu.com/s/1x"), "baidu");
  assert.equal(mapDiskType("QUARK", "https://pan.quark.cn/s/x"), "quark");
  assert.equal(mapDiskType("ALY", "https://www.aliyundrive.com/s/x"), "aliyun");
});

test("normalizeUpstream: reads non-canonical merged keys + always walks results", () => {
  const { hits, meta } = normalizeUpstream(
    {
      merged_by_type: {
        // Deliberately odd key — coerce via URL
        thunder: [
          {
            url: "https://pan.xunlei.com/s/xlFromMerged",
            note: "迅雷合集",
            source: "tg:yunpanxunlei",
          },
        ],
        quark: [{ url: "https://pan.quark.cn/s/q1", note: "夸克", source: "tg:x" }],
      },
      results: [
        {
          channel: "ucwpzy",
          title: "UC分享",
          links: [{ url: "https://drive.uc.cn/s/ucFromResults", type: "" }],
        },
      ],
    },
    "刀锋战士",
    ["baidu", "quark", "xunlei", "uc"]
  );
  const types = new Set(hits.map((h) => h.cloudType));
  assert.ok(types.has("xunlei"), `expected xunlei in ${[...types]}`);
  assert.ok(types.has("uc"), `expected uc from results walk in ${[...types]}`);
  assert.ok(types.has("quark"));
  assert.ok(meta.rawMergedKeys.includes("thunder"));
});

test("missingRequestedTypes reports xunlei/uc gaps", () => {
  const by = countByCloudType([
    { cloudType: "quark" },
    { cloudType: "baidu" },
  ]);
  const miss = missingRequestedTypes(by, ["baidu", "quark", "xunlei", "uc"]);
  assert.deepEqual(miss.sort(), ["uc", "xunlei"].sort());
});
