'use strict';

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || '').trim());
}

function isHostname(v) {
  return /^[a-z0-9.-]+$/i.test(String(v || '')) && String(v || '').includes('.');
}

function isBase64Urlish(v) {
  return /^[A-Za-z0-9_-]{20,200}$/.test(String(v || '').trim());
}

function isShortId(v) {
  return /^[0-9a-f]{8,32}$/i.test(String(v || '').trim());
}

function truthyParam(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

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

  return {
    host,
    port,
  };
}

function buildAwgArray(values) {
  const keys = ['Jc', 'Jmin', 'Jmax', 'S1', 'S2', 'S3', 'S4', 'H1', 'H2', 'H3', 'H4'];
  return keys.map((key) => values[key]).filter((value) => value !== undefined && value !== '');
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

  const awgValues = {};
  for (const key of ['Jc', 'Jmin', 'Jmax', 'S1', 'S2', 'S3', 'S4', 'H1', 'H2', 'H3', 'H4']) {
    if (iface[key] !== undefined) awgValues[key] = String(iface[key]).trim();
  }
  const awgArray = buildAwgArray(awgValues);

  if (errors.length) {
    const err = new Error('Invalid AmneziaWG config');
    err.details = errors;
    throw err;
  }

  const patch = {
    type: 'wireguard',
    server: host,
    server_port: port,
    local_address: addresses,
    private_key: privateKey,
    peer_public_key: publicKey,
  };

  if (mtu !== undefined) patch.mtu = mtu;
  if (peer.PresharedKey) patch.pre_shared_key = String(peer.PresharedKey).trim();

  // Legacy WireGuard outbound in sing-box 1.13 still parses `peers`, but
  // peer objects do not accept `persistent_keepalive_interval`. Keep config
  // minimal and valid for outbound mode.
  patch.peers = [
    {
      server: host,
      server_port: port,
      public_key: publicKey,
      ...(peer.PresharedKey ? { pre_shared_key: String(peer.PresharedKey).trim() } : {}),
      allowed_ips: allowedIps,
    },
  ];

  // Current amnezia-box JSON schema exposed in repo source does not contain
  // AWG obfuscation fields (Jc/Jmin/S1...H4). Preserve them nowhere rather
  // than emit invalid unknown fields. If fork later exposes JSON support,
  // mapper can add them back.
  void keepalive;
  void awgArray;

  return patch;
}

function normalizeRawOutbound(outbound) {
  if (!outbound || typeof outbound !== 'object' || Array.isArray(outbound)) {
    const err = new Error('Invalid outbound JSON');
    err.details = ['Expected sing-box outbound object'];
    throw err;
  }

  let candidate = outbound;
  if (Array.isArray(outbound.outbounds)) {
    candidate = outbound.outbounds[0];
  } else if (outbound.outbound && typeof outbound.outbound === 'object') {
    candidate = outbound.outbound;
  }

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    const err = new Error('Invalid outbound JSON');
    err.details = ['Cannot find outbound object'];
    throw err;
  }

  if (!candidate.type || typeof candidate.type !== 'string') {
    const err = new Error('Invalid outbound JSON');
    err.details = ['Outbound object must include string "type"'];
    throw err;
  }

  const next = { ...candidate };
  delete next.tag;
  return next;
}

function parseVlessUrl(u) {
  const errors = [];

  const uuid = decodeURIComponent(u.username || '').trim();
  const server = (u.hostname || '').trim();
  const server_port = u.port ? Number(u.port) : NaN;

  if (!isUuid(uuid)) errors.push('Invalid UUID in vless://<uuid>@host');
  if (!server || !isHostname(server)) errors.push('Invalid server hostname');
  if (!Number.isInteger(server_port) || server_port <= 0 || server_port > 65535) errors.push('Invalid server port');

  const q = u.searchParams;
  const allowedQueryKeys = new Set([
    'type',
    'security',
    'encryption',
    'flow',
    'sni',
    'servername',
    'fp',
    'fingerprint',
    'pbk',
    'publickey',
    'sid',
    'shortid',
    'spx',
  ]);
  const seen = new Set();
  for (const key of q.keys()) {
    const normalized = key.toLowerCase();
    if (!allowedQueryKeys.has(normalized) && !seen.has(normalized)) {
      errors.push(`Unexpected query parameter "${key}"`);
    }
    seen.add(normalized);
  }

  const type = (q.get('type') || '').toLowerCase();
  if (type && type !== 'tcp') errors.push(`Unsupported type="${type}" (only tcp supported)`);

  const encryption = (q.get('encryption') || '').toLowerCase();
  if (encryption && encryption !== 'none') errors.push(`Unsupported encryption="${encryption}" (expected none)`);

  const flow = q.get('flow') || undefined;

  const security = (q.get('security') || '').toLowerCase();
  const allowedSecurity = new Set(['reality', 'tls', '']);
  if (!allowedSecurity.has(security)) {
    errors.push(`Invalid security="${security}" (expected "reality" or "tls")`);
  }

  const sni = q.get('sni') || q.get('serverName') || undefined;
  const fp = q.get('fp') || q.get('fingerprint') || undefined;
  const pbk = q.get('pbk') || q.get('publicKey') || undefined;
  const sid = q.get('sid') || q.get('shortId') || undefined;

  if (security === 'reality') {
    if (!sni) errors.push('Missing sni for reality');
    if (!pbk || !isBase64Urlish(pbk)) errors.push('Missing/invalid pbk (reality public key)');
    if (sid && !isShortId(sid)) errors.push('Invalid sid (reality short id)');
  }

  if (errors.length) {
    const err = new Error('Invalid VLESS link');
    err.details = errors;
    throw err;
  }

  const patch = {
    type: 'vless',
    server,
    server_port,
    uuid,
  };
  if (flow) patch.flow = flow;

  if (security === 'reality' || security === 'tls') {
    patch.tls = { enabled: true };
    if (sni) patch.tls.server_name = sni;
    if (fp) patch.tls.utls = { enabled: true, fingerprint: fp };

    if (security === 'reality') {
      patch.tls.reality = { enabled: true, public_key: pbk };
      if (sid) patch.tls.reality.short_id = sid;
    }
  }

  return patch;
}

