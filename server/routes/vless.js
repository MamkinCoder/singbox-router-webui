'use strict';

const { parseVlessLink } = require('../vless');
const { readJsonSafe, readJsonDetailed, writeJsonWithSudoInstall } = require('../helpers/fs');
const { deepMergeKeep } = require('../helpers/merge');
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

    const ob = Array.isArray(cfg.outbounds) ? cfg.outbounds.find((x) => x && x.tag === 'vpn') : null;
    if (!ob) return res.status(404).json({ error: 'No outbound with tag "vpn" found' });

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
    const templateId = req.body?.template_id;
    let vless = req.body?.vless;

    if (!vless && templateId) {
      try {
        const tpl = await readTemplate(templateId);
        vless = tpl.vless;
      } catch (e) {
        if (e.code === 'ENOENT' || /Invalid template/.test(String(e.message))) {
          return res.status(404).json({ error: 'Template not found' });
        }
        return res.status(500).json({ error: 'Cannot read template', details: [String(e.message || e)] });
      }
    }

    if (!vless) return res.status(400).json({ error: 'Expected {vless:"vless://..."} or {template_id:"..."}' });

    let patch;
    try {
      patch = parseVlessLink(vless);
    } catch (e) {
      return res.status(400).json({
        error: e.message || 'Invalid VLESS link',
        details: e.details || undefined,
      });
    }

    const { data: cfg, error } = await readJsonDetailed(SINGBOX_CONFIG_PATH, null);
    if (!cfg) return respondConfigError(res, error);
    if (!Array.isArray(cfg.outbounds)) return res.status(500).json({ error: 'config.outbounds missing/invalid' });

    const idx = cfg.outbounds.findIndex((x) => x && x.tag === 'vpn');
    if (idx === -1) return res.status(404).json({ error: 'No outbound with tag "vpn" found' });

    cfg.outbounds[idx] = deepMergeKeep(cfg.outbounds[idx], patch);

    await writeJsonWithSudoInstall(SINGBOX_CONFIG_PATH, cfg);
    await restartSingBox();

    res.json({ ok: true, updated: patch });
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
    const vless = req.body?.vless;
    if (!vless) return res.status(400).json({ error: 'Expected {vless:"vless://..."}' });

    try {
      parseVlessLink(vless);
    } catch (e) {
      return res.status(400).json({
        error: e.message || 'Invalid VLESS link',
        details: e.details || undefined,
      });
    }

    try {
      const template = await saveTemplate({ name: req.body?.name, vless });
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
