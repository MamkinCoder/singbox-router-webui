'use strict';

const { readJsonDetailed, writeJsonWithSudoInstall } = require('./fs');
const { SINGBOX_CONFIG_PATH } = require('../config');

function collectBypassIps(policy) {
  const clients = policy?.clients || {};
  const ips = new Set();
  for (const entry of Object.values(clients)) {
    if (!entry?.bypass_vpn || !entry?.ip) continue;
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

function isBypassRule(rule) {
  return (
    rule &&
    rule.outbound === 'direct' &&
    Array.isArray(rule.source_ip_cidr)
  );
}

function removeExistingRule(cfg) {
  cfg.route.rules = cfg.route.rules.filter((rule) => !isBypassRule(rule));
}

function insertRule(cfg, rule) {
  const forceVpnIdx = cfg.route.rules.findIndex(
    (candidate) => candidate && candidate.outbound === 'vpn' && Array.isArray(candidate.source_ip_cidr)
  );
  const ruleSetIdx = cfg.route.rules.findIndex((candidate) => Array.isArray(candidate?.rule_set));
  const beforeIdx = [forceVpnIdx, ruleSetIdx]
    .filter((idx) => idx >= 0)
    .sort((a, b) => a - b)[0];

  if (beforeIdx === undefined) {
    cfg.route.rules.push(rule);
    return;
  }

  cfg.route.rules.splice(beforeIdx, 0, rule);
}

async function applyBypassVpnRules(policy) {
  const ips = collectBypassIps(policy);
  const { data: cfg, error } = await readJsonDetailed(SINGBOX_CONFIG_PATH, null);
  if (!cfg) throw new Error(`Cannot read ${SINGBOX_CONFIG_PATH}: ${error?.message || error}`);

  ensureRoute(cfg);
  removeExistingRule(cfg);

  if (ips.length) {
    insertRule(cfg, {
      source_ip_cidr: ips,
      outbound: 'direct',
    });
  }

  await writeJsonWithSudoInstall(SINGBOX_CONFIG_PATH, cfg);
}

module.exports = { applyBypassVpnRules };
