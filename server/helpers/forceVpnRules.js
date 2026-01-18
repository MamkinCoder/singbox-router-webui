'use strict';

const { readJsonDetailed, writeJsonWithSudoInstall } = require('./fs');
const { SINGBOX_CONFIG_PATH } = require('../config');

function collectForceVpnIps(policy) {
  const clients = policy?.clients || {};
  const ips = new Set();
  for (const entry of Object.values(clients)) {
    if (!entry?.force_vpn || !entry?.ip) continue;
    const ip = String(entry.ip || '').trim();
    if (!ip) continue;
    ips.add(ip.includes('/') ? ip : `${ip}/32`);
  }
  return Array.from(ips).sort();
}

function ensureRoute(cfg) {
  if (!cfg.route) cfg.route = {};
  if (!Array.isArray(cfg.route.rules)) cfg.route.rules = [];
}

function isForceVpnRule(rule) {
  return (
    rule &&
    rule.outbound === 'vpn' &&
    Array.isArray(rule.source_ip_cidr) &&
    rule.source_ip_cidr.every((cidr) => typeof cidr === 'string' && cidr.startsWith('192.168.'))
  );
}

function removeExistingRule(cfg) {
  cfg.route.rules = cfg.route.rules.filter((rule) => !isForceVpnRule(rule));
}

function insertRule(cfg, rule, beforeIdx) {
  if (beforeIdx === -1 || beforeIdx >= cfg.route.rules.length) {
    cfg.route.rules.push(rule);
  } else {
    cfg.route.rules.splice(beforeIdx, 0, rule);
  }
}

async function applyForceVpnRules(policy) {
  const ips = collectForceVpnIps(policy);
  const { data: cfg, error } = await readJsonDetailed(SINGBOX_CONFIG_PATH, null);
  if (!cfg) throw new Error(`Cannot read ${SINGBOX_CONFIG_PATH}: ${error?.message || error}`);

  ensureRoute(cfg);
  removeExistingRule(cfg);

  if (!ips.length) {
    await writeJsonWithSudoInstall(SINGBOX_CONFIG_PATH, cfg);
    return;
  }

  const rule = {
    source_ip_cidr: ips,
    outbound: 'vpn',
  };
  const insertBeforeIdx = cfg.route.rules.findIndex((rule) => Array.isArray(rule.rule_set));
  insertRule(cfg, rule, insertBeforeIdx === -1 ? cfg.route.rules.length : insertBeforeIdx);

  await writeJsonWithSudoInstall(SINGBOX_CONFIG_PATH, cfg);
}

module.exports = { applyForceVpnRules };
