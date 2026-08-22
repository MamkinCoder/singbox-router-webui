'use strict';

const { parseOutboundLink, extractLinkName } = require('../vless');
const { readJsonSafe, readJsonDetailed, writeJsonWithSudoInstall } = require('../helpers/fs');
const {
  SINGBOX_CONFIG_PATH,
} = require('../config');
const {
  listTemplates,
  readTemplate,
  saveTemplate,
  deleteTemplate,
} = require('../templates');
const { restartSingBox } = require('../helpers/singbox');
const { normalizeSingBoxRoute } = require('../helpers/singboxConfig');
const { getVpnTarget, setVpnTarget } = require('../helpers/vpnTarget');
const { saveActiveOutbound, describeActiveOutbound } = require('../helpers/activeOutbound');

function respondConfigError(res, err) {
  return res.status(500).json({
    error: `Cannot read ${SINGBOX_CONFIG_PATH}`,
    details: [String(err?.message || err || 'unknown')],
  });
}

function registerVlessRoutes(app) {
  app.get('/sb/api/vless', async (req, res) => {
    const { data: cfg, error } = await readJsonDetailed(SINGBOX_CONFIG_PATH, null);
    if (!cfg) return respondConfigError(res, error);

    const target = getVpnTarget(cfg);
    if (!target) return res.status(404).json({ error: 'No target with tag "vpn" found' });

    res.json(target.value);
  });

  app.put('/sb/api/vless', async (req, res) => {
    const templateId = req.body?.template_id;
    let link = req.body?.link || req.body?.vless;
    let templateName = null;

    if (!link && templateId) {
      try {
        const tpl = await readTemplate(templateId);
        link = tpl.link || tpl.vless;
        templateName = tpl.name || null;
      } catch (e) {
        if (e.code === 'ENOENT' || /Invalid template/.test(String(e.message))) {
          return res.status(404).json({ error: 'Template not found' });
        }
        return res.status(500).json({ error: 'Cannot read template', details: [String(e.message || e)] });
      }
    }

    if (!link) return res.status(400).json({ error: 'Expected {link:"scheme://..."} or {template_id:"..."}' });

    let patch;
    try {
      patch = parseOutboundLink(link);
    } catch (e) {
      return res.status(400).json({
        error: e.message || 'Invalid outbound link',
        details: e.details || undefined,
      });
    }

    const { data: cfg, error } = await readJsonDetailed(SINGBOX_CONFIG_PATH, null);
    if (!cfg) return respondConfigError(res, error);
    // Replace vpn target body instead of deep-merging it. Reality links may
    // intentionally omit fields like short_id, and merge would keep stale
    // values from an older config, causing handshake failures.
    setVpnTarget(cfg, patch);
    normalizeSingBoxRoute(cfg);

    await writeJsonWithSudoInstall(SINGBOX_CONFIG_PATH, cfg);
    await saveActiveOutbound({
      name: templateName || extractLinkName(link),
      link,
      outbound: patch,
      templateId: templateId || null,
    });
    await restartSingBox();

    res.json({ ok: true, updated: patch, active: await describeActiveOutbound(cfg) });
  });

  app.get('/sb/api/vless/active', async (req, res) => {
    const { data: cfg, error } = await readJsonDetailed(SINGBOX_CONFIG_PATH, null);
    if (!cfg) return respondConfigError(res, error);

    const active = await describeActiveOutbound(cfg);
    if (!active) return res.status(404).json({ error: 'No target with tag "vpn" found' });
    res.json(active);
  });

  app.get('/sb/api/vless/templates', async (req, res) => {
    try {
      const templates = await listTemplates();
      res.json({ templates });
    } catch (e) {
      res.status(500).json({ error: 'Cannot read templates', details: [String(e?.message || e)] });
    }
  });

  app.get('/sb/api/vless/templates/:id', async (req, res) => {
    try {
      const tpl = await readTemplate(req.params.id);
      res.json(tpl);
    } catch (e) {
      if (e.code === 'ENOENT') return res.status(404).json({ error: 'Template not found' });
      res.status(500).json({ error: 'Cannot read template', details: [String(e?.message || e)] });
    }
  });

  app.post('/sb/api/vless/templates', async (req, res) => {
    const link = req.body?.link || req.body?.vless;
    if (!link) return res.status(400).json({ error: 'Expected {link:"scheme://..."}' });

    try {
      parseOutboundLink(link);
    } catch (e) {
      return res.status(400).json({
        error: e.message || 'Invalid outbound link',
        details: e.details || undefined,
      });
    }

    try {
      const template = await saveTemplate({ name: req.body?.name, link });
      res.json({ ok: true, template });
    } catch (e) {
      res.status(500).json({ error: 'Cannot save template', details: [String(e?.message || e)] });
    }
  });

  app.delete('/sb/api/vless/templates/:id', async (req, res) => {
    try {
      await deleteTemplate(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'ENOENT') return res.status(404).json({ error: 'Template not found' });
      res.status(500).json({ error: 'Cannot delete template', details: [String(e?.message || e)] });
    }
  });
}

module.exports = registerVlessRoutes;
