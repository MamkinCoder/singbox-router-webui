'use strict';

const path = require('path');

const SINGBOX_CONFIG_PATH = process.env.SINGBOX_CONFIG_PATH || '/etc/sing-box/config.json';
const UI_DOMAINS_PATH = process.env.UI_DOMAINS_PATH || '/etc/sing-box/rules/vpn_domains_ui.json';
const FLAT_RULESET_PATH = process.env.FLAT_RULESET_PATH || '/etc/sing-box/rules/vpn_domains.json';
const CLIENTS_POLICY_PATH = process.env.CLIENTS_POLICY_PATH || '/etc/sing-box/clients_policy.json';
const FRONTEND_DIST = path.join(__dirname, '..', 'web', 'dist');
const VLESS_TEMPLATES_DIR = process.env.VLESS_TEMPLATES_DIR || path.join(__dirname, '..', 'vless-templates');
const TEMPLATE_NAME_RE = /^[a-zA-Z0-9._-]+\.json$/;

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
        'chatgpt.com',
        'openai.com',
        'api.openai.com',
        'platform.openai.com',
        'auth.openai.com',
        'id.openai.com',
        'oaistatic.com',
        'oaiusercontent.com',
        'auth0.com',
        'cdn.auth0.com',
        'arkoselabs.com',
        'funcaptcha.com',
        'hcaptcha.com',
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

const PIHOLE_API_URL = process.env.PIHOLE_API_URL || 'http://127.0.0.1/admin/api.php?getQuerySources';

const DEFAULT_CLIENTS_POLICY = { version: 1, clients: {} };

module.exports = {
  SINGBOX_CONFIG_PATH,
  UI_DOMAINS_PATH,
  FLAT_RULESET_PATH,
  CLIENTS_POLICY_PATH,
  FRONTEND_DIST,
  VLESS_TEMPLATES_DIR,
  TEMPLATE_NAME_RE,
  DEFAULT_UI_DOMAINS,
  DEFAULT_CLIENTS_POLICY,
  PIHOLE_API_URL,
};
