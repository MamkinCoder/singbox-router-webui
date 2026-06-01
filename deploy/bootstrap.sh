#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$ROOT_DIR/deploy"

LOCAL_DOMAIN="${LOCAL_DOMAIN:-}"
PI_STATIC_IP="${PI_STATIC_IP:-192.168.0.4/24}"
PI_GATEWAY="${PI_GATEWAY:-192.168.0.1}"
PI_DNS_1="${PI_DNS_1:-127.0.0.1}"
PI_DNS_2="${PI_DNS_2:-1.1.1.1}"
LAN_CIDR="${LAN_CIDR:-192.168.0.0/24}"
SB_WEBUI_DIR="${SB_WEBUI_DIR:-/opt/sb-webui}"
SB_WEBUI_USER="${SB_WEBUI_USER:-rpi}"
SINGBOX_DEFAULT_INTERFACE="${SINGBOX_DEFAULT_INTERFACE:-eth0}"
WIFI_SSID="${WIFI_SSID:-}"
WIFI_PASSWORD="${WIFI_PASSWORD:-}"

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run as root"
    exit 1
  fi
}

prompt_if_empty() {
  local var_name="$1"
  local prompt="$2"
  local secret="${3:-0}"
  local current="${!var_name-}"
  if [[ -n "$current" ]]; then
    return
  fi
  if [[ "$secret" == "1" ]]; then
    read -r -s -p "$prompt: " "$var_name"
    echo
  else
    read -r -p "$prompt: " "$var_name"
  fi
  export "$var_name"
}

install_packages() {
  apt-get update
  apt-get install -y curl git jq sqlite3 nginx unbound nftables network-manager ca-certificates
}

configure_static_ip() {
  local conn
  conn="$(nmcli -t -f NAME,DEVICE connection show --active | awk -F: '$2=="eth0"{print $1; exit}')"
  if [[ -z "$conn" ]]; then
    conn="sb-lan"
    nmcli connection add type ethernet ifname eth0 con-name "$conn"
  fi

  nmcli connection modify "$conn" \
    ipv4.method manual \
    ipv4.addresses "$PI_STATIC_IP" \
    ipv4.gateway "$PI_GATEWAY" \
    ipv4.dns "$PI_DNS_1 $PI_DNS_2" \
    ipv4.route-metric 100 \
    ipv6.method ignore \
    connection.autoconnect yes

  nmcli connection up "$conn" || true
}

configure_wifi_fallback() {
  if [[ -z "$WIFI_SSID" ]]; then
    return
  fi

  if ! nmcli device status | awk '$1=="wlan0"{found=1} END{exit found?0:1}'; then
    echo "wlan0 not present, skip Wi-Fi fallback"
    return
  fi

  local conn="sb-fallback-wlan0"
  if nmcli -t -f NAME connection show | grep -Fxq "$conn"; then
    nmcli connection modify "$conn" \
      802-11-wireless.ssid "$WIFI_SSID" \
      wifi-sec.key-mgmt wpa-psk \
      wifi-sec.psk "$WIFI_PASSWORD" \
      ipv4.method auto \
      ipv4.route-metric 600 \
      ipv6.method ignore \
      connection.autoconnect yes
  else
    nmcli connection add type wifi ifname wlan0 con-name "$conn" ssid "$WIFI_SSID"
    nmcli connection modify "$conn" \
      wifi-sec.key-mgmt wpa-psk \
      wifi-sec.psk "$WIFI_PASSWORD" \
      ipv4.method auto \
      ipv4.route-metric 600 \
      ipv6.method ignore \
      connection.autoconnect yes
  fi

  nmcli connection up "$conn" || true
}

install_pihole() {
  export PIHOLE_SKIP_OS_CHECK=true
  export PIHOLE_INTERFACE=eth0
  export IPV4_ADDRESS="$PI_STATIC_IP"
  export QUERY_LOGGING=true
  export INSTALL_WEB_SERVER=true
  export INSTALL_WEB_INTERFACE=true
  export LIGHTTPD_ENABLED=false
  export DNSMASQ_LISTENING=local
  export WEBPASSWORD="$PIHOLE_PASSWORD"

  curl -sSL https://install.pi-hole.net | bash /dev/stdin --unattended
}

