'use strict';

const {
  UI_DOMAINS_PATH,
  FLAT_RULESET_PATH,
  DEFAULT_UI_DOMAINS,
} = require('../config');
const { readJsonSafe, writeJsonWithSudoInstall } = require('../helpers/fs');
const {
  normalizeDomain,
  isProbablyDomainSuffix,
  buildFlatRulesFromGroups,
  uniq,
} = require('../helpers/domains');
const { restartSingBox } = require('../helpers/singbox');

function registerDomainRoutes(app) {
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

    for (const g of ui.groups) {
      g.id = String(g.id || '').trim();
      if (!g.id) return res.status(400).json({ error: 'Group must have id' });
      if (!Array.isArray(g.domains)) g.domains = [];
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
}

module.exports = registerDomainRoutes;
