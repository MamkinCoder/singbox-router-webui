'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const { TEMPLATE_NAME_RE, VLESS_TEMPLATES_DIR } = require('./config');

async function ensureDir() {
  await fsp.mkdir(VLESS_TEMPLATES_DIR, { recursive: true });
}

function sanitizeTemplateFilename(name) {
  const clean = String(name || '')
    .trim()
    .replace(/[#\\/]+/g, '_')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '');
  return clean || 'vless-template';
}

function getTemplatePath(id) {
  if (!TEMPLATE_NAME_RE.test(id)) {
    throw new Error('Invalid template id');
  }
  return path.join(VLESS_TEMPLATES_DIR, id);
}

async function exists(file) {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

function extractNameFromVless(vless) {
  try {
    const parsed = new URL(vless);
    const hash = (parsed.hash || '').replace(/^#/, '').trim();
    if (hash) return hash;
  } catch {
    // ignore
  }
  return null;
}

async function listTemplates() {
  await ensureDir();
  const files = await fsp.readdir(VLESS_TEMPLATES_DIR);
  const entries = [];
  for (const file of files) {
    if (!TEMPLATE_NAME_RE.test(file)) continue;
    const full = path.join(VLESS_TEMPLATES_DIR, file);
    let data;
    try {
      const raw = await fsp.readFile(full, 'utf8');
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const stats = await fsp.stat(full);
    entries.push({
      id: file,
      name: String(data?.name || file.replace(/\.json$/, '')),
      created_at: stats.birthtimeMs,
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

async function readTemplate(id) {
  await ensureDir();
  const full = getTemplatePath(id);
  const raw = await fsp.readFile(full, 'utf8');
  const data = JSON.parse(raw);
  if (!data?.vless) throw new Error('Template missing vless string');
  return { id, name: String(data.name || ''), vless: String(data.vless) };
}

async function saveTemplate({ name, vless }) {
  await ensureDir();
  const displayName = String(name || '').trim() || extractNameFromVless(vless) || 'vless-template';
  const base = sanitizeTemplateFilename(displayName);
  let idx = 0;
  let candidate;
  while (true) {
    const suffix = idx === 0 ? '' : `-${idx}`;
    candidate = `${base}${suffix}.json`;
    const full = path.join(VLESS_TEMPLATES_DIR, candidate);
    if (!(await exists(full))) break;
    idx += 1;
  }
  const payload = { name: displayName, vless: String(vless).trim() };
  await fsp.writeFile(path.join(VLESS_TEMPLATES_DIR, candidate), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return { id: candidate, name: displayName };
}

async function deleteTemplate(id) {
  const full = getTemplatePath(id);
  await fsp.unlink(full);
}

module.exports = {
  listTemplates,
  readTemplate,
  saveTemplate,
  deleteTemplate,
};
