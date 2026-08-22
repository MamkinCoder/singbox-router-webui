'use strict';

/* ------------------------------------------------------------------ *
 * Generic helpers
 * ------------------------------------------------------------------ */

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || '').trim());
}

function looksLikeHost(v) {
  const s = String(v || '').trim();
  if (!s || s.length > 255) return false;
  if (s.includes(':')) return /^[0-9a-f:.]+$/i.test(s); // bare IPv6
  return /^[a-z0-9._-]+$/i.test(s);
}

function isBase64Urlish(v) {
  return /^[A-Za-z0-9_-]{20,200}={0,2}$/.test(String(v || '').trim());
}

function isShortId(v) {
  // reality short_id is up to 8 bytes of hex (0..16 chars)
  return /^[0-9a-f]{0,16}$/i.test(String(v || '').trim());
}

function truthyParam(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function decodeBase64Maybe(value) {
  const raw = String(value || '').trim().replace(/\s+/g, '');
  if (!raw || !/^[A-Za-z0-9+/_-]+={0,3}$/.test(raw)) return null;
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  try {
    const text = Buffer.from(padded, 'base64').toString('utf8');
    if (!text || /�/.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

function decodeMaybeUri(value) {
  const s = String(value || '');
  if (!s.includes('%')) return s;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseInteger(value, field, errors) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const n = Number(String(value).trim());
  if (!Number.isInteger(n)) {
    errors.push(`Invalid ${field}`);
    return undefined;
  }
  return n;
}

function fail(message, details) {
  const err = new Error(message);
  err.details = details;
  throw err;
}

/* ------------------------------------------------------------------ *
 * URL query helpers (case-insensitive, alias aware)
 * ------------------------------------------------------------------ */

function lowerParams(searchParams) {
  const out = {};
  if (!searchParams) return out;
  for (const [key, value] of searchParams.entries()) {
    const k = key.toLowerCase();
    if (out[k] === undefined || out[k] === '') out[k] = value;
  }
  return out;
}

function pick(params, ...names) {
  for (const name of names) {
    const value = params[String(name).toLowerCase()];
    if (value !== undefined && String(value).trim() !== '') return String(value).trim();
  }
  return undefined;
}

function hostFromUrl(u, errors, label) {
  let host = String(u.hostname || '').trim();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (!looksLikeHost(host)) errors.push(`Invalid ${label || 'server'} hostname`);
  return host;
}

function portFromUrl(u, errors, fallback) {
  const raw = u.port ? Number(u.port) : (fallback === undefined ? NaN : fallback);
  if (!Number.isInteger(raw) || raw <= 0 || raw > 65535) {
    errors.push('Invalid server port');
    return undefined;
  }
  return raw;
}

/* ------------------------------------------------------------------ *
 * V2Ray-style transports
 * ------------------------------------------------------------------ */

const TRANSPORT_ALIASES = {
  '': 'tcp',
  tcp: 'tcp',
  raw: 'tcp',
  none: 'tcp',
  ws: 'ws',
  websocket: 'ws',
  http: 'http',
  h2: 'http',
  h2c: 'http',
  grpc: 'grpc',
  gun: 'grpc',
  httpupgrade: 'httpupgrade',
  quic: 'quic',
  xhttp: 'xhttp',
  splithttp: 'xhttp',
  kcp: 'kcp',
  mkcp: 'kcp',
  domainsocket: 'ds',
  ds: 'ds',
};

function splitWsPath(rawPath) {
  const value = decodeMaybeUri(rawPath || '');
  const qIdx = value.indexOf('?');
  if (qIdx === -1) return { path: value || undefined };

  const path = value.slice(0, qIdx) || '/';
  const extra = new URLSearchParams(value.slice(qIdx + 1));
  const ed = Number(extra.get('ed'));
  const eh = extra.get('eh');
  return {
    path,
    maxEarlyData: Number.isInteger(ed) && ed > 0 ? ed : undefined,
    earlyDataHeader: eh || undefined,
  };
}

// Builds a sing-box `transport` object, or undefined for plain TCP.
function buildTransport(network, params, errors) {
  const key = String(network || '').trim().toLowerCase();
  const kind = TRANSPORT_ALIASES[key];

  if (kind === undefined) {
    errors.push(`Unsupported transport type="${network}"`);
    return undefined;
  }
  if (kind === 'xhttp') {
    errors.push('Transport type="xhttp"/"splithttp" is Xray-only and is not supported by sing-box — use the tcp/ws/grpc link of the same server');
    return undefined;
  }
  if (kind === 'kcp') {
    errors.push('Transport type="kcp"/"mkcp" is not supported by sing-box');
    return undefined;
  }
  if (kind === 'ds') {
    errors.push('Transport type="domainsocket" is not supported for remote outbounds');
    return undefined;
  }

  if (kind === 'tcp') {
    const headerType = (pick(params, 'headertype', 'header_type') || 'none').toLowerCase();
    if (headerType && headerType !== 'none') {
      errors.push(`Unsupported headerType="${headerType}" (only "none" works over plain TCP)`);
    }
    return undefined;
  }

  const host = pick(params, 'host', 'obfshost');
  const rawPath = pick(params, 'path', 'servicename', 'service_name');

  if (kind === 'ws') {
    const transport = { type: 'ws' };
    const { path, maxEarlyData, earlyDataHeader } = splitWsPath(pick(params, 'path'));
    if (path) transport.path = path;
    if (host) transport.headers = { Host: host };

    const edParam = parseInteger(pick(params, 'ed'), 'ed', []);
    const early = maxEarlyData !== undefined ? maxEarlyData : edParam;
    if (early !== undefined && early > 0) {
      transport.max_early_data = early;
      transport.early_data_header_name = earlyDataHeader || pick(params, 'eh') || 'Sec-WebSocket-Protocol';
    }
    return transport;
  }

  if (kind === 'http') {
    const transport = { type: 'http' };
    if (host) transport.host = parseCsv(host);
    const path = decodeMaybeUri(pick(params, 'path') || '');
    if (path) transport.path = path;
    const method = pick(params, 'method');
    if (method) transport.method = method.toUpperCase();
    return transport;
  }

  if (kind === 'httpupgrade') {
    const transport = { type: 'httpupgrade' };
    if (host) transport.host = host;
    const { path } = splitWsPath(pick(params, 'path'));
    if (path) transport.path = path;
    return transport;
  }

  if (kind === 'grpc') {
    const transport = { type: 'grpc' };
    const service = pick(params, 'servicename', 'service_name')
      || (rawPath ? decodeMaybeUri(rawPath).replace(/^\//, '') : undefined);
    if (service) transport.service_name = service;
    return transport;
  }

  if (kind === 'quic') return { type: 'quic' };

  return undefined;
}

/* ------------------------------------------------------------------ *
 * TLS / Reality
 * ------------------------------------------------------------------ */

// `mode`: 'auto' honours ?security=, 'force' always enables TLS (trojan,
// hysteria2, tuic, anytls), 'off' never enables it.
function buildTls(params, options, errors) {
  const { server, mode = 'auto', reality = true } = options || {};
  const declared = (pick(params, 'security') || '').toLowerCase();

  let security = declared;
  if (!security) security = pick(params, 'pbk', 'publickey') ? 'reality' : (mode === 'force' ? 'tls' : 'none');
  if (security === 'xtls') security = 'tls'; // legacy XTLS links: sing-box speaks TLS + flow
  if (mode === 'force' && (security === 'none' || !security)) security = 'tls';

  if (security === 'none') return undefined;
  if (security !== 'tls' && security !== 'reality') {
    errors.push(`Unsupported security="${declared}" (expected "tls", "reality" or "none")`);
    return undefined;
  }
  if (security === 'reality' && !reality) {
    errors.push('Reality is not supported for this protocol');
    return undefined;
  }

  const tls = { enabled: true };

  const sni = pick(params, 'sni', 'servername', 'server_name', 'peer', 'host') || server;
  if (sni) tls.server_name = sni;
  if (truthyParam(pick(params, 'allowinsecure', 'insecure', 'allow_insecure', 'skip-cert-verify'))) {
    tls.insecure = true;
  }

  const alpn = parseCsv(decodeMaybeUri(pick(params, 'alpn') || ''));
  if (alpn.length) tls.alpn = alpn;

  const fp = pick(params, 'fp', 'fingerprint', 'client-fingerprint');
  if (fp && fp.toLowerCase() !== 'none') tls.utls = { enabled: true, fingerprint: fp };

  if (security === 'reality') {
    // sing-box refuses reality without uTLS, so links that omit ?fp= still need one.
    if (!tls.utls) tls.utls = { enabled: true, fingerprint: 'chrome' };
    const pbk = pick(params, 'pbk', 'publickey', 'public_key');
    const sid = pick(params, 'sid', 'shortid', 'short_id');

    if (!tls.server_name) errors.push('Missing sni for reality');
    if (!pbk || !isBase64Urlish(pbk)) errors.push('Missing/invalid pbk (reality public key)');
    if (sid !== undefined && !isShortId(sid)) errors.push('Invalid sid (reality short id)');

    tls.reality = { enabled: true, public_key: pbk };
    if (sid) tls.reality.short_id = sid;
    // Reality does its own certificate pinning; ALPN/insecure hints only confuse it.
    delete tls.insecure;
  }

  return tls;
}

/* ------------------------------------------------------------------ *
 * AmneziaWG / WireGuard .conf
 * ------------------------------------------------------------------ */

function parseIniSections(text) {
  const sections = {};
  let current = null;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      current = sectionMatch[1].trim();
      if (!sections[current]) sections[current] = [];
      continue;
    }

    const eq = line.indexOf('=');
    if (eq === -1 || !current) continue;

    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    sections[current].push([key, value]);
  }
  return sections;
}

function parseEndpoint(endpoint, errors) {
  const value = String(endpoint || '').trim();
  const idx = value.lastIndexOf(':');
  if (idx <= 0 || idx === value.length - 1) {
    errors.push('Invalid Endpoint in [Peer]');
    return {};
  }

  const host = value.slice(0, idx).trim().replace(/^\[|\]$/g, '');
  const port = Number(value.slice(idx + 1).trim());
  if (!host) errors.push('Invalid Endpoint host');
  if (!Number.isInteger(port) || port <= 0 || port > 65535) errors.push('Invalid Endpoint port');

  return { host, port };
}

function parseAmneziaWgConf(text) {
  const sections = parseIniSections(text);
  const ifaceEntries = sections.Interface || [];
  const peerEntries = sections.Peer || [];
  const errors = [];

  if (!ifaceEntries.length) errors.push('Missing [Interface] section');
  if (!peerEntries.length) errors.push('Missing [Peer] section');

  const iface = Object.fromEntries(ifaceEntries);
  const peer = Object.fromEntries(peerEntries);

  const addresses = parseCsv(iface.Address);
  if (!addresses.length) errors.push('Missing Interface Address');

  const privateKey = String(iface.PrivateKey || '').trim();
  if (!privateKey) errors.push('Missing Interface PrivateKey');

  const publicKey = String(peer.PublicKey || '').trim();
  if (!publicKey) errors.push('Missing Peer PublicKey');

  const allowedIps = parseCsv(peer.AllowedIPs);
  if (!allowedIps.length) errors.push('Missing Peer AllowedIPs');

  const { host, port } = parseEndpoint(peer.Endpoint, errors);
  const mtu = parseInteger(iface.MTU, 'Interface MTU', errors);
  const keepalive = parseInteger(peer.PersistentKeepalive, 'Peer PersistentKeepalive', errors);

  if (errors.length) fail('Invalid AmneziaWG config', errors);

  const patch = {
    type: 'awg',
    address: addresses,
    private_key: privateKey,
    peers: [
      {
        address: host,
        port,
        public_key: publicKey,
        allowed_ips: allowedIps,
      },
    ],
  };

  if (mtu !== undefined) patch.mtu = mtu;
  if (keepalive !== undefined) patch.peers[0].persistent_keepalive_interval = keepalive;
  if (peer.PresharedKey) patch.peers[0].preshared_key = String(peer.PresharedKey).trim();

  const intMappings = [
    ['Jc', 'jc'], ['Jmin', 'jmin'], ['Jmax', 'jmax'],
    ['S1', 's1'], ['S2', 's2'], ['S3', 's3'], ['S4', 's4'],
  ];
  for (const [src, dst] of intMappings) {
    if (iface[src] === undefined) continue;
    const parsed = parseInteger(iface[src], `Interface ${src}`, errors);
    if (parsed !== undefined) patch[dst] = parsed;
  }

  const stringMappings = [
    ['H1', 'h1'], ['H2', 'h2'], ['H3', 'h3'], ['H4', 'h4'],
    ['I1', 'i1'], ['I2', 'i2'], ['I3', 'i3'], ['I4', 'i4'], ['I5', 'i5'],
  ];
  for (const [src, dst] of stringMappings) {
    const value = String(iface[src] || '').trim();
    if (value) patch[dst] = value;
  }

  if (errors.length) fail('Invalid AmneziaWG config', errors);

  return patch;
}

/* ------------------------------------------------------------------ *
 * Raw sing-box outbound JSON
 * ------------------------------------------------------------------ */

function normalizeRawOutbound(outbound) {
  if (!outbound || typeof outbound !== 'object' || Array.isArray(outbound)) {
    fail('Invalid outbound JSON', ['Expected sing-box outbound object']);
  }

  let candidate = outbound;
  if (Array.isArray(outbound.outbounds)) {
    candidate = outbound.outbounds[0];
  } else if (Array.isArray(outbound.endpoints)) {
    candidate = outbound.endpoints[0];
  } else if (outbound.outbound && typeof outbound.outbound === 'object') {
    candidate = outbound.outbound;
  }

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    fail('Invalid outbound JSON', ['Cannot find outbound object']);
  }

  if (!candidate.type || typeof candidate.type !== 'string') {
    fail('Invalid outbound JSON', ['Outbound object must include string "type"']);
  }

  const next = { ...candidate };
  delete next.tag;
  return next;
}

/* ------------------------------------------------------------------ *
 * VLESS
 * ------------------------------------------------------------------ */

const PACKET_ENCODINGS = new Set(['', 'packetaddr', 'xudp']);

function parseVlessUrl(u) {
  const errors = [];
  const params = lowerParams(u.searchParams);

  const uuid = decodeMaybeUri(u.username || '').trim();
  const server = hostFromUrl(u, errors);
  const server_port = portFromUrl(u, errors);

  if (!isUuid(uuid)) errors.push('Invalid UUID in vless://<uuid>@host');

  const encryption = (pick(params, 'encryption') || 'none').toLowerCase();
  if (encryption !== 'none') errors.push(`Unsupported encryption="${encryption}" (expected none)`);

  const transport = buildTransport(pick(params, 'type', 'net') || 'tcp', params, errors);
  const tls = buildTls(params, { server }, errors);

  if (errors.length) fail('Invalid VLESS link', errors);

  const patch = { type: 'vless', server, server_port, uuid };

  const flow = pick(params, 'flow');
  // xtls-rprx-vision only exists on a raw TLS stream; it is invalid over ws/grpc/http.
  if (flow && tls && !transport) patch.flow = flow;

  const packetEncoding = (pick(params, 'packetencoding', 'packet_encoding') || '').toLowerCase();
  if (PACKET_ENCODINGS.has(packetEncoding) && packetEncoding) patch.packet_encoding = packetEncoding;

  if (tls) patch.tls = tls;
  if (transport) patch.transport = transport;

  return patch;
}

/* ------------------------------------------------------------------ *
 * VMess (base64 JSON and URL form)
 * ------------------------------------------------------------------ */

const VMESS_CIPHERS = new Set(['auto', 'none', 'zero', 'aes-128-gcm', 'chacha20-poly1305']);

function parseVmessJson(json) {
  const errors = [];
  const server = String(json.add || json.address || '').trim();
  const server_port = parseInteger(json.port, 'port', errors);
  const uuid = String(json.id || '').trim();

  if (!looksLikeHost(server)) errors.push('Invalid server hostname');
  if (server_port === undefined || server_port <= 0 || server_port > 65535) errors.push('Invalid server port');
  if (!isUuid(uuid)) errors.push('Invalid UUID in vmess config');

  const tlsMode = String(json.tls || '').trim().toLowerCase();
  const params = {
    type: String(json.net || 'tcp'),
    security: tlsMode === 'none' ? '' : tlsMode,
    host: String(json.host || '').trim(),
    path: String(json.path || '').trim(),
    servicename: String(json.path || '').trim(),
    sni: String(json.sni || '').trim(),
    alpn: String(json.alpn || '').trim(),
    fp: String(json.fp || '').trim(),
    headertype: String(json.type || 'none').trim(),
    pbk: String(json.pbk || '').trim(),
    sid: String(json.sid || '').trim(),
    allowinsecure: String(json.allowInsecure ?? json.skipCertVerify ?? '').trim(),
  };

  const transport = buildTransport(params.type, params, errors);
  const tls = buildTls(params, { server }, errors);

  if (errors.length) fail('Invalid VMess link', errors);

  const patch = { type: 'vmess', server, server_port, uuid };

  const alterId = parseInteger(json.aid ?? json.alterId, 'aid', errors);
  if (alterId !== undefined && alterId > 0) patch.alter_id = alterId;

  const cipher = String(json.scy || json.security || 'auto').trim().toLowerCase();
  patch.security = VMESS_CIPHERS.has(cipher) ? cipher : 'auto';

  if (tls) patch.tls = tls;
  if (transport) patch.transport = transport;

  if (errors.length) fail('Invalid VMess link', errors);
  return patch;
}

function parseVmessLink(raw) {
  const body = raw.slice('vmess://'.length).trim();
  const hashIdx = body.indexOf('#');
  const payload = hashIdx === -1 ? body : body.slice(0, hashIdx);

  const decoded = decodeBase64Maybe(payload);
  if (decoded && decoded.trim().startsWith('{')) {
    let json;
    try {
      json = JSON.parse(decoded);
    } catch (e) {
      fail('Invalid VMess link', [`Base64 payload is not valid JSON: ${String(e.message || e)}`]);
    }
    return parseVmessJson(json);
  }

  // Some panels emit vmess://<uuid>@host:port?... instead of base64 JSON.
  let u;
  try {
    u = new URL(raw);
  } catch {
    fail('Invalid VMess link', ['Expected base64 JSON payload or vmess://<uuid>@host:port']);
  }

  const errors = [];
  const params = lowerParams(u.searchParams);
  const server = hostFromUrl(u, errors);
  const server_port = portFromUrl(u, errors);
  const uuid = decodeMaybeUri(u.username || '').trim();
  if (!isUuid(uuid)) errors.push('Invalid UUID in vmess://<uuid>@host');

  const transport = buildTransport(pick(params, 'type', 'net') || 'tcp', params, errors);
  const tls = buildTls(params, { server }, errors);
  if (errors.length) fail('Invalid VMess link', errors);

  const patch = { type: 'vmess', server, server_port, uuid };
  const alterId = parseInteger(pick(params, 'aid', 'alterid'), 'aid', errors);
  if (alterId !== undefined && alterId > 0) patch.alter_id = alterId;
  const cipher = (pick(params, 'scy', 'encryption') || 'auto').toLowerCase();
  patch.security = VMESS_CIPHERS.has(cipher) ? cipher : 'auto';
  if (tls) patch.tls = tls;
  if (transport) patch.transport = transport;
  return patch;
}

/* ------------------------------------------------------------------ *
 * Trojan
 * ------------------------------------------------------------------ */

function parseTrojanUrl(u) {
  const errors = [];
  const params = lowerParams(u.searchParams);

  const password = decodeMaybeUri(u.username || '').trim();
  const server = hostFromUrl(u, errors);
  const server_port = portFromUrl(u, errors);

  if (!password) errors.push('Missing password in trojan://<password>@host');

  const transport = buildTransport(pick(params, 'type', 'net') || 'tcp', params, errors);
  const tls = buildTls(params, { server, mode: 'force' }, errors);

  if (errors.length) fail('Invalid Trojan link', errors);

  const patch = { type: 'trojan', server, server_port, password };
  if (tls) patch.tls = tls;
  if (transport) patch.transport = transport;
  return patch;
}

/* ------------------------------------------------------------------ *
 * Shadowsocks (SIP002 and legacy base64)
 * ------------------------------------------------------------------ */

function splitHostPort(value, errors) {
  const s = String(value || '').trim();
  const idx = s.lastIndexOf(':');
  if (idx <= 0 || idx === s.length - 1) {
    errors.push('Invalid host:port');
    return {};
  }
  let host = s.slice(0, idx).trim();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  const port = Number(s.slice(idx + 1).trim());
  if (!looksLikeHost(host)) errors.push('Invalid server hostname');
  if (!Number.isInteger(port) || port <= 0 || port > 65535) errors.push('Invalid server port');
  return { host, port };
}

function parseShadowsocksLink(raw) {
  const errors = [];
  let rest = raw.slice('ss://'.length);

  const hashIdx = rest.indexOf('#');
  if (hashIdx !== -1) rest = rest.slice(0, hashIdx);

  let query = '';
  const qIdx = rest.indexOf('?');
  if (qIdx !== -1) {
    query = rest.slice(qIdx + 1);
    rest = rest.slice(0, qIdx);
  }

  let method;
  let password;
  let host;
  let port;

  const atIdx = rest.lastIndexOf('@');
  if (atIdx !== -1) {
    const userinfo = rest.slice(0, atIdx);
    const decoded = decodeBase64Maybe(userinfo) || decodeMaybeUri(userinfo);
    const colon = decoded.indexOf(':');
    if (colon === -1) {
      errors.push('Invalid userinfo (expected method:password)');
    } else {
      method = decoded.slice(0, colon).trim();
      password = decoded.slice(colon + 1);
    }
    ({ host, port } = splitHostPort(rest.slice(atIdx + 1), errors));
  } else {
    const decoded = decodeBase64Maybe(rest);
    if (!decoded) {
      fail('Invalid Shadowsocks link', ['Expected ss://base64(method:password)@host:port']);
    }
    const at = decoded.lastIndexOf('@');
    if (at === -1) {
      errors.push('Invalid Shadowsocks payload (missing @host:port)');
    } else {
      const creds = decoded.slice(0, at);
      const colon = creds.indexOf(':');
      if (colon === -1) errors.push('Invalid userinfo (expected method:password)');
      else {
        method = creds.slice(0, colon).trim();
        password = creds.slice(colon + 1);
      }
      ({ host, port } = splitHostPort(decoded.slice(at + 1), errors));
    }
  }

  if (!method) errors.push('Missing Shadowsocks method');
  if (!password) errors.push('Missing Shadowsocks password');
  if (errors.length) fail('Invalid Shadowsocks link', errors);

  const patch = { type: 'shadowsocks', server: host, server_port: port, method, password };

  const params = lowerParams(new URLSearchParams(query));
  const plugin = pick(params, 'plugin');
  if (plugin) {
    const decodedPlugin = decodeMaybeUri(plugin);
    const semi = decodedPlugin.indexOf(';');
    const name = (semi === -1 ? decodedPlugin : decodedPlugin.slice(0, semi)).trim();
    const opts = semi === -1 ? '' : decodedPlugin.slice(semi + 1).trim();
    const supported = new Set(['obfs-local', 'simple-obfs', 'v2ray-plugin']);
    if (!supported.has(name)) {
      fail('Invalid Shadowsocks link', [`Unsupported plugin="${name}"`]);
    }
    patch.plugin = name === 'simple-obfs' ? 'obfs-local' : name;
    if (opts) patch.plugin_opts = opts;
  }

  const udpOverTcp = pick(params, 'udp-over-tcp', 'udp_over_tcp');
  if (udpOverTcp && truthyParam(udpOverTcp)) patch.udp_over_tcp = true;

  return patch;
}

/* ------------------------------------------------------------------ *
 * TUIC
 * ------------------------------------------------------------------ */

function parseTuicUrl(u) {
  const errors = [];
  const params = lowerParams(u.searchParams);

  const uuid = decodeMaybeUri(u.username || '').trim();
  const password = decodeMaybeUri(u.password || '').trim() || pick(params, 'password') || '';
  const server = hostFromUrl(u, errors);
  const server_port = portFromUrl(u, errors);

  if (!isUuid(uuid)) errors.push('Invalid UUID in tuic://<uuid>:<password>@host');
  if (!password) errors.push('Missing TUIC password');

  const tls = buildTls(params, { server, mode: 'force', reality: false }, errors);
  if (errors.length) fail('Invalid TUIC link', errors);

  const patch = { type: 'tuic', server, server_port, uuid, password };

  const congestionControl = pick(params, 'congestion_control', 'congestion-control');
  if (congestionControl) patch.congestion_control = congestionControl;

  const udpRelayMode = pick(params, 'udp_relay_mode', 'udp-relay-mode');
  if (udpRelayMode) patch.udp_relay_mode = udpRelayMode;

  if (truthyParam(pick(params, 'zero_rtt_handshake', 'reduce_rtt', 'reduce-rtt'))) {
    patch.zero_rtt_handshake = true;
  }

  patch.tls = tls || { enabled: true };
  return patch;
}

/* ------------------------------------------------------------------ *
 * Hysteria 2 / Hysteria 1
 * ------------------------------------------------------------------ */

function parseHysteria2Url(u) {
  const errors = [];
  const params = lowerParams(u.searchParams);

  const server = hostFromUrl(u, errors);
  const server_port = portFromUrl(u, errors, 443);

  const user = decodeMaybeUri(u.username || '');
  const pass = decodeMaybeUri(u.password || '');
  const password = (pass ? `${user}:${pass}` : user) || pick(params, 'auth', 'password') || '';
  if (!password) errors.push('Missing hysteria2 password');

  const tls = buildTls(params, { server, mode: 'force', reality: false }, errors);
  if (errors.length) fail('Invalid Hysteria2 link', errors);

  const patch = { type: 'hysteria2', server, server_port, password };

  const up = parseInteger(String(pick(params, 'up', 'upmbps', 'up_mbps') || '').replace(/[^0-9]/g, ''), 'up', []);
  const down = parseInteger(String(pick(params, 'down', 'downmbps', 'down_mbps') || '').replace(/[^0-9]/g, ''), 'down', []);
  if (up !== undefined && up > 0) patch.up_mbps = up;
  if (down !== undefined && down > 0) patch.down_mbps = down;

  const obfs = pick(params, 'obfs');
  if (obfs && obfs.toLowerCase() !== 'none') {
    patch.obfs = { type: obfs.toLowerCase() };
    const obfsPassword = pick(params, 'obfs-password', 'obfs_password', 'obfspassword');
    if (obfsPassword) patch.obfs.password = obfsPassword;
  }

  patch.tls = tls || { enabled: true };
  return patch;
}

function parseHysteriaUrl(u) {
  const errors = [];
  const params = lowerParams(u.searchParams);

  const server = hostFromUrl(u, errors);
  const server_port = portFromUrl(u, errors, 443);

  const tls = buildTls(params, { server, mode: 'force', reality: false }, errors);
  if (errors.length) fail('Invalid Hysteria link', errors);

  const patch = { type: 'hysteria', server, server_port };

  const auth = pick(params, 'auth', 'auth_str', 'auth-str');
  if (auth) patch.auth_str = auth;

  const up = parseInteger(String(pick(params, 'upmbps', 'up') || '').replace(/[^0-9]/g, ''), 'upmbps', []);
  const down = parseInteger(String(pick(params, 'downmbps', 'down') || '').replace(/[^0-9]/g, ''), 'downmbps', []);
  if (up !== undefined && up > 0) patch.up_mbps = up;
  if (down !== undefined && down > 0) patch.down_mbps = down;

  const obfs = pick(params, 'obfs', 'obfsparam');
  if (obfs) patch.obfs = obfs;

  patch.tls = tls || { enabled: true };
  return patch;
}

/* ------------------------------------------------------------------ *
 * AnyTLS / SOCKS
 * ------------------------------------------------------------------ */

function parseAnytlsUrl(u) {
  const errors = [];
  const params = lowerParams(u.searchParams);

  const server = hostFromUrl(u, errors);
  const server_port = portFromUrl(u, errors, 443);
  const user = decodeMaybeUri(u.username || '');
  const pass = decodeMaybeUri(u.password || '');
  const password = (pass || user || pick(params, 'password') || '').trim();
  if (!password) errors.push('Missing anytls password');

  const tls = buildTls(params, { server, mode: 'force', reality: false }, errors);
  if (errors.length) fail('Invalid AnyTLS link', errors);

  return { type: 'anytls', server, server_port, password, tls: tls || { enabled: true } };
}

function parseSocksUrl(u) {
  const errors = [];
  const server = hostFromUrl(u, errors);
  const server_port = portFromUrl(u, errors, 1080);
  if (errors.length) fail('Invalid SOCKS link', errors);

  const patch = { type: 'socks', server, server_port, version: '5' };
  const username = decodeMaybeUri(u.username || '');
  const password = decodeMaybeUri(u.password || '');
  if (username) patch.username = username;
  if (password) patch.password = password;
  return patch;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

const SCHEME_PARSERS = {
  vless: parseVlessUrl,
  trojan: parseTrojanUrl,
  tuic: parseTuicUrl,
  hysteria2: parseHysteria2Url,
  hy2: parseHysteria2Url,
  hysteria: parseHysteriaUrl,
  hy: parseHysteriaUrl,
  anytls: parseAnytlsUrl,
  socks: parseSocksUrl,
  socks5: parseSocksUrl,
};

const SUPPORTED_HINT = [
  'Supported links: vless://, vmess://, trojan://, ss://, tuic://, hysteria2://, hysteria://, anytls://, socks5://',
  'Supported config text: AmneziaWG/WireGuard .conf',
  'Or paste raw sing-box outbound JSON',
];

function linkLines(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('//'));
}

function parseSingleLink(s) {
  const scheme = (s.match(/^([a-z0-9+.-]+):\/\//i) || [])[1];
  const normalized = String(scheme || '').toLowerCase();

  if (normalized === 'vmess') return parseVmessLink(s);
  if (normalized === 'ss') return parseShadowsocksLink(s);

  if (normalized === 'ssr') {
    fail('Unsupported outbound link', ['ShadowsocksR (ssr://) is not supported by sing-box', ...SUPPORTED_HINT]);
  }

  const parser = SCHEME_PARSERS[normalized];
  if (!parser) {
    fail('Unsupported outbound link', [`Scheme "${normalized || s.slice(0, 12)}" not supported yet`, ...SUPPORTED_HINT]);
  }

  let u;
  try {
    u = new URL(s);
  } catch (e) {
    fail('Invalid outbound URL', [String(e?.message || e)]);
  }

  return parser(u);
}

function parseOutboundLink(link) {
  const s = String(link || '').trim();
  if (!s) {
    fail('Empty outbound input', ['Paste sing-box link or outbound JSON']);
  }

  if (/^[ \t]*\[(Interface|Peer)\][ \t]*$/im.test(s)) return parseAmneziaWgConf(s);

  if (s.startsWith('{')) {
    try {
      return normalizeRawOutbound(JSON.parse(s));
    } catch (e) {
      if (e instanceof SyntaxError) {
        fail('Invalid outbound JSON', [String(e.message || e)]);
      }
      throw e;
    }
  }

  let candidate = s;

  // A whole-blob base64 subscription payload.
  if (!/^[a-z0-9+.-]+:\/\//i.test(candidate)) {
    const decoded = decodeBase64Maybe(candidate.replace(/\s+/g, ''));
    if (decoded && /^[a-z0-9+.-]+:\/\//im.test(decoded.trim())) candidate = decoded.trim();
  }

  const lines = linkLines(candidate);
  const links = lines.filter((line) => /^[a-z0-9+.-]+:\/\//i.test(line));

  if (links.length > 1) {
    fail('Multiple links pasted', [
      `Found ${links.length} links — paste a single link, one outbound at a time`,
    ]);
  }
  if (links.length === 1) candidate = links[0];
  else if (lines.length === 1) candidate = lines[0];
  else if (lines.length > 1) {
    fail('Unsupported outbound input', ['Paste a single link, an AmneziaWG .conf, or outbound JSON']);
  }

  return parseSingleLink(candidate);
}

/* ------------------------------------------------------------------ *
 * Human label of a link (the "#tag" part), used by the UI header
 * ------------------------------------------------------------------ */

function extractLinkName(link) {
  const s = String(link || '').trim();
  if (!s || /^\[(Interface|Peer)\]/i.test(s) || s.startsWith('{')) return null;

  const hashIdx = s.indexOf('#');
  if (hashIdx !== -1) {
    const name = decodeMaybeUri(s.slice(hashIdx + 1)).trim();
    if (name) return name;
  }

  if (/^vmess:\/\//i.test(s)) {
    const decoded = decodeBase64Maybe(s.slice('vmess://'.length).split('#')[0]);
    if (decoded && decoded.trim().startsWith('{')) {
      try {
        const json = JSON.parse(decoded);
        const ps = String(json.ps || json.remarks || '').trim();
        if (ps) return ps;
      } catch {
        /* fall through */
      }
    }
  }

  return null;
}

function parseOutboundLinkWithName(link) {
  return {
    outbound: parseOutboundLink(link),
    name: extractLinkName(link),
  };
}

function parseVlessLink(link) {
  return parseOutboundLink(link);
}

module.exports = {
  parseOutboundLink,
  parseOutboundLinkWithName,
  parseVlessLink,
  extractLinkName,
};
