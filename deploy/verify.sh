#!/usr/bin/env bash
set -euo pipefail

echo "--- IP ---"
ip -brief addr show eth0

echo "--- DNS ---"
dig +short @127.0.0.1 google.com || true
dig +short @127.0.0.1 pi.hole || true

echo "--- Services ---"
systemctl is-active pihole-FTL unbound nginx nftables sing-box sb-webui || true

echo "--- Unbound ---"
ss -lntup | grep 5335 || true

echo "--- Pi-hole ---"
ss -lntup | grep ':53 ' || true

echo "--- Nginx ---"
ss -lntup | grep ':80 ' || true

echo "--- nft ---"
nft list chain inet sbprx prerouting || true

echo "--- ip rule ---"
ip rule show || true

echo "--- WebUI ---"
curl -I --max-time 5 http://127.0.0.1:3001/ || true
