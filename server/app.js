'use strict';

const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');
const { parseVlessLink } = require('./vless');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const BIND = process.env.BIND || '0.0.0.0';

const SINGBOX_CONFIG_PATH = process.env.SINGBOX_CONFIG_PATH || '/etc/sing-box/config.json';
const UI_DOMAINS_PATH = process.env.UI_DOMAINS_PATH || '/etc/sing-box/rules/vpn_domains_ui.json';
const FLAT_RULESET_PATH = process.env.FLAT_RULESET_PATH || '/etc/sing-box/rules/vpn_domains.json';
const CLIENTS_POLICY_PATH = process.env.CLIENTS_POLICY_PATH || '/etc/sing-box/clients_policy.json';
const FRONTEND_DIST = path.join(__dirname, '..', 'web', 'dist');

function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/', express.static(FRONTEND_DIST));
  app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));
  registerRoutes(app);
  return app;
}

/** ----------------- helpers ----------------- */

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('close', (code) => {
      if (code === 0) return resolve({ out, err });
      reject(new Error(`${cmd} ${args.join(' ')} failed (${code}): ${err || out}`));
    });
  });
}

// Write to /tmp, then sudo install into final path (atomic-ish).
async function writeJsonWithSudoInstall(finalPath, obj) {
  const tmpPath = `/tmp/sbwebui-${path.basename(finalPath)}-${Date.now()}.json`;
  const data = JSON.stringify(obj, null, 2) + '\n';
  await fsp.writeFile(tmpPath, data, { mode: 0o600 });

  // install -m 0644 tmp final
  await run('sudo', ['/usr/bin/install', '-m', '0644', tmpPath, finalPath]);
  await fsp.unlink(tmpPath).catch(() => { });
}

async function readJsonSafe(p, fallbackObj = null) {
  try {
    const raw = await fsp.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return fallbackObj;
  }
}