configure_pihole() {
  pihole-FTL --config dns.upstreams "[\"127.0.0.1#5335\"]"
  pihole-FTL --config dns.domainNeeded true
  pihole-FTL --config dns.bogusPriv true
  pihole-FTL --config dns.listeningMode "local"
  pihole-FTL --config webserver.domain "$LOCAL_DOMAIN"
  pihole-FTL --config webserver.port "127.0.0.1:8081"
  pihole-FTL --config webserver.acl "+127.0.0.1,+${LAN_CIDR}"
  pihole-FTL --config dns.reply.host.IPv4 "${PI_STATIC_IP%/*}"

  sqlite3 /etc/pihole/gravity.db "DELETE FROM adlist;"
  while IFS= read -r url; do
    [[ -z "$url" ]] && continue
    sqlite3 /etc/pihole/gravity.db "INSERT INTO adlist (address, enabled, comment) VALUES ('$url', 1, 'sb-webui deploy');"
  done < "$DEPLOY_DIR/pihole-adlists.txt"

  pihole -g
  systemctl restart pihole-FTL
}

configure_unbound() {
  install -m 0644 "$DEPLOY_DIR/templates/unbound-pi-hole.conf" /etc/unbound/unbound.conf.d/pi-hole.conf
  systemctl disable --now unbound-resolvconf.service 2>/dev/null || true
  systemctl enable unbound
  systemctl restart unbound
}

configure_nginx() {
  sed "s/__LOCAL_DOMAIN__/${LOCAL_DOMAIN}/g" \
    "$DEPLOY_DIR/templates/nginx-local-domain.conf" \
    > /etc/nginx/sites-available/sb-webui-local-domain.conf

  rm -f /etc/nginx/sites-enabled/default
  ln -sf /etc/nginx/sites-available/sb-webui-local-domain.conf /etc/nginx/sites-enabled/sb-webui-local-domain.conf
  nginx -t
  systemctl enable nginx
  systemctl restart nginx
}

deploy_repo_files() {
  install -d /etc/sing-box/rules
  install -m 0644 "$ROOT_DIR/nftables.conf" /etc/nftables.conf
  install -m 0644 "$DEPLOY_DIR/seeds/vpn_domains_ui.json" /etc/sing-box/rules/vpn_domains_ui.json
  systemctl enable nftables
  systemctl restart nftables

  install -m 0644 "$ROOT_DIR/singbox-router-webui.service" /etc/systemd/system/sb-webui.service
  systemctl daemon-reload
}

seed_local_dns() {
  install -d /etc/dnsmasq.d
  cat > /etc/dnsmasq.d/98-sb-webui-local.conf <<EOF
address=/${LOCAL_DOMAIN}/${PI_STATIC_IP%/*}
address=/vpn.home/${PI_STATIC_IP%/*}
address=/pi.hole/${PI_STATIC_IP%/*}
EOF
  systemctl restart pihole-FTL
}

save_bootstrap_env() {
  cat > /etc/default/sb-webui-deploy <<EOF
LOCAL_DOMAIN=${LOCAL_DOMAIN}
PI_STATIC_IP=${PI_STATIC_IP}
PI_GATEWAY=${PI_GATEWAY}
LAN_CIDR=${LAN_CIDR}
SINGBOX_DEFAULT_INTERFACE=${SINGBOX_DEFAULT_INTERFACE}
WIFI_SSID=${WIFI_SSID}
EOF
}

main() {
  require_root
  prompt_if_empty LOCAL_DOMAIN "Local domain for WebUI and Pi-hole (example: rp.i)"
  prompt_if_empty PIHOLE_PASSWORD "Pi-hole admin password" 1
  prompt_if_empty WIFI_SSID "Optional Wi-Fi SSID for fallback SSH (leave empty to skip)"
  if [[ -n "${WIFI_SSID}" ]]; then
    prompt_if_empty WIFI_PASSWORD "Wi-Fi password for fallback SSH" 1
  fi
  prompt_if_empty VLESS_LINK "Optional VLESS link to save now (leave empty to skip)"

  install_packages
  configure_static_ip
  configure_wifi_fallback
  install_pihole
  configure_unbound
  configure_pihole
  seed_local_dns
  configure_nginx
  deploy_repo_files
  save_bootstrap_env

  if [[ -n "${VLESS_LINK}" ]]; then
    curl -fsS -X PUT http://127.0.0.1:3001/sb/api/vless \
      -H 'content-type: application/json' \
      --data "$(jq -n --arg vless "$VLESS_LINK" '{vless:$vless}')" || true
  fi

  echo "Bootstrap done. Run: sudo bash $DEPLOY_DIR/verify.sh"
}

main "$@"
