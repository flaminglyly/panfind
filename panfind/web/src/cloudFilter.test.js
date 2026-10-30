/**
 * Chip toggle UX — run: node --test src/cloudFilter.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_CLOUD_IDS,
  cloudTypesQueryValue,
  expandCloudSelection,
  filterResultsByClouds,
  isCloudSelected,
  toggleCloudSelection,
} from "./cloudFilter.js";

test("empty selection = all chips look selected", () => {
  for (const id of ALL_CLOUD_IDS) {
    assert.equal(isCloudSelected([], id), true);
  }
  assert.equal(isCloudSelected(["quark"], "quark"), true);
  assert.equal(isCloudSelected(["quark"], "baidu"), false);
});

test("from all (empty): click 夸克 excludes quark (not single-select)", () => {
  const next = toggleCloudSelection([], "quark");
  assert.deepEqual(next.sort(), ["baidu", "uc", "xunlei"].sort());
  assert.equal(isCloudSelected(next, "quark"), false);
  assert.equal(isCloudSelected(next, "baidu"), true);
});

test("from full explicit list: click 夸克 excludes quark", () => {
  const next = toggleCloudSelection([...ALL_CLOUD_IDS], "quark");
  assert.ok(!next.includes("quark"));
  assert.equal(next.length, 3);
});

test("click selected chip removes it; last off → empty (= all)", () => {
  let s = ["quark"];
  s = toggleCloudSelection(s, "quark");
  assert.deepEqual(s, []);
  assert.equal(isCloudSelected(s, "baidu"), true);
  assert.equal(isCloudSelected(s, "quark"), true);
});

test("filterResultsByClouds hides unselected immediately", () => {
  const rows = [
    { cloudType: "quark", url: "https://pan.quark.cn/s/a" },
    { cloudType: "baidu", url: "https://pan.baidu.com/s/1b" },
  ];
  assert.equal(filterResultsByClouds(rows, []).length, 2);
  assert.deepEqual(
    filterResultsByClouds(rows, ["baidu", "xunlei", "uc"]).map((r) => r.cloudType),
    ["baidu"]
  );
  // After excluding quark from all:
  const after = toggleCloudSelection([], "quark");
  assert.ok(!filterResultsByClouds(rows, after).some((r) => r.cloudType === "quark"));
});

test("expandCloudSelection + query value", () => {
  assert.deepEqual(expandCloudSelection([]), [...ALL_CLOUD_IDS]);
  assert.equal(cloudTypesQueryValue([]), "");
  assert.equal(cloudTypesQueryValue(["quark", "uc"]), "quark,uc");
});