function normalizeDomain(d) {
  if (!d) return '';
  return String(d).trim().toLowerCase().replace(/^\.+/, '').replace(/\.$/, '');
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function isProbablyDomainSuffix(d) {
  // very permissive: letters/numbers/dash/dot + must contain at least one dot
  if (!d || typeof d !== 'string') return false;
  if (d.length > 253) return false;
  if (!d.includes('.')) return false;
  if (!/^[a-z0-9.-]+$/.test(d)) return false;
  if (d.includes('..')) return false;
  return true;
}

function buildFlatRulesFromGroups(uiDoc) {
  const groups = Array.isArray(uiDoc?.groups) ? uiDoc.groups : [];
  let domains = [];
  for (const g of groups) {
    if (!g || g.enabled === false) continue;
    const list = Array.isArray(g.domains) ? g.domains : [];
    domains.push(...list.map(normalizeDomain));
  }
  domains = uniq(domains).filter(isProbablyDomainSuffix).sort();

  return {
    version: 1,
    rules: [{ domain_suffix: domains }],
  };
}

async function restartSingBox() {
  await run('sudo', ['/bin/systemctl', 'restart', 'sing-box']);
}

function deepMergeKeep(dst, src) {
  // merge src into dst, overwriting only provided keys; objects merged recursively
  if (src === null || src === undefined) return dst;
  if (typeof src !== 'object' || Array.isArray(src)) return src;

  const out = (dst && typeof dst === 'object' && !Array.isArray(dst)) ? { ...dst } : {};
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMergeKeep(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

async function singBoxStatus() {
  try {
    const { out } = await run('sudo', ['/bin/systemctl', 'is-active', 'sing-box']);
    const status = out.trim();
    return { active: status === 'active', status };
  } catch (e) {
    return { active: false, status: 'unknown' };
  }
}

function getVpnStateFromConfig(cfg) {
  const rules = Array.isArray(cfg?.route?.rules) ? cfg.route.rules : [];

  // Find vpn-domains rule
  const rsRule = rules.find(
    (r) => r && Array.isArray(r.rule_set) && r.rule_set.includes('vpn-domains')
  );

  // If vpn-domains goes to vpn => VPN enabled (domains-mode)
  // If vpn-domains goes to direct => VPN disabled
  const enabled = rsRule?.outbound === 'vpn';

  // If final is vpn => "all traffic" policy (when enabled)
  const policy = cfg?.route?.final === 'vpn' ? 'all' : 'domains';

  return { enabled, policy };
}

// keep LAN/local traffic direct when forcing all through VPN
function ensureLanBypassRules(rules) {
  const bypass = [
    // RFC1918
    { ip_cidr: ['10.0.0.0/8'], outbound: 'direct' },
    { ip_cidr: ['172.16.0.0/12'], outbound: 'direct' },
    { ip_cidr: ['192.168.0.0/16'], outbound: 'direct' },

    // Loopback + link-local
    { ip_cidr: ['127.0.0.0/8'], outbound: 'direct' },
    { ip_cidr: ['169.254.0.0/16'], outbound: 'direct' }
  ];

  // Put bypass rules at the top so they win first
  // Avoid duplicating if already present
  const exists = (cidr) => rules.some(
    (r) => r && Array.isArray(r.ip_cidr) && r.ip_cidr[0] === cidr
  );

  const out = [...rules];
  for (let i = bypass.length - 1; i >= 0; i--) {
    const cidr = bypass[i].ip_cidr[0];
    if (!exists(cidr)) out.unshift(bypass[i]);
  }
  return out;
}

// enabled=false => safe "VPN off": keep sing-box running but route everything direct
// enabled=true + policy=domains => only vpn-domains to vpn, final direct
// enabled=true + policy=all => final vpn (but LAN bypass direct)
function setVpnStateInConfig(cfg, enabled, policy) {
  if (!cfg.route) cfg.route = {};
  if (!Array.isArray(cfg.route.rules)) cfg.route.rules = [];

  // normalize
  const wantEnabled = !!enabled;
  const wantPolicy = policy === 'all' ? 'all' : 'domains';

  // socks-in rule (optional; keep it consistent)
  const socksIdx = cfg.route.rules.findIndex((r) => r && r.inbound === 'socks-in');
  const socksRule = { inbound: 'socks-in', outbound: wantEnabled ? 'vpn' : 'direct' };
  if (socksIdx === -1) cfg.route.rules.unshift(socksRule);
  else cfg.route.rules[socksIdx] = socksRule;

  // vpn-domains rule
  const rsIdx = cfg.route.rules.findIndex(
    (r) => r && Array.isArray(r.rule_set) && r.rule_set.includes('vpn-domains')
  );
  const rsRule = { rule_set: ['vpn-domains'], outbound: wantEnabled ? 'vpn' : 'direct' };
  if (rsIdx === -1) cfg.route.rules.push(rsRule);
  else cfg.route.rules[rsIdx] = rsRule;

  // Final:
  // - VPN off => direct
  // - VPN on + domains => direct
  // - VPN on + all => vpn
  cfg.route.final = (wantEnabled && wantPolicy === 'all') ? 'vpn' : 'direct';

  // If forcing all through vpn, add LAN bypass so local network still works
  if (wantEnabled && wantPolicy === 'all') {
    cfg.route.rules = ensureLanBypassRules(cfg.route.rules);
  }

  return cfg;
}

/** ----------------- defaults ----------------- */

const DEFAULT_UI_DOMAINS = {
  version: 1,
  groups: [
    { id: 'ip-check', name: 'IP check', enabled: true, domains: ['2ip.io'] },

    { id: 'youtube', name: 'YouTube / Google video', enabled: true, domains: ['youtube.com', 'googlevideo.com', 'ytimg.com', 'ggpht.com'] },

    {
      id: 'openai-chatgpt',
      name: 'OpenAI / ChatGPT (app + assets + API + login)',
      enabled: true,
      domains: [
        // base
        'chatgpt.com',
        'openai.com',
        // API + platform
        'api.openai.com',
        'platform.openai.com',
        // login/auth (OpenAI)
        'auth.openai.com',
        'id.openai.com',
        // assets
        'oaistatic.com',
        'oaiusercontent.com',

        // Common external auth/captcha used in some flows / regions
        'auth0.com',
        'cdn.auth0.com',
        'arkoselabs.com',
        'funcaptcha.com',
        'hcaptcha.com',

        // social sign-in endpoints (only needed if you use them)
        'accounts.google.com',
        'appleid.apple.com',
      ],
    },

    {
      id: 'meta',
      name: 'Meta (Facebook / Messenger / WhatsApp / Instagram)',
      enabled: true,
      domains: ['facebook.com', 'fbcdn.net', 'messenger.com', 'whatsapp.com', 'meta.com', 'instagram.com', 'cdninstagram.com'],
    },

    { id: 'discord', name: 'Discord', enabled: true, domains: ['discord.com', 'discord.gg', 'discordapp.com', 'discordcdn.com'] },

    {
      id: 'twitter-x',
      name: 'X / Twitter',
      enabled: true,
      domains: ['twitter.com', 'x.com', 't.co', 'twimg.com', 'pbs.twimg.com', 'abs.twimg.com', 'video.twimg.com', 'api.twitter.com', 'api.x.com'],
    },

    { id: 'tiktok', name: 'TikTok', enabled: true, domains: ['tiktok.com', 'tiktokcdn.com', 'tiktokv.com'] },

    { id: 'reddit', name: 'Reddit', enabled: true, domains: ['reddit.com', 'redd.it', 'redditmedia.com'] },

    { id: 'medium', name: 'Medium', enabled: true, domains: ['medium.com'] },

    { id: 'roblox', name: 'Roblox', enabled: true, domains: ['roblox.com', 'rbxcdn.com'] },

    { id: 'rutracker', name: 'RuTracker', enabled: true, domains: ['rutracker.org'] },

    { id: 'other', name: 'Other', enabled: true, domains: ['cluesbysam.com'] },
  ],
};

const DEFAULT_CLIENTS_POLICY = { version: 1, clients: {} };

/** ----------------- routes ----------------- */

function registerRoutes(app) {
  app.get('/sb/api/domains', async (req, res) => {
    let ui = await readJsonSafe(UI_DOMAINS_PATH, null);
    if (!ui) {
      ui = DEFAULT_UI_DOMAINS;
      await writeJsonWithSudoInstall(UI_DOMAINS_PATH, ui);
      const flat = buildFlatRulesFromGroups(ui);
      await writeJsonWithSudoInstall(FLAT_RULESET_PATH, flat);
    }
    res.json(ui);
  });

  app.put('/sb/api/domains', async (req, res) => {
    const ui = req.body;
    if (!ui || ui.version !== 1 || !Array.isArray(ui.groups)) {
      return res.status(400).json({ error: 'Invalid format: expected {version:1, groups:[...]}' });
    }

    // normalize + validate
    for (const g of ui.groups) {
      g.id = String(g.id || '').trim();
      if (!g.id) return res.status(400).json({ error: 'Group must have id' }); if (!Array.isArray(g.domains)) g.domains = [];
      g.domains = uniq(g.domains.map(normalizeDomain)).filter(Boolean);
      for (const d of g.domains) {
        if (!isProbablyDomainSuffix(d)) return res.status(400).json({ error: `Invalid domain: ${d}` });
      }
    }

    const flat = buildFlatRulesFromGroups(ui);

    await writeJsonWithSudoInstall(UI_DOMAINS_PATH, ui);
    await writeJsonWithSudoInstall(FLAT_RULESET_PATH, flat);
    await restartSingBox();

    res.json({ ok: true, flat_count: flat.rules?.[0]?.domain_suffix?.length || 0 });
  });

  app.get('/sb/api/vless', async (req, res) => {
    const cfg = await readJsonSafe(SINGBOX_CONFIG_PATH, null);
    if (!cfg) return res.status(500).json({ error: `Cannot read ${SINGBOX_CONFIG_PATH}` });

    const ob = Array.isArray(cfg.outbounds) ? cfg.outbounds.find((x) => x && x.tag === 'vpn') : null;
    if (!ob) return res.status(404).json({ error: 'No outbound with tag "vpn" found' });

    // return a safe subset
    res.json({
      tag: ob.tag,
      type: ob.type,
      server: ob.server,
      server_port: ob.server_port,
      uuid: ob.uuid,
      flow: ob.flow,
      tls: ob.tls,
    });
  });

  app.put('/sb/api/vless', async (req, res) => {
    const vless = req.body?.vless;
    if (!vless) return res.status(400).json({ error: 'Expected {vless:"vless://..."}' });

    let patch;
    try {
      patch = parseVlessLink(vless);
    } catch (e) {
      return res.status(400).json({
        error: e.message || 'Invalid VLESS link',
        details: e.details || undefined,
      });
    }

    const cfg = await readJsonSafe(SINGBOX_CONFIG_PATH, null);
    if (!cfg) return res.status(500).json({ error: `Cannot read ${SINGBOX_CONFIG_PATH}` });
    if (!Array.isArray(cfg.outbounds)) return res.status(500).json({ error: 'config.outbounds missing/invalid' });

    const idx = cfg.outbounds.findIndex((x) => x && x.tag === 'vpn');
    if (idx === -1) return res.status(404).json({ error: 'No outbound with tag "vpn" found' });

    cfg.outbounds[idx] = deepMergeKeep(cfg.outbounds[idx], patch);

    await writeJsonWithSudoInstall(SINGBOX_CONFIG_PATH, cfg);
    await restartSingBox();

    res.json({ ok: true, updated: patch });
  });

// TODO: clients
  app.get('/sb/api/clients', async (req, res) => {
    const pol = await readJsonSafe(CLIENTS_POLICY_PATH, DEFAULT_CLIENTS_POLICY);
    res.json(pol);
  });

  app.put('/sb/api/clients/:id', async (req, res) => {
    // id can be MAC later; for now accept anything
    const id = req.params.id;
    const { name, force_vpn } = req.body || {};

    const pol = await readJsonSafe(CLIENTS_POLICY_PATH, DEFAULT_CLIENTS_POLICY);
    pol.clients = pol.clients || {};
    pol.clients[id] = {
      ...(pol.clients[id] || {}),
      ...(name !== undefined ? { name: String(name) } : {}),
      ...(force_vpn !== undefined ? { force_vpn: !!force_vpn } : {}),
    };

    await writeJsonWithSudoInstall(CLIENTS_POLICY_PATH, pol);
    res.json({ ok: true, client: pol.clients[id] });
  });

  app.get('/sb/api/vpn', async (req, res) => {
    const cfg = await readJsonSafe(SINGBOX_CONFIG_PATH, null);
    if (!cfg) return res.status(500).json({ error: `Cannot read ${SINGBOX_CONFIG_PATH}` });

    const { active, status } = await singBoxStatus();
    const { enabled, policy } = getVpnStateFromConfig(cfg);

    res.json({ enabled, policy, active, status });
  });

  app.put('/sb/api/vpn', async (req, res) => {
    const enabled = !!req.body?.enabled;
    const policy = (req.body?.policy === 'all') ? 'all' : 'domains';

    const cfg = await readJsonSafe(SINGBOX_CONFIG_PATH, null);
    if (!cfg) return res.status(500).json({ error: `Cannot read ${SINGBOX_CONFIG_PATH}` });

    setVpnStateInConfig(cfg, enabled, policy);

    await writeJsonWithSudoInstall(SINGBOX_CONFIG_PATH, cfg);
    await restartSingBox();

    const { active, status } = await singBoxStatus();
    const state = getVpnStateFromConfig(cfg);
    res.json({ ok: true, ...state, active, status });
  });



  app.get('/sb/api/health', async (req, res) => {
    res.json({ ok: true });
  });
}

module.exports = { createApp, PORT, BIND, SINGBOX_CONFIG_PATH };
