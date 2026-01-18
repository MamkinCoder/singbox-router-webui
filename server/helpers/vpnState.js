'use strict';

function ensureLanBypassRules(rules) {
  const bypass = [
    { ip_cidr: ['10.0.0.0/8'], outbound: 'direct' },
    { ip_cidr: ['172.16.0.0/12'], outbound: 'direct' },
    { ip_cidr: ['192.168.0.0/16'], outbound: 'direct' },
    { ip_cidr: ['127.0.0.0/8'], outbound: 'direct' },
    { ip_cidr: ['169.254.0.0/16'], outbound: 'direct' },
  ];

  const exists = (cidr) => rules.some(
    (r) => r && Array.isArray(r.ip_cidr) && r.ip_cidr[0] === cidr
  );

  const out = [...rules];
  for (let i = bypass.length - 1; i >= 0; i--) {
    const cidr = bypass[i].ip_cidr[0];
    if (!exists(cidr)) out.unshift(bypass[i]);
  }
  return out;
}

function setVpnStateInConfig(cfg, enabled, policy) {
  if (!cfg.route) cfg.route = {};
  if (!Array.isArray(cfg.route.rules)) cfg.route.rules = [];

  const wantEnabled = !!enabled;
  const wantPolicy = policy === 'all' ? 'all' : 'domains';

  const socksIdx = cfg.route.rules.findIndex((r) => r && r.inbound === 'socks-in');
  const socksRule = { inbound: 'socks-in', outbound: wantEnabled ? 'vpn' : 'direct' };
  if (socksIdx === -1) cfg.route.rules.unshift(socksRule);
  else cfg.route.rules[socksIdx] = socksRule;

  const rsIdx = cfg.route.rules.findIndex(
    (r) => r && Array.isArray(r.rule_set) && r.rule_set.includes('vpn-domains')
  );
  const rsRule = { rule_set: ['vpn-domains'], outbound: wantEnabled ? 'vpn' : 'direct' };
  if (rsIdx === -1) cfg.route.rules.push(rsRule);
  else cfg.route.rules[rsIdx] = rsRule;

  cfg.route.final = (wantEnabled && wantPolicy === 'all') ? 'vpn' : 'direct';

  if (wantEnabled && wantPolicy === 'all') {
    cfg.route.rules = ensureLanBypassRules(cfg.route.rules);
  }

  return cfg;
}

function getVpnStateFromConfig(cfg) {
  const rules = Array.isArray(cfg?.route?.rules) ? cfg.route.rules : [];
  const rsRule = rules.find(
    (r) => r && Array.isArray(r.rule_set) && r.rule_set.includes('vpn-domains')
  );
  const enabled = rsRule?.outbound === 'vpn';
  const policy = cfg?.route?.final === 'vpn' ? 'all' : 'domains';
  return { enabled, policy };
}

module.exports = {
  ensureLanBypassRules,
  setVpnStateInConfig,
  getVpnStateFromConfig,
};
