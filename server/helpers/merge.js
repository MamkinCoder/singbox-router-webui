'use strict';

function deepMergeKeep(dst, src) {
  if (src === null || src === undefined) return dst;
  if (typeof src !== 'object' || Array.isArray(src)) return src;

  const out = (dst && typeof dst === 'object' && !Array.isArray(dst)) ? { ...dst } : {};
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMergeKeep(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

module.exports = { deepMergeKeep };
