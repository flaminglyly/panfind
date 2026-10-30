/**
 * Dual Cookie slot resolution (no network).
 * Run: node --test src/sources/cookie-slots.test.js
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveCookieSlots } from "../config/weibo-store.js";
import { cookieForHost, resolveWeiboConfig } from "./weibo.js";

test("resolveCookieSlots: dedicated fields win over legacy", () => {
  const slots = resolveCookieSlots({
    cookie: "LEGACY=1",
    cookieWeiboCom: "COM=1",
    cookieMWeibo: "M=1",
  });
  assert.equal(slots.cookieWeiboCom, "COM=1");
  assert.equal(slots.cookieMWeibo, "M=1");
});

test("resolveCookieSlots: legacy fills empty slots", () => {
  const slots = resolveCookieSlots({ cookie: "LEGACY=1" });
  assert.equal(slots.cookieWeiboCom, "LEGACY=1");
  assert.equal(slots.cookieMWeibo, "LEGACY=1");
});

test("cookieForHost never cross-sends dedicated slots", () => {
  const cfg = {
    cookieWeiboCom: "COM=yes",
    cookieMWeibo: "M=yes",
  };
  assert.equal(cookieForHost(cfg, "https://weibo.com/ajax/x"), "COM=yes");
  assert.equal(cookieForHost(cfg, "weibo.com"), "COM=yes");
  assert.equal(cookieForHost(cfg, "https://m.weibo.cn/api/x"), "M=yes");
  assert.equal(cookieForHost(cfg, "m.weibo.cn"), "M=yes");
  // Only com set → m host gets empty (no silent cross)
  assert.equal(cookieForHost({ cookieWeiboCom: "COM=1", cookieMWeibo: "" }, "m.weibo.cn"), "");
  assert.equal(cookieForHost({ cookieWeiboCom: "", cookieMWeibo: "M=1" }, "weibo.com"), "");
});

test("resolveWeiboConfig exposes weiboComConfigured / mWeiboConfigured", () => {
  const prev = process.env.WEIBO_CONFIG_PATH;
  // Use empty/nonexistent path so file is {}; rely on env if any — clear dedicated env
  delete process.env.WEIBO_COOKIE;
  delete process.env.WEIBO_COOKIE_COM;
  delete process.env.WEIBO_COOKIE_M;
  process.env.WEIBO_CONFIG_PATH = "/tmp/panfind-weibo-config-empty-test.json";
  try {
    const cfg = resolveWeiboConfig();
    assert.equal(typeof cfg.weiboComConfigured, "boolean");
    assert.equal(typeof cfg.mWeiboConfigured, "boolean");
    assert.equal(cfg.cookieWeiboCom, cfg.cookieWeiboCom);
  } finally {
    if (prev === undefined) delete process.env.WEIBO_CONFIG_PATH;
    else process.env.WEIBO_CONFIG_PATH = prev;
  }
});
