'use strict';

const fs = require('fs');
const path = require('path');

const SINGBOX_CONFIG_PATH = process.env.SINGBOX_CONFIG_PATH || '/etc/sing-box/config.json';
const UI_DOMAINS_PATH = process.env.UI_DOMAINS_PATH || '/etc/sing-box/rules/vpn_domains_ui.json';
const FLAT_RULESET_PATH = process.env.FLAT_RULESET_PATH || '/etc/sing-box/rules/vpn_domains.json';
const CLIENTS_POLICY_PATH = process.env.CLIENTS_POLICY_PATH || '/etc/sing-box/clients_policy.json';
const FRONTEND_DIST = path.join(__dirname, '..', 'web', 'dist');
const VLESS_TEMPLATES_DIR = process.env.VLESS_TEMPLATES_DIR || path.join(__dirname, '..', 'vless-templates');
const TEMPLATE_NAME_RE = /^[a-zA-Z0-9._-]+\.json$/;

const DEFAULT_UI_DOMAINS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'deploy', 'seeds', 'vpn_domains_ui.json'), 'utf8')
);

const FORCE_VPN_IPS_PATH = process.env.FORCE_VPN_IPS_PATH || '/etc/sing-box/rules/force_vpn_ips.json';
const NFTABLES_CONF_PATH = process.env.NFTABLES_CONF_PATH || '/etc/nftables.conf';
const SINGBOX_DEFAULT_INTERFACE = process.env.SINGBOX_DEFAULT_INTERFACE || 'eth0';
const LAN_BYPASS_CIDR = process.env.LAN_BYPASS_CIDR || '192.168.0.0/24';
const DEFAULT_CLIENTS_POLICY = { version: 1, clients: {} };

module.exports = {
  SINGBOX_CONFIG_PATH,
  UI_DOMAINS_PATH,
  FLAT_RULESET_PATH,
  CLIENTS_POLICY_PATH,
  FRONTEND_DIST,
  VLESS_TEMPLATES_DIR,
  TEMPLATE_NAME_RE,
  DEFAULT_UI_DOMAINS,
  DEFAULT_CLIENTS_POLICY,
  FORCE_VPN_IPS_PATH,
  NFTABLES_CONF_PATH,
  SINGBOX_DEFAULT_INTERFACE,
  LAN_BYPASS_CIDR,
};
