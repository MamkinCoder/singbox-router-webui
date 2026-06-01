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

  const next = {
    ...inbounds[idx],
    listen: '0.0.0.0',
  };
  delete next.sniff;
  delete next.sniff_override_destination;
  delete next.sniff_timeout;
  delete next.domain_strategy;
  inbounds[idx] = next;

  return cfg;
}

function normalizeRouteRules(route) {
  if (!Array.isArray(route.rules)) route.rules = [];

  let hasTproxySniff = false;
  route.rules = route.rules.filter((rule) => {
    if (!rule) return false;

    // Old/broken config drift forced every TPROXY packet into VPN, which
    // defeats split routing and breaks direct-path behavior.
    if (rule.inbound === 'tproxy-in' && rule.outbound === 'vpn') return false;

    if (rule.inbound === 'tproxy-in' && rule.action === 'sniff') {
      hasTproxySniff = true;
    }

    return true;
  });

  if (!hasTproxySniff) {
    route.rules.unshift({
      inbound: 'tproxy-in',
      action: 'sniff',
      timeout: '1s',
    });
  }
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
