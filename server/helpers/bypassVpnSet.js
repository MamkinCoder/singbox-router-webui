'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { NFTABLES_CONF_PATH } = require('../config');

const BEGIN = '# === SB-WEBUI:BEGIN bypass_vpn_clients ===';
const END = '# === SB-WEBUI:END bypass_vpn_clients ===';

function buildIps(policy) {
  const clients = policy?.clients || {};
  const ips = [];
  for (const entry of Object.values(clients)) {
    if (!entry?.bypass_vpn || !entry?.ip) continue;
    const ip = String(entry.ip).trim();
    if (ip) ips.push(ip.includes('/') ? ip : `${ip}/32`);
  }
  return Array.from(new Set(ips)).sort();
}

function buildConfigBody(ips) {
  return `
  set bypass_vpn_clients {
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
    throw new Error('nftables bypass markers not found');
  }
  const beginLineEnd = nft.indexOf('\n', beginIdx);
  if (beginLineEnd === -1) {
    throw new Error('nftables bypass BEGIN marker missing newline');
  }
  const before = nft.slice(0, beginLineEnd + 1);
  const after = nft.slice(endIdx);
  saveConfig(NFTABLES_CONF_PATH, `${before}${buildConfigBody(ips)}${after}`);
}

function reloadNft() {
  execFileSync('sudo', ['nft', '-f', NFTABLES_CONF_PATH], { stdio: 'inherit' });
}

async function updateBypassVpnSet(policy) {
  const ips = buildIps(policy);
  rewriteConfig(ips);
  reloadNft();
}

module.exports = { updateBypassVpnSet };
