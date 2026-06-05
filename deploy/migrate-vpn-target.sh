#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG_PATH="${CFG_PATH:-/etc/sing-box/config.json}"
TMP_CFG="$(mktemp /tmp/sb-vpn-target-migrate-XXXXXX.json)"

cleanup() {
  rm -f "$TMP_CFG"
}
trap cleanup EXIT

ROOT_DIR="$ROOT_DIR" CFG_PATH="$CFG_PATH" TMP_CFG="$TMP_CFG" node <<'NODE'
const fs = require('fs');
const path = require('path');

const root = process.env.ROOT_DIR;
const cfgPath = process.env.CFG_PATH;
const tmpCfg = process.env.TMP_CFG;

const { setVpnTarget } = require(path.join(root, 'server', 'helpers', 'vpnTarget'));
const { normalizeSingBoxRoute } = require(path.join(root, 'server', 'helpers', 'singboxConfig'));

const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const vpnOutbound = Array.isArray(cfg.outbounds)
  ? cfg.outbounds.find((item) => item && item.tag === 'vpn')
  : null;

if (!vpnOutbound) {
  console.log('No vpn target found in outbounds; nothing to migrate.');
  process.exit(0);
}

const { tag, ...patch } = vpnOutbound;
setVpnTarget(cfg, patch);
normalizeSingBoxRoute(cfg);
fs.writeFileSync(tmpCfg, JSON.stringify(cfg, null, 2) + '\n');
console.log(`wrote ${tmpCfg}`);
NODE

sudo /usr/bin/install -m 0644 "$TMP_CFG" "$CFG_PATH"
sudo /usr/bin/sing-box check -c "$CFG_PATH"
echo "migration ok: $CFG_PATH"
