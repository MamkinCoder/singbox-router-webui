'use strict';

function normalizeDomain(d) {
  if (!d) return '';
  return String(d).trim().toLowerCase().replace(/^\.+/, '').replace(/\.$/, '');
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function isProbablyDomainSuffix(d) {
  if (!d || typeof d !== 'string') return false;
  if (d.length > 253) return false;
  if (!d.includes('.')) return false;
  if (!/^[a-z0-9.-]+$/.test(d)) return false;
  if (d.includes('..')) return false;
  return true;
}

function buildFlatRulesFromGroups(uiDoc) {
  const groups = Array.isArray(uiDoc?.groups) ? uiDoc.groups : [];
  let domains = [];
  for (const g of groups) {
    if (!g || g.enabled === false) continue;
    const list = Array.isArray(g.domains) ? g.domains : [];
    domains.push(...list.map(normalizeDomain));
  }
  domains = uniq(domains).filter(isProbablyDomainSuffix).sort();

  return {
    version: 1,
    rules: [{ domain_suffix: domains }],
  };
}

module.exports = {
  normalizeDomain,
  uniq,
  isProbablyDomainSuffix,
  buildFlatRulesFromGroups,
};
