/**
 * 盘搜版本与变更说明（读根目录 version.json）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const VERSION_PATH = path.join(ROOT, "version.json");

/**
 * @typedef {{
 *   name: string,
 *   version: string,
 *   buildTime: string,
 *   channel?: string,
 *   changelog: { version: string, date: string, title: string, items: string[] }[],
 * }} VersionInfo
 */

/** @type {VersionInfo | null} */
let cached = null;

/**
 * @returns {VersionInfo}
 */
export function getVersionInfo() {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(VERSION_PATH, "utf8");
    const data = JSON.parse(raw);
    cached = {
      name: data.name || "盘搜 PanFind",
      version: String(data.version || "0.0.0"),
      buildTime: String(data.buildTime || new Date().toISOString()),
      channel: data.channel || "local",
      changelog: Array.isArray(data.changelog) ? data.changelog : [],
    };
  } catch {
    cached = {
      name: "盘搜 PanFind",
      version: "0.0.0",
      buildTime: new Date().toISOString(),
      channel: "unknown",
      changelog: [],
    };
  }
  return cached;
}

export function getVersionSummary() {
  const v = getVersionInfo();
  return {
    version: v.version,
    buildTime: v.buildTime,
    name: v.name,
    channel: v.channel,
  };
}
