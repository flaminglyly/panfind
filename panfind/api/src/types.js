/** @typedef {'baidu' | 'quark' | 'xunlei'} CloudType */

/**
 * @typedef {Object} SearchHit
 * @property {string} id
 * @property {string} title
 * @property {string} url
 * @property {string} [password]
 * @property {CloudType} cloudType
 * @property {number} score
 * @property {string} source
 * @property {string} [datetime]
 * @property {string} [note]
 */

/**
 * @typedef {Object} SearchResponse
 * @property {string} query
 * @property {boolean} demoMode
 * @property {string} modeLabel
 * @property {number} total
 * @property {SearchHit[]} results
 * @property {CloudType[]} cloudTypes
 * @property {number} tookMs
 */

export {};
