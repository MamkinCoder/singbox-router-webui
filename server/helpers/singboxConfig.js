'use strict';

const { SINGBOX_DEFAULT_INTERFACE } = require('../config');

function ensureInbounds(cfg) {
  if (!Array.isArray(cfg.inbounds)) cfg.inbounds = [];
  return cfg.inbounds;
}

function ensureRoute(cfg) {
  if (!cfg.route) cfg.route = {};
  return cfg.route;
}

function normalizeTproxyInbound(cfg) {
  const inbounds = ensureInbounds(cfg);
  const idx = inbounds.findIndex((inbound) => inbound && inbound.tag === 'tproxy-in');
  if (idx === -1) return cfg;

  inbounds[idx] = {
    ...inbounds[idx],
    listen: '0.0.0.0',
    sniff: true,
    sniff_override_destination: true,
  };

  return cfg;
}

function normalizeRouteRules(route) {
  if (!Array.isArray(route.rules)) route.rules = [];

  route.rules = route.rules.filter((rule) => {
    if (!rule) return false;

    // Old/broken config drift forced every TPROXY packet into VPN, which
    // defeats split routing and breaks direct-path behavior.
    if (rule.inbound === 'tproxy-in' && rule.outbound === 'vpn') return false;

    // Older sing-box config drift used route-level sniff action; keep sniff on
    // inbound instead so routing stays simple and aligned with repo docs.
    if (rule.inbound === 'tproxy-in' && rule.action === 'sniff') return false;

    return true;
  });
}

function normalizeSingBoxRoute(cfg) {
  normalizeTproxyInbound(cfg);
  const route = ensureRoute(cfg);

  // Pin sing-box egress to single known-good uplink. This Pi may have other
  // interfaces on the same subnet, and auto-detect can pick the wrong one.
  route.auto_detect_interface = false;
  route.default_interface = SINGBOX_DEFAULT_INTERFACE;
  normalizeRouteRules(route);

  return cfg;
}

module.exports = {
  ensureInbounds,
  ensureRoute,
  normalizeTproxyInbound,
  normalizeSingBoxRoute,
};
