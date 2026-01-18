# Sing-box Router WebUI

Thin Node/React control panel for the Raspberry Pi transparent VPN gateway described in `AGENTS.md`. The backend exposes `/sb/api/*` for domains, VPN toggles, and VLESS patching while the Vite-built React UI is served from `web/dist`. This repo is meant to sit under `/opt/sb-webui` and is launched via `systemd` (`sb-webui.service`).

## Architecture

- **Backend**: `server.js` just boots `server/app.js` so systemd can continue pointing at the single entry point, but all routes, helpers, and `parseVlessLink` now live under `server/`. The API writes configs under `/etc/sing-box` and restarts `sing-box` safely.
- **Frontend**: React + Vite inside `web/`. The app uses shared `web/src/api.js` for strong JSON/text error handling, and the UI is split into focused components (`Tabs`, `Status`, `VpnCradles`, one component per tab).
- **Systemd**: `sb-webui.service` runs Node; `sb-webui-build.service` is a oneshot that builds `web/dist`. The backend does **not** rebuild the frontend on every restart—make sure `web/dist` exists before starting the service.

## Development

1. `npm install` at the repo root for Express (used by the backend).
2. `cd web && npm install` to get React/Vite deps.
3. `cd web && npm run build` after any UI change so `/web/dist` is generated; the backend serves those static files.

To run locally for testing you can start the backend with `node server.js` and the dev server with `npm run dev` inside `web/`, but the production setup relies on the built bundle.

## Deployment Tips

- Keep `server.js` as the entry point for `sb-webui.service`; it still `require()`s the split-out `server/app.js` but allows the service to stay simple.
- The frontend must be rebuilt manually before restarting the service or `sb-webui.service` will fail because `web/dist/index.html` is missing.
- Hooks/views:
  - `/sb/api/domains` – domain groups
  - `/sb/api/vless` – patch outbound via shared parser
  - `/sb/api/vpn` – toggle mode/policy
  - `/sb/api/clients/leases` – optional DHCP data pulled from the router export script

## Runtime Constraints

- Config files touched: `/etc/sing-box/config.json`, `/etc/sing-box/rules/*.json`, `/etc/sing-box/clients_policy.json`.
- All writes go through `writeJsonWithSudoInstall` so the service needs sudo rights (hence the systemd user `sbweb`).
- React app polls `/sb/api/vpn` every 5s and updates the status bar via `Status`/`VpnCradles`.

## Contribution & Troubleshooting

- Keep the domain list source under version control; `buildFlatRulesFromGroups` regenerates `vpn_domains.json`.
- If the UI reports validation errors from `/sb/api/vless`, the new parser in `server/vless.js` returns structured details so paste errors are visible.
- VLESS input now runs extra validation: only known query params (`security`, `flow`, `sni`, `fp`, `pbk`, `sid`, `spx`, etc.) are accepted and templates are validated before they are saved. Typos triggered an unknown parameter error so you know why a string was rejected.
- When debugging, follow the AGENTS guidance: check Unbound → Pi-hole DNS → sing-box → nftables.

## Router lease scraping

`/sb/api/clients/leases` now reads the kernel neighbor table via `ip neigh` (see `server/helpers/pihole.js`). Keeping the ARP cache populated is sufficient for discovering devices. When you toggle “Force VPN,” the backend rewrites `/etc/sing-box/config.json` by injecting a `source_ip_cidr` rule before your `rule_set`, restarts sing-box, and the forced IPs are evaluated ahead of the domain list. Entries look like:

```json
{
  "source_ip_cidr": [
    "192.168.0.102/32"
  ],
  "outbound": "vpn"
}
```

## License

MIT-style (no license file provided; add one if you need a specific OSS license).
