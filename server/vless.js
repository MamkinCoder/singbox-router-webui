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

function parseVlessLink(vless) {
  const errors = [];

  const s = String(vless || '').trim();
  if (!s.startsWith('vless://')) {
    const err = new Error('Not a vless:// link');
    err.details = ['Must start with vless://'];
    throw err;
  }

  let u;
  try {
    u = new URL(s);
  } catch (e) {
    const err = new Error('Invalid VLESS URL');
    err.details = [String(e?.message || e)];
    throw err;
  }

  const uuid = decodeURIComponent(u.username || '').trim();
  const server = (u.hostname || '').trim();
  const server_port = u.port ? Number(u.port) : NaN;

  if (!isUuid(uuid)) errors.push('Invalid UUID in vless://<uuid>@host');
  if (!server || !isHostname(server)) errors.push('Invalid server hostname');
  if (!Number.isInteger(server_port) || server_port <= 0 || server_port > 65535) errors.push('Invalid server port');

  const q = u.searchParams;

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
    if (!sid || !isShortId(sid)) errors.push('Missing/invalid sid (reality short id)');
  }

  if (errors.length) {
    const err = new Error('Invalid VLESS link');
    err.details = errors;
    throw err;
  }

  const patch = {
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
      patch.tls.reality = { enabled: true, public_key: pbk, short_id: sid };
    }
  }

  return patch;
}

module.exports = { parseVlessLink };
