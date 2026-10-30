/**
 * Cloud-type allow-list: empty → all; partial → strict drop.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_CLOUD_TYPES,
  filterHitsByCloudTypes,
  normalizeCloudTypes,
  searchDemo,
} from "./search.js";

test("normalizeCloudTypes: empty / missing → all including uc", () => {
  assert.deepEqual(normalizeCloudTypes(""), [...ALL_CLOUD_TYPES]);
  assert.deepEqual(normalizeCloudTypes(undefined), [...ALL_CLOUD_TYPES]);
  assert.deepEqual(normalizeCloudTypes([]), [...ALL_CLOUD_TYPES]);
  assert.ok(normalizeCloudTypes("").includes("uc"));
});

test("normalizeCloudTypes: quark,xunlei excludes baidu and keeps order-unique", () => {
  assert.deepEqual(normalizeCloudTypes("quark,xunlei"), ["quark", "xunlei"]);
  assert.deepEqual(normalizeCloudTypes(["xunlei", "quark", "quark"]), ["xunlei", "quark"]);
  assert.deepEqual(normalizeCloudTypes("baidu|uc"), ["baidu", "uc"]);
});

test("filterHitsByCloudTypes drops baidu when unselected", () => {
  const hits = [
    { id: "1", cloudType: "baidu", url: "https://pan.baidu.com/s/1x", title: "b", score: 1, source: "t" },
    { id: "2", cloudType: "quark", url: "https://pan.quark.cn/s/x", title: "q", score: 1, source: "t" },
    { id: "3", cloudType: "xunlei", url: "https://pan.xunlei.com/s/x", title: "x", score: 1, source: "t" },
    { id: "4", cloudType: "uc", url: "https://drive.uc.cn/s/x", title: "u", score: 1, source: "t" },
  ];
  const filtered = filterHitsByCloudTypes(hits, ["quark", "xunlei"]);
  assert.deepEqual(
    filtered.map((h) => h.cloudType),
    ["quark", "xunlei"]
  );
  assert.ok(!filtered.some((h) => h.cloudType === "baidu"));
});

test("searchDemo: 王子的黑手党骑士 第二季 with quark+xunlei+uc has no baidu", () => {
  const types = normalizeCloudTypes("quark,xunlei,uc");
  const hits = searchDemo("王子的黑手党骑士 第二季", types);
  assert.ok(hits.length >= 1, "expected some hits");
  assert.ok(hits.every((h) => types.includes(h.cloudType)));
  assert.ok(!hits.some((h) => h.cloudType === "baidu"));
  assert.ok(hits.some((h) => h.cloudType === "uc" || h.cloudType === "quark"));
});
