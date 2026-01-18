# AGENTS.md — Raspberry Pi Transparent VPN Gateway
**sing-box (VLESS Reality) + Pi-hole + Unbound + React WebUI**

This file exists so that **any new ChatGPT / coding agent** can be dropped into this repository and immediately understand:
- what this project is
- how traffic flows
- which configs matter
- which problems were already solved (and must not be reintroduced)

It reflects the **final, working state** after all debugging.

---

## High-level goal

Provide a **transparent, split‑tunnel VPN gateway** for LAN clients **without installing VPN software on clients**.

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

⚠️ **Never reboot the Pi while router already points to it unless DNS is confirmed healthy.**

---

## DNS stack (FINAL)

### Pi-hole

Purpose:
- LAN DNS
- Ad/tracker blocking
- Local DNS records (`vpn.home`, `pi.hole`)

Pi-hole is **DNS only**. It is **not used for routing decisions**.

Config:
```
/etc/pihole/pihole.toml
```

Important web config (Pi-hole v6+):
```toml
[webserver]
port = "127.0.0.1:8081,[::1]:8081"
domain = "pi.hole"
```

Pi-hole web UI is **only on localhost** and is exposed via nginx.

---

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

Minimal stable config:
```conf
server:
  interface: 127.0.0.1
  port: 5335
  do-ip4: yes
  do-ip6: no
  do-udp: yes
  do-tcp: yes
  module-config: "iterator"
  val-permissive-mode: yes
```

⚠️ **If Unbound is down, everything breaks (DNS, VPN, routing).**

---

## VPN stack (sing-box)

### sing-box

- Installed at: `/usr/bin/sing-box`
- Runs as systemd service
- Provides:
  - Transparent TPROXY inbound (LAN)
  - SOCKS inbound (`127.0.0.1:1080`) for testing
  - VLESS Reality outbound

Main config:
```
/etc/sing-box/config.json
```

---

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

Only domains in this list are routed through VPN when in domain mode.

---

## VPN modes (IMPORTANT)

sing-box is **always running**. We never stop the service in normal operation.

Two independent toggles exist:

### 1. VPN Enabled / Disabled

- **Enabled = false** → safe direct mode
  - sing-box running
  - all traffic goes direct
  - tproxy still active (no blackhole)

- **Enabled = true** → VPN routing active

### 2. Policy: Domains vs All traffic

- **Domains** → only domains from ruleset go through VPN
- **All** → all traffic goes through VPN
  - LAN / RFC1918 addresses are explicitly bypassed

These are controlled by editing sing-box routing config and restarting sing-box (safe).

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

Key rules:
- TPROXY only on `eth0`
- NAT only on `wlan0`
- DNS excluded from TPROXY
- OUTPUT chain untouched

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

- Node.js + Express
- Runs as systemd service
- User: `sbweb`

Paths:
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

- React (Vite)
- Built output:
```
/opt/sb-webui/web/dist
```

Served by backend (static files).

**Frontend is built manually or via separate build service.**
It is NOT rebuilt on every backend restart.

---

## systemd services

### sb-webui.service

- Runs backend only
- Does NOT run npm install/build
- Fails fast if UI build missing

```ini
ExecStartPre=/usr/bin/test -f /opt/sb-webui/web/dist/index.html
ExecStart=/usr/bin/node /opt/sb-webui/server.js
```

### sb-webui-build.service (oneshot)

- Builds frontend safely
- Run manually when UI changes

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

### If something breaks:

1. Check **Unbound** first
2. Check Pi-hole DNS
3. Check sing-box logs
4. Check nftables

### Commands that actually help:

```bash
dig @127.0.0.1 google.com
journalctl -u unbound
journalctl -u sing-box
nft list ruleset
ip rule show
```

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

