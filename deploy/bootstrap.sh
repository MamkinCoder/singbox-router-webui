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
SINGBOX_REPO="${SINGBOX_REPO:-https://github.com/amnezia-vpn/amnezia-box.git}"
SINGBOX_REF="${SINGBOX_REF:-dev-next}"
SINGBOX_SRC_DIR="${SINGBOX_SRC_DIR:-/usr/local/src/amnezia-box}"
GO_VERSION="${GO_VERSION:-1.24.7}"
TPROXY_TABLE_NAME="${TPROXY_TABLE_NAME:-tproxy}"
TPROXY_TABLE_ID="${TPROXY_TABLE_ID:-100}"
TPROXY_RULE_PREF="${TPROXY_RULE_PREF:-100}"

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

trim_var() {
  local var_name="$1"
  local value="${!var_name-}"
  value="$(printf '%s' "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  printf -v "$var_name" '%s' "$value"
  export "$var_name"
}

validate_local_domain() {
  trim_var LOCAL_DOMAIN
  if [[ -z "$LOCAL_DOMAIN" ]]; then
    echo "LOCAL_DOMAIN empty. Example: rp.i"
    exit 1
  fi
  if [[ ! "$LOCAL_DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z0-9-]+$ ]]; then
    echo "LOCAL_DOMAIN invalid: $LOCAL_DOMAIN"
    exit 1
  fi
}

install_packages() {
  apt-get update
  apt-get install -y curl git jq sqlite3 nginx unbound nftables network-manager ca-certificates nodejs npm build-essential xz-utils
}

detect_go_arch() {
  case "$(dpkg --print-architecture)" in
    arm64) echo "arm64" ;;
    amd64) echo "amd64" ;;
    armhf) echo "armv6l" ;;
    *)
      echo "Unsupported architecture for Go toolchain: $(dpkg --print-architecture)"
      exit 1
      ;;
  esac
}

