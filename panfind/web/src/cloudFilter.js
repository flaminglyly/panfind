/**
 * Pan-type chip selection helpers (pure — unit-tested).
 *
 * Convention: `selected.length === 0` means「全部」(all types).
 * Visual: empty → every chip looks ON. Clicking an ON chip must EXCLUDE it
 * (expand empty → full list first), never accidentally single-select that chip.
 */

export const ALL_CLOUD_IDS = ["baidu", "quark", "xunlei", "uc"];

/**
 * @param {string[]|null|undefined} selected
 * @param {string} id
 * @param {string[]} [allIds]
 */
export function isCloudSelected(selected, id, allIds = ALL_CLOUD_IDS) {
  if (!selected?.length) return true;
  return selected.includes(id);
}

/**
 * Expand empty (= all) to a concrete list for toggle math.
 * @param {string[]|null|undefined} selected
 * @param {string[]} [allIds]
 */
export function expandCloudSelection(selected, allIds = ALL_CLOUD_IDS) {
  if (!selected?.length) return [...allIds];
  return [...selected];
}

/**
 * Toggle one cloud type.
 * - Empty (all): click id → all except id
 * - Partial including id: remove id; if none left → [] (all again)
 * - Partial without id: add id
 *
 * @param {string[]} prev
 * @param {string} id
 * @param {string[]} [allIds]
 * @returns {string[]}
 */
export function toggleCloudSelection(prev, id, allIds = ALL_CLOUD_IDS) {
  if (!allIds.includes(id)) return expandCloudSelection(prev, allIds);
  const current = expandCloudSelection(prev, allIds);
  if (current.includes(id)) {
    return current.filter((c) => c !== id);
  }
  return [...current, id];
}

/**
 * Empty → null (no filter / all). Else Set of allowed types.
 * @param {string[]|null|undefined} selected
 * @returns {Set<string>|null}
 */
export function resolveCloudFilter(selected) {
  if (!selected?.length) return null;
  return new Set(selected);
}

/**
 * @param {Array<{cloudType?: string}>|null|undefined} results
 * @param {string[]|null|undefined} selected
 */
export function filterResultsByClouds(results, selected) {
  const allow = resolveCloudFilter(selected);
  if (!allow) return results || [];
  return (results || []).filter((h) => allow.has(h.cloudType));
}

/**
 * Query param value: empty/all → "" (omit); else comma list.
 * @param {string[]} selected
 */
export function cloudTypesQueryValue(selected) {
  if (!selected?.length) return "";
  return selected.join(",");
}
