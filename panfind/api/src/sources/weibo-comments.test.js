/**
 * Comment API parsing / mid resolution (no network).
 * Run: node --test src/sources/weibo-comments.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  flattenCommentEntities,
  parseCommentApiBody,
  resolveStatusIdForComments,
} from "./weibo.js";

test("resolveStatusIdForComments prefers numeric idstr/mid over mblogid", () => {
  assert.equal(
    resolveStatusIdForComments({ idstr: "5123400012345678", mblogid: "OabcXYZ", mid: "5123400012345678" }),
    "5123400012345678"
  );
  assert.equal(resolveStatusIdForComments({ mblogid: "OabcXYZ", id: 5123400012345678 }), "5123400012345678");
  assert.equal(resolveStatusIdForComments({ mblogid: "OabcXYZ" }), "");
});

test("parseCommentApiBody: PC buildComments shape", () => {
  const body = {
    ok: 1,
    data: [
      { id: 1, text_raw: "K: https://pan.quark.cn/s/a", text: "K: …" },
      { id: 2, text_raw: "D 网页链接", url_struct: [{ long_url: "https://pan.baidu.com/s/1x" }] },
    ],
  };
  const list = parseCommentApiBody(body);
  assert.equal(list.length, 2);
  assert.equal(list[0].text_raw.includes("quark"), true);
});

test("parseCommentApiBody: mobile hotflow shape", () => {
  const body = {
    ok: 1,
    data: {
      data: [{ id: 9, text_raw: "迅: https://pan.xunlei.com/s/x" }],
    },
  };
  assert.equal(parseCommentApiBody(body).length, 1);
});

test("parseCommentApiBody: empty / auth fail → []", () => {
  assert.deepEqual(parseCommentApiBody({ ok: -100, msg: "login" }), []);
  assert.deepEqual(parseCommentApiBody({ ok: 1, data: [] }), []);
  assert.deepEqual(parseCommentApiBody(null), []);
});

test("flattenCommentEntities includes nested replies", () => {
  const flat = flattenCommentEntities(
    [
      {
        id: 1,
        text_raw: "K 网页链接",
        comments: [{ id: 2, text_raw: "迅: https://pan.xunlei.com/s/r" }],
      },
    ],
    10
  );
  assert.equal(flat.length, 2);
  assert.ok(flat[1].text_raw.includes("xunlei"));
});