install_go_toolchain() {
  local arch
  arch="$(detect_go_arch)"
  local tarball="go${GO_VERSION}.linux-${arch}.tar.gz"
  local url="https://go.dev/dl/${tarball}"

  rm -rf /usr/local/go
  curl -fsSL "$url" -o "/tmp/${tarball}"
  tar -C /usr/local -xzf "/tmp/${tarball}"
  rm -f "/tmp/${tarball}"
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

deprioritize_existing_wifi() {
  if ! nmcli device status | awk '$1=="wlan0"{found=1} END{exit found?0:1}'; then
    return
  fi

  while IFS= read -r conn; do
    [[ -z "$conn" ]] && continue
    nmcli connection modify "$conn" \
      ipv4.route-metric 600 \
      ipv6.route-metric 600 \
      connection.autoconnect yes || true
  done < <(nmcli -t -f NAME,DEVICE connection show | awk -F: '$2=="wlan0"{print $1}')
}

install_pihole() {
  install -d /etc/pihole
  cat > /etc/pihole/setupVars.conf <<EOF
PIHOLE_INTERFACE=eth0
IPV4_ADDRESS=${PI_STATIC_IP}
IPV6_ADDRESS=
QUERY_LOGGING=true
INSTALL_WEB_SERVER=true
INSTALL_WEB_INTERFACE=true
LIGHTTPD_ENABLED=false
CACHE_SIZE=10000
DNS_FQDN_REQUIRED=true
DNS_BOGUS_PRIV=true
DNSMASQ_LISTENING=local
WEBPASSWORD=${PIHOLE_PASSWORD}
PIHOLE_DNS_1=127.0.0.1#5335
PIHOLE_DNS_2=1.1.1.1
EOF

  export PIHOLE_SKIP_OS_CHECK=true
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

configure_router_sysctl() {
  install -d /etc/sysctl.d
  install -m 0644 "$DEPLOY_DIR/templates/router-sysctl.conf" /etc/sysctl.d/99-sb-webui-router.conf
  sysctl --system >/dev/null
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

install_webui_sudoers() {
  install -d /etc/sudoers.d
  install -m 0440 "$DEPLOY_DIR/templates/sb-webui.sudoers" /etc/sudoers.d/sb-webui
  visudo -cf /etc/sudoers.d/sb-webui
}

install_tproxy_policy_routing() {
  install -d /etc/iproute2/rt_tables.d
  cat > /etc/iproute2/rt_tables.d/sb-webui.conf <<EOF
${TPROXY_TABLE_ID} ${TPROXY_TABLE_NAME}
EOF

  install -d /etc/NetworkManager/dispatcher.d
  install -m 0755 "$DEPLOY_DIR/templates/nm-dispatcher-tproxy.sh" /etc/NetworkManager/dispatcher.d/90-sb-webui-tproxy

  RULE_PREF="${TPROXY_RULE_PREF}" TPROXY_MARK="0x1" TPROXY_TABLE="${TPROXY_TABLE_NAME}" \
    /etc/NetworkManager/dispatcher.d/90-sb-webui-tproxy eth0 up
}

install_singbox() {
  install_go_toolchain
  rm -rf "$SINGBOX_SRC_DIR"
  git clone --depth 1 --branch "$SINGBOX_REF" "$SINGBOX_REPO" "$SINGBOX_SRC_DIR"
  (
    cd "$SINGBOX_SRC_DIR"
    PATH="/usr/local/go/bin:$PATH" GOWORK=off /usr/local/go/bin/go build -trimpath -buildvcs=false -o /usr/bin/sing-box ./cmd/sing-box
  )

  install -m 0644 "$DEPLOY_DIR/templates/sing-box.service" /etc/systemd/system/sing-box.service
  systemctl daemon-reload
}

seed_singbox_config() {
  ROOT_DIR="$ROOT_DIR" VLESS_LINK="${VLESS_LINK}" SINGBOX_DEFAULT_INTERFACE="${SINGBOX_DEFAULT_INTERFACE}" node <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.env.ROOT_DIR;
const link = String(process.env.VLESS_LINK || '').trim();
const iface = String(process.env.SINGBOX_DEFAULT_INTERFACE || 'eth0').trim();
const { parseOutboundLink } = require(path.join(root, 'server', 'vless'));
const { buildFlatRulesFromGroups } = require(path.join(root, 'server', 'helpers', 'domains'));
const ui = JSON.parse(fs.readFileSync(path.join(root, 'deploy', 'seeds', 'vpn_domains_ui.json'), 'utf8'));
const flat = buildFlatRulesFromGroups(ui);
const vpnOutbound = link ? { tag: 'vpn', ...parseOutboundLink(link) } : { type: 'direct', tag: 'vpn' };
const vpnEnabled = Boolean(link);
const cfg = {
  log: { level: 'warn', timestamp: true },
  inbounds: [
    { type: 'tproxy', tag: 'tproxy-in', listen: '0.0.0.0', listen_port: 12345 },
    { type: 'socks', tag: 'socks-in', listen: '127.0.0.1', listen_port: 1080 }
  ],
  outbounds: [
    vpnOutbound,
    { type: 'direct', tag: 'direct' },
    { type: 'block', tag: 'block' }
  ],
  route: {
    final: 'direct',
    auto_detect_interface: false,
    default_interface: iface,
    rules: [
      { inbound: 'tproxy-in', action: 'sniff', timeout: '1s' },
      { inbound: 'socks-in', outbound: vpnEnabled ? 'vpn' : 'direct' },
      { ip_cidr: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16'], outbound: 'direct' },
      { rule_set: ['vpn-domains'], outbound: vpnEnabled ? 'vpn' : 'direct' }
    ],
    rule_set: [
      { tag: 'vpn-domains', type: 'local', format: 'source', path: '/etc/sing-box/rules/vpn_domains.json' }
    ]
  }
};
fs.writeFileSync('/etc/sing-box/config.json', JSON.stringify(cfg, null, 2) + '\n');
fs.writeFileSync('/etc/sing-box/rules/vpn_domains_ui.json', JSON.stringify(ui, null, 2) + '\n');
fs.writeFileSync('/etc/sing-box/rules/vpn_domains.json', JSON.stringify(flat, null, 2) + '\n');
fs.writeFileSync('/etc/sing-box/clients_policy.json', JSON.stringify({ version: 1, clients: {} }, null, 2) + '\n');
NODE
}

build_webui() {
  install -d -o "$SB_WEBUI_USER" -g "$SB_WEBUI_USER" "$ROOT_DIR/vless-templates"
  cd "$ROOT_DIR"
  npm install
  cd "$ROOT_DIR/web"
  npm install --include=dev
  npm run build
}

enable_services() {
  systemctl enable sing-box
  systemctl restart sing-box
  systemctl enable sb-webui
  systemctl restart sb-webui
}

seed_local_dns() {
  install -d /etc/dnsmasq.d
  cat > /etc/dnsmasq.d/98-sb-webui-local.conf <<EOF
address=/${LOCAL_DOMAIN}/${PI_STATIC_IP%/*}
address=/vpn.home/${PI_STATIC_IP%/*}
address=/pi.hole/${PI_STATIC_IP%/*}
EOF
  pihole-FTL --config dns.hosts "[\"${PI_STATIC_IP%/*} ${LOCAL_DOMAIN}\",\"${PI_STATIC_IP%/*} vpn.home\",\"${PI_STATIC_IP%/*} pi.hole\"]"
  systemctl restart pihole-FTL
}

save_bootstrap_env() {
  cat > /etc/default/sb-webui-deploy <<EOF
LOCAL_DOMAIN=${LOCAL_DOMAIN}
PI_STATIC_IP=${PI_STATIC_IP}
PI_GATEWAY=${PI_GATEWAY}
LAN_CIDR=${LAN_CIDR}
SINGBOX_DEFAULT_INTERFACE=${SINGBOX_DEFAULT_INTERFACE}
EOF
}

main() {
  require_root
  prompt_if_empty LOCAL_DOMAIN "Local domain for WebUI and Pi-hole (example: rp.i)"
  prompt_if_empty PIHOLE_PASSWORD "Pi-hole admin password" 1
  prompt_if_empty VLESS_LINK "Optional VPN link / config to save now (leave empty to skip)"
  validate_local_domain

  install_packages
  configure_static_ip
  deprioritize_existing_wifi
  install_pihole
  configure_unbound
  configure_pihole
  configure_router_sysctl
  seed_local_dns
  configure_nginx
  install_singbox
  deploy_repo_files
  install_webui_sudoers
  install_tproxy_policy_routing
  seed_singbox_config
  build_webui
  enable_services
  save_bootstrap_env

  echo "Bootstrap done. Run: sudo bash $DEPLOY_DIR/verify.sh"
}

main "$@"
