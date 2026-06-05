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

echo "--- sysctl ---"
sysctl \
  net.ipv4.ip_forward \
  net.ipv4.conf.all.src_valid_mark \
  net.ipv4.conf.eth0.src_valid_mark \
  net.ipv4.conf.all.rp_filter \
  net.ipv4.conf.eth0.rp_filter \
  net.ipv4.conf.eth0.accept_local \
  net.ipv4.conf.eth0.route_localnet || true

echo "--- WebUI ---"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -I --max-time 2 http://127.0.0.1:3001/; then
    exit 0
  fi
  sleep 1
done
curl -I --max-time 5 http://127.0.0.1:3001/ || true
