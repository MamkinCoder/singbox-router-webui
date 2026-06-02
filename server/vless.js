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
