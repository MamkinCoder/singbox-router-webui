'use strict';

const { FLAT_RULESET_PATH, SINGBOX_DEFAULT_INTERFACE } = require('../config');

function ensureInbounds(cfg) {
  if (!Array.isArray(cfg.inbounds)) cfg.inbounds = [];
  return cfg.inbounds;
}

function ensureRoute(cfg) {
  if (!cfg.route) cfg.route = {};
  return cfg.route;
}

function ensureInbound(inbounds, desired) {
  const idx = inbounds.findIndex((inbound) => inbound && inbound.tag === desired.tag);
  if (idx === -1) {
    inbounds.push({ ...desired });
    return;
  }

  inbounds[idx] = {
    ...inbounds[idx],
    ...desired,
  };
}

function normalizeTproxyInbound(cfg) {
  const inbounds = ensureInbounds(cfg).filter((inbound) => (
    inbound &&
    inbound.tag !== 'socks-direct' &&
    inbound.tag !== 'socks-vpn'
  ));
  cfg.inbounds = inbounds;

  ensureInbound(cfg.inbounds, {
    type: 'tproxy',
    tag: 'tproxy-in',
    listen: '0.0.0.0',
    listen_port: 12345,
  });
  ensureInbound(cfg.inbounds, {
    type: 'socks',
    tag: 'socks-in',
    listen: '127.0.0.1',
    listen_port: 1080,
  });

  const idx = cfg.inbounds.findIndex((inbound) => inbound && inbound.tag === 'tproxy-in');
  const next = {
    ...cfg.inbounds[idx],
  };
  delete next.sniff;
  delete next.sniff_override_destination;
  delete next.sniff_timeout;
  delete next.domain_strategy;
  cfg.inbounds[idx] = next;

  return cfg;
}

function normalizeRouteRuleSet(route) {
  if (!Array.isArray(route.rule_set)) route.rule_set = [];

  const wanted = {
    tag: 'vpn-domains',
    type: 'local',
    format: 'source',
    path: FLAT_RULESET_PATH,
  };
  const idx = route.rule_set.findIndex((ruleSet) => ruleSet && ruleSet.tag === 'vpn-domains');
  if (idx === -1) route.rule_set.push(wanted);
  else route.rule_set[idx] = { ...route.rule_set[idx], ...wanted };
}

function normalizeRouteRules(route) {
  if (!Array.isArray(route.rules)) route.rules = [];

  let hasTproxySniff = false;
  route.rules = route.rules.filter((rule) => {
    if (!rule) return false;

    if (rule.inbound === 'socks-direct' || rule.inbound === 'socks-vpn') return false;

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
  normalizeRouteRuleSet(route);
  normalizeRouteRules(route);

  return cfg;
}

module.exports = {
  ensureInbounds,
  ensureRoute,
  normalizeTproxyInbound,
  normalizeSingBoxRoute,
};