function parseTuicUrl(u) {
  const errors = [];

  const uuid = decodeURIComponent(u.username || '').trim();
  const password = decodeURIComponent(u.password || '').trim();
  const server = (u.hostname || '').trim();
  const server_port = u.port ? Number(u.port) : NaN;

  if (!isUuid(uuid)) errors.push('Invalid UUID in tuic://<uuid>:<password>@host');
  if (!password) errors.push('Missing TUIC password');
  if (!server || !isHostname(server)) errors.push('Invalid server hostname');
  if (!Number.isInteger(server_port) || server_port <= 0 || server_port > 65535) errors.push('Invalid server port');

  const q = u.searchParams;
  const allowedQueryKeys = new Set([
    'congestion_control',
    'udp_relay_mode',
    'security',
    'sni',
    'allowinsecure',
    'alpn',
  ]);
  const seen = new Set();
  for (const key of q.keys()) {
    const normalized = key.toLowerCase();
    if (!allowedQueryKeys.has(normalized) && !seen.has(normalized)) {
      errors.push(`Unexpected query parameter "${key}"`);
    }
    seen.add(normalized);
  }

  const security = (q.get('security') || '').toLowerCase();
  if (security && security !== 'tls') {
    errors.push(`Unsupported security="${security}" (expected tls)`);
  }

  const sni = q.get('sni') || undefined;
  const congestionControl = q.get('congestion_control') || undefined;
  const udpRelayMode = q.get('udp_relay_mode') || undefined;
  const allowInsecure = truthyParam(q.get('allowInsecure'));
  const alpn = (q.get('alpn') || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (errors.length) {
    const err = new Error('Invalid TUIC link');
    err.details = errors;
    throw err;
  }

  const patch = {
    type: 'tuic',
    server,
    server_port,
    uuid,
    password,
  };
  if (congestionControl) patch.congestion_control = congestionControl;
  if (udpRelayMode) patch.udp_relay_mode = udpRelayMode;

  patch.tls = {
    enabled: true,
  };
  if (sni) patch.tls.server_name = sni;
  if (allowInsecure) patch.tls.insecure = true;
  if (alpn.length) patch.tls.alpn = alpn;

  return patch;
}

function parseOutboundLink(link) {
  const s = String(link || '').trim();
  if (!s) {
    const err = new Error('Empty outbound input');
    err.details = ['Paste sing-box link or outbound JSON'];
    throw err;
  }

  if (s.startsWith('[Interface]') || s.startsWith('[Peer]')) {
    return parseAmneziaWgConf(s);
  }

  if (s.startsWith('{')) {
    try {
      return normalizeRawOutbound(JSON.parse(s));
    } catch (e) {
      if (e instanceof SyntaxError) {
        const err = new Error('Invalid outbound JSON');
        err.details = [String(e.message || e)];
        throw err;
      }
      throw e;
    }
  }

  let u;

  try {
    u = new URL(s);
  } catch (e) {
    const err = new Error('Invalid outbound URL');
    err.details = [String(e?.message || e)];
    throw err;
  }

  const scheme = (u.protocol || '').replace(/:$/, '').toLowerCase();
  if (scheme === 'vless') return parseVlessUrl(u);
  if (scheme === 'tuic') return parseTuicUrl(u);

  const err = new Error('Unsupported outbound link');
  err.details = [
    `Scheme "${scheme}" not supported yet`,
    'Supported links: vless://, tuic://',
    'Supported config text: AmneziaWG/WireGuard .conf',
    'Or paste raw sing-box outbound JSON',
  ];
  throw err;
}

function parseVlessLink(link) {
  return parseOutboundLink(link);
}

module.exports = {
  parseOutboundLink,
  parseVlessLink,
};
