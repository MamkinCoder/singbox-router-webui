'use strict';

function findTaggedIndex(items, tag) {
  if (!Array.isArray(items)) return -1;
  return items.findIndex((item) => item && item.tag === tag);
}

function getVpnTarget(cfg) {
  const outboundIndex = findTaggedIndex(cfg?.outbounds, 'vpn');
  if (outboundIndex !== -1) {
    return {
      kind: 'outbound',
      index: outboundIndex,
      value: cfg.outbounds[outboundIndex],
    };
  }

  const endpointIndex = findTaggedIndex(cfg?.endpoints, 'vpn');
  if (endpointIndex !== -1) {
    return {
      kind: 'endpoint',
      index: endpointIndex,
      value: cfg.endpoints[endpointIndex],
    };
  }

  return null;
}

function ensureArray(obj, key) {
  if (!Array.isArray(obj[key])) obj[key] = [];
  return obj[key];
}

function removeTagged(items, tag) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => !(item && item.tag === tag));
}

function setVpnTarget(cfg, patch) {
  const isAwgEndpoint = patch?.type === 'awg';

  if (isAwgEndpoint) {
    cfg.outbounds = removeTagged(cfg.outbounds, 'vpn');
    const endpoints = ensureArray(cfg, 'endpoints');
    const idx = findTaggedIndex(endpoints, 'vpn');
    const next = { tag: 'vpn', ...patch };
    if (idx === -1) endpoints.unshift(next);
    else endpoints[idx] = next;
    return { kind: 'endpoint', value: next };
  }

  cfg.endpoints = removeTagged(cfg.endpoints, 'vpn');
  const outbounds = ensureArray(cfg, 'outbounds');
  const idx = findTaggedIndex(outbounds, 'vpn');
  const next = { tag: 'vpn', ...patch };
  if (idx === -1) outbounds.unshift(next);
  else outbounds[idx] = next;
  return { kind: 'outbound', value: next };
}

module.exports = {
  getVpnTarget,
  setVpnTarget,
};
