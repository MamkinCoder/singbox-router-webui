#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG_PATH="${CFG_PATH:-/etc/sing-box/config.json}"
SINGBOX_BIN="${SINGBOX_BIN:-/usr/bin/sing-box}"
TMP_CFG="$(mktemp /tmp/sb-awg-proof-XXXXXX.json)"
TMP_LOG="$(mktemp /tmp/sb-awg-proof-XXXXXX.log)"
SOCKS_PORT="${SOCKS_PORT:-2080}"
TARGET_URL="${TARGET_URL:-https://api.ipify.org}"

cleanup() {
  if [[ -n "${SB_PID:-}" ]]; then
    kill "${SB_PID}" >/dev/null 2>&1 || true
    wait "${SB_PID}" >/dev/null 2>&1 || true
  fi
  rm -f "$TMP_CFG" "$TMP_LOG"
}
trap cleanup EXIT

if [[ ! -x "$SINGBOX_BIN" ]]; then
  echo "missing sing-box binary: $SINGBOX_BIN" >&2
  exit 1
fi

ROOT_DIR="$ROOT_DIR" CFG_PATH="$CFG_PATH" SOCKS_PORT="$SOCKS_PORT" TMP_CFG="$TMP_CFG" node <<'NODE'
const fs = require('fs');
const path = require('path');

const root = process.env.ROOT_DIR;
const cfgPath = process.env.CFG_PATH;
const socksPort = Number(process.env.SOCKS_PORT || '2080');
const tmpCfg = process.env.TMP_CFG;

const { parseOutboundLink } = require(path.join(root, 'server', 'vless'));
const raw = fs.readFileSync(cfgPath, 'utf8');
const cfg = JSON.parse(raw);

let endpoint = Array.isArray(cfg.endpoints)
  ? cfg.endpoints.find((item) => item && item.tag === 'vpn' && item.type === 'awg')
  : null;

if (!endpoint) {
  const source = process.env.AWG_SOURCE ? String(process.env.AWG_SOURCE).trim() : '';
  if (!source) {
    throw new Error('No AWG endpoint tagged vpn in current config and no AWG_SOURCE provided');
  }
  const parsed = parseOutboundLink(source);
  if (parsed.type !== 'awg') {
    throw new Error('AWG_SOURCE did not parse as type=awg');
  }
  endpoint = { tag: 'vpn', ...parsed };
}

const proof = {
  log: { level: 'info', timestamp: true },
  endpoints: [endpoint],
  inbounds: [
    { type: 'socks', tag: 'socks-in', listen: '127.0.0.1', listen_port: socksPort }
  ],
  outbounds: [
    { type: 'direct', tag: 'direct' }
  ],
  route: {
    final: 'direct',
    auto_detect_interface: false,
    default_interface: 'eth0',
    rules: [
      { inbound: 'socks-in', outbound: 'vpn' }
    ]
  }
};

fs.writeFileSync(tmpCfg, JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({
  proof_config: tmpCfg,
  endpoint_type: endpoint.type,
  awg_fields: Object.keys(endpoint).filter((key) => /^(jc|jmin|jmax|s[1-4]|h[1-4]|i[1-5])$/.test(key)).sort()
}, null, 2));
NODE

echo "== sing-box check =="
sudo "$SINGBOX_BIN" check -c "$TMP_CFG"

echo "== starting proof instance =="
sudo "$SINGBOX_BIN" run -c "$TMP_CFG" >"$TMP_LOG" 2>&1 &
SB_PID=$!
sleep 2

echo "== proof process =="
if kill -0 "$SB_PID" >/dev/null 2>&1; then
  echo "proof sing-box pid=$SB_PID alive"
else
  echo "proof sing-box pid=$SB_PID exited early"
fi

echo "== curl via proof socks =="
set +e
curl --proxy "socks5h://127.0.0.1:${SOCKS_PORT}" "$TARGET_URL" --connect-timeout 10 --max-time 20
CURL_STATUS=$?
set -e
printf '\n'
echo "curl_exit=$CURL_STATUS"

echo "== proof log tail =="
tail -n 50 "$TMP_LOG"

exit "$CURL_STATUS"
