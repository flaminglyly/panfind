/**
 * Ranking / phrase relevance.
 * Run: node --test src/rank.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isContiguousPhraseQuery,
  keywordMatch,
  keywordRelevant,
  normalizeSearchText,
  scoreItem,
} from "./rank.js";

const Q = "王子的黑手党骑士";

test("keywordRelevant: 流人 in post, not 吾岸-only or nick-only", () => {
  assert.equal(keywordRelevant("流人第四季更新 夸克链接在评论", "流人"), true);
  assert.equal(keywordRelevant("【分享】Slow Horses 流人", "流人"), true);
  assert.equal(keywordRelevant("吾岸番外更新合集", "流人"), false);
  assert.equal(keywordRelevant("资源博主分享", "流人"), false);
  assert.equal(keywordRelevant("人在囧途", "流人"), false);
});

test("王子的黑手党骑士: contiguous phrase only — reject 锁爱/吾岸/partials", () => {
  assert.equal(isContiguousPhraseQuery(Q), true);
  assert.equal(keywordRelevant(`更新 ${Q} 夸克在评论`, Q), true);
  assert.equal(keywordRelevant(`#${Q}# 资源`, Q), true);
  assert.equal(keywordRelevant("锁爱游戏合集更新", Q), false);
  assert.equal(keywordRelevant("吾岸番外", Q), false);
  assert.equal(keywordRelevant("无关资源库 黑手党 分享", Q), false); // partial 黑手党
  assert.equal(keywordRelevant("王子 骑士", Q), false);
  assert.equal(keywordRelevant("资源博主", Q), false);
});

test("normalizeSearchText: fullwidth / zero-width", () => {
  const n = normalizeSearchText(`  王\u200B子的黑手党骑士  `);
  assert.ok(n.includes("王子的黑手党骑士"));
  assert.equal(keywordRelevant(`分享${n}`, Q), true);
});

test("keywordMatch: no bigram credit for Chinese phrase", () => {
  assert.equal(keywordMatch("黑手党资源", Q), 0);
  assert.equal(keywordMatch(`全集${Q}`, Q), 0.85);
});

test("scoreItem: phrase hit outranks 锁爱/吾岸/partial", () => {
  const now = new Date().toISOString();
  const good = scoreItem({ title: `${Q} 4K合集`, source: "weibo:1", datetime: now }, Q);
  const badLove = scoreItem({ title: "锁爱游戏更新", source: "weibo:2", datetime: now }, Q);
  const badWu = scoreItem({ title: "吾岸番外", source: "weibo:3", datetime: now }, Q);
  const badPartial = scoreItem({ title: "黑手党剪辑", source: "weibo:4", datetime: now }, Q);
  assert.ok(good > badLove, `${good} > ${badLove}`);
  assert.ok(good > badWu);
  assert.ok(good > badPartial);
  assert.ok(badLove < 0.4, `got ${badLove}`);
  assert.ok(badPartial < 0.4, `got ${badPartial}`);
});

test("scoreItem: 流人 title outranks 吾岸-only weibo hit", () => {
  const now = new Date().toISOString();
  const good = scoreItem(
    { title: "流人 第一季 Slow Horses 4K", source: "weibo:111", datetime: now },
    "流人"
  );
  const bad = scoreItem(
    { title: "吾岸番外更新", source: "weibo:2689219795", datetime: now, keywords: [] },
    "流人"
  );
  assert.ok(good > bad, `expected ${good} > ${bad}`);
  assert.ok(bad < 0.45, `吾岸-only should be low, got ${bad}`);
  assert.ok(good >= 0.55, `流人 title should stay high, got ${good}`);
});

test("scoreItem ignores note nick inflation path (keywords empty)", () => {
  const s = scoreItem(
    {
      title: "吾岸番外",
      note: "流人资源菌 · https://weibo.com/u/1",
      source: "weibo:1",
      datetime: new Date().toISOString(),
      keywords: [],
    },
    "流人"
  );
  assert.ok(s < 0.45, `got ${s}`);
});
