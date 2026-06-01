# Deploy

Goal: rebuild Raspberry Pi gateway from clean Raspberry Pi OS with:

- static LAN IP `192.168.0.4` on `eth0`
- flashed `wlan0` fallback for SSH rescue
- Pi-hole headless
- Unbound on `127.0.0.1:5335`
- sing-box + nftables + WebUI
- NetworkManager dispatcher installs `fwmark 0x1 -> table tproxy -> lo`
- nginx routing:
  - `http://<LOCAL_DOMAIN>/` -> WebUI
  - `http://<LOCAL_DOMAIN>/admin/` -> Pi-hole
  - `http://pi.hole/` -> Pi-hole fallback

## Files

- `bootstrap.sh` - main install/configure script
- `verify.sh` - post-install checks
- `env.example` - optional non-secret overrides
- `pihole-adlists.txt` - default adlists imported into gravity
- `templates/` - config templates rendered onto Pi

## Assumptions

- Raspberry Pi OS / Debian-like system
- NetworkManager manages `eth0`
- repo checked out at `/opt/sb-webui`
- router DHCP will hand out:
  - gateway `192.168.0.4`
  - DNS `192.168.0.4`

## Use

```bash
cd /opt/sb-webui
sudo bash deploy/bootstrap.sh
sudo bash deploy/verify.sh
```

Script prompts for:

- local domain, e.g. `rp.i`
- Pi-hole web password
- VLESS link (optional, can skip and set later in WebUI)

## Notes

- Pi-hole adlists are stored in gravity DB, not old `adlists.list`.
- Pi-hole upstream is set to `127.0.0.1#5335`.
- WebUI stays on backend `127.0.0.1:3001`, nginx fronts it on local domain.
- `wlan0` should be preconfigured by Raspberry Pi Imager; deploy script keeps it as rescue path by forcing higher route metric than `eth0`.
