# AGENTS.md — Raspberry Pi Transparent VPN Gateway

**sing-box (VLESS Reality) + Pi-hole + Unbound + React WebUI**

This file exists so that **any new ChatGPT / coding agent** can be dropped into this project and immediately understand:

- what this project is
- how traffic flows
- which configs matter
- which problems were already solved (and must not be reintroduced)

It reflects the **final, working state** after all debugging.

---

## High-level goal

Provide a **transparent, split-tunnel VPN gateway** for LAN clients **without installing VPN software on clients**.

- Router still does DHCP
- Raspberry Pi is the LAN gateway
- Pi-hole provides DNS
- sing-box provides VPN routing
- Selected domains go through VPN
- Everything else goes direct
- Safe reboot behavior

---

## Network topology

```
[ LAN Clients ]
      |
      |  (DHCP: gateway + DNS)
      v
[ Raspberry Pi ] 192.168.0.4
  - Pi-hole (DNS)
  - Unbound (local recursion)
  - sing-box (TPROXY + SOCKS)
  - nftables (TPROXY + NAT)
  - WebUI (React + Node)
      |
      v
[ Router ] 192.168.0.1
      |
      v
[ ISP / Internet ]
```

Interfaces:

- `eth0` → LAN
- `wlan0` → WAN uplink

---

## Router configuration

- DHCP **enabled**
- Gateway handed to clients: `192.168.0.4`
- DNS handed to clients: `192.168.0.4`
- Router WAN gateway stays ISP

---

## DNS stack (FINAL)

### Pi-hole

Purpose:

- LAN DNS
- Ad/tracker blocking
- Local DNS records (`vpn.home`, `pi.hole`)

Config:

```
/etc/pihole/pihole.toml
```

Pi-hole web UI is **only on localhost** and is exposed via nginx.

### Unbound (critical dependency)

- Listens on: `127.0.0.1:5335`
- Used as Pi-hole upstream
- Provides local recursion

Config:

```
/etc/unbound/unbound.conf.d/pi-hole.conf
```

Final decision:

- ❌ DNSSEC disabled (root.key corruption caused outages)
- ✅ Stability > theory

⚠️ **If Unbound is down, everything breaks (DNS, VPN, routing).**

---

## VPN stack (sing-box)

### sing-box

- Installed at: `/usr/bin/sing-box`
- Runs as systemd service

Main config:

```
/etc/sing-box/config.json
```

### Domain-based VPN routing

sing-box routes traffic by **sniffing TLS SNI**, not DNS.

Rules file:

```
/etc/sing-box/rules/vpn_domains.json
```

Generated from UI source file:

```
/etc/sing-box/rules/vpn_domains_ui.json
```

---

## Firewall & routing (nftables)

Single authoritative file:

```
/etc/nftables.conf
```

Responsibilities:

- Firewall (default-drop)
- NAT (LAN → WAN)
- TPROXY interception for LAN

Policy routing:

- fwmark → table `tproxy`
- `tproxy` table routes to `lo`

Routing rules are installed via **NetworkManager dispatcher**, not systemd hacks.

---

## WebUI

### Purpose

Single control plane for:

- editing VPN domain lists
- editing VLESS config
- toggling VPN mode
- toggling domain vs all traffic

No SSH required for normal operation.

---

### Backend

- Node.js backend (Express)
- Runs as systemd service
- User: `rpi`

Backend entry:

```
/opt/sb-webui/server.js
```

API prefix:

```
/sb/api/*
```

Important endpoints:

- `/sb/api/domains`
- `/sb/api/vless`
- `/sb/api/vpn`

---

### Frontend

- React + Vite
- Frontend folder:

```
/opt/sb-webui/web
```

- Build output:

```
/opt/sb-webui/web/dist
```

- Served by backend as static files.

#### systemd build notes (FINAL)

Problems encountered:

- corrupted `node_modules` from early installs
- `vite: not found` under systemd
- devDependencies silently omitted

Final stable solution:

- always install dev deps explicitly
- do not rely on PATH for Vite

Recommended `package.json` build script:

```json
"build": "node ./node_modules/vite/bin/vite.js build"
```

---

## systemd services

### sb-webui.service (FINAL — single service builds + serves)

This unit intentionally:

1. installs dependencies (including dev)
2. builds frontend
3. verifies `dist/index.html`
4. starts backend

Unit file:

```
/etc/systemd/system/sb-webui.service
```

Core logic:

```ini
ExecStartPre=/bin/bash -lc 'cd /opt/sb-webui/web; npm install --include=dev; npm run build; test -f dist/index.html'
ExecStart=/usr/bin/node /opt/sb-webui/server.js
```

Important notes:

- `TimeoutStartSec` must be large enough for Vite build on Raspberry Pi
- `StartLimitIntervalSec` / `StartLimitBurst` belong in `[Unit]`

Useful commands:

```bash
sudo systemctl daemon-reload
sudo systemctl restart sb-webui
sudo journalctl -u sb-webui -n 200 --no-pager
```

---

## nginx

- Listens on port 80
- Routes by hostname

Hosts:

- `vpn.home/` → WebUI
- `vpn.home/admin/` → Pi-hole
- `pi.hole/` → Pi-hole

Pi-hole API (`/api/`) is proxied correctly so graphs work.

---

## Debugging rules (learned the hard way)

### If something breaks

1. Check **Unbound** first
2. Check Pi-hole DNS
3. Check sing-box logs
4. Check nftables
5. Check WebUI build/service logs

### Commands that actually help

```bash
dig @127.0.0.1 google.com
journalctl -u unbound
journalctl -u sing-box
journalctl -u sb-webui -n 200 --no-pager
nft list ruleset
ip rule show
```

### WebUI-specific failure patterns

- `npm ERR! canceled`
  - Usually means the build process was interrupted or dependencies were broken
- `vite: not found` (exit 127)
  - Fix: force dev deps + explicit Vite binary path

### Things that mislead:

- Browser-only testing
- Assuming DNS == routing
- DNSSEC debugging
- Over-automation

---

## Final state summary

- Deterministic
- Reboot-safe
- No database scraping
- No race conditions
- Minimal VPN domain list
- Safe VPN disable mode

**If internet dies: check Unbound before touching anything else.**

---

## TL;DR for future agents

- Pi is the router
- sing-box routes by SNI sniffing
- Pi-hole is DNS only
- Unbound must be alive
- VPN disable = routing mode, not service stop
- nftables is correct
- Domains are explicit

Do not redesign this unless you understand why each decision was made.
