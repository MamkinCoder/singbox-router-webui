'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { CLIENTS_POLICY_PATH, NFTABLES_CONF_PATH } = require('../config');

const BEGIN = '# === SB-WEBUI:BEGIN force_udp_vpn_clients ===';
const END = '# === SB-WEBUI:END force_udp_vpn_clients ===';
function buildIps(policy) {
  const clients = policy.clients || {};
  const ips = [];
  for (const entry of Object.values(clients)) {
    if (entry?.force_udp_vpn && entry?.ip) {
      const ip = String(entry.ip).trim();
      if (ip) ips.push(ip.includes('/') ? ip : `${ip}/32`);
    }
  }
  return ips.sort();
}

function buildConfigBody(ips) {
  return `
  set force_udp_vpn_clients {
    type ipv4_addr
    flags interval
${ips.length ? `    elements = { ${ips.join(', ')} }` : '    # SB-WEBUI-ELEMENTS'}
  }
`;
}

function installConfig(targetPath, content) {
  const tmp = path.join('/tmp', `sb-webui-${path.basename(targetPath)}-${Date.now()}`);
  fs.writeFileSync(tmp, content, 'utf8');
  execFileSync('sudo', ['/usr/bin/install', '-m', '0644', tmp, targetPath], { stdio: 'inherit' });
  fs.unlinkSync(tmp);
}

function saveConfig(targetPath, content) {
  try {
    fs.writeFileSync(targetPath, content, 'utf8');
  } catch (err) {
    installConfig(targetPath, content);
  }
}

function rewriteConfig(ips) {
  const nft = fs.readFileSync(NFTABLES_CONF_PATH, 'utf8');
  const beginIdx = nft.indexOf(BEGIN);
  const endIdx = nft.indexOf(END);
  if (beginIdx === -1 || endIdx === -1) {
    throw new Error('nftables markers not found');
  }
  const beginLineEnd = nft.indexOf('\n', beginIdx);
  if (beginLineEnd === -1) {
    throw new Error('nftables BEGIN marker missing newline');
  }
  const before = nft.slice(0, beginLineEnd + 1);
  const after = nft.slice(endIdx);
  const body = buildConfigBody(ips);
  saveConfig(NFTABLES_CONF_PATH, `${before}${body}${after}`);
}

function reloadNft() {
  execFileSync('sudo', ['nft', '-f', NFTABLES_CONF_PATH], { stdio: 'inherit' });
}

async function updateForceUdpSet(policy) {
  const ips = buildIps(policy);
  rewriteConfig(ips);
  reloadNft();
}

module.exports = { updateForceUdpSet };
