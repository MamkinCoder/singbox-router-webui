#!/usr/bin/env bash
set -eu

IFACE="${1:-}"
STATE="${2:-}"
RULE_PREF="${RULE_PREF:-100}"
TPROXY_MARK="${TPROXY_MARK:-0x1}"
TPROXY_TABLE="${TPROXY_TABLE:-tproxy}"

apply_rules() {
  ip route replace local default dev lo table "$TPROXY_TABLE"
  ip rule add pref "$RULE_PREF" fwmark "$TPROXY_MARK" lookup "$TPROXY_TABLE" 2>/dev/null || true
}

remove_rules() {
  ip rule del pref "$RULE_PREF" fwmark "$TPROXY_MARK" lookup "$TPROXY_TABLE" 2>/dev/null || true
  ip route del local default dev lo table "$TPROXY_TABLE" 2>/dev/null || true
}

case "$STATE" in
  up|vpn-up|dhcp4-change|connectivity-change|reapply)
    if [[ "$IFACE" == "eth0" || "$IFACE" == "lo" ]]; then
      apply_rules
    fi
    ;;
  down|vpn-down)
    if [[ "$IFACE" == "eth0" ]]; then
      remove_rules
    fi
    ;;
esac

exit 0
