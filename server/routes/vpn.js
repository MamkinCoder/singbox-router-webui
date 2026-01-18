'use strict';

const { readJsonSafe, readJsonDetailed, writeJsonWithSudoInstall } = require('../helpers/fs');
const { restartSingBox, singBoxStatus } = require('../helpers/singbox');
const {
  setVpnStateInConfig,
  getVpnStateFromConfig,
} = require('../helpers/vpnState');
const { SINGBOX_CONFIG_PATH } = require('../config');

function respondConfigError(res, err) {
  return res.status(500).json({
    error: `Cannot read ${SINGBOX_CONFIG_PATH}`,
    details: [String(err?.message || err || 'unknown')],
  });
}

function registerVpnRoutes(app) {
  app.get('/sb/api/vpn', async (req, res) => {
    const { data: cfg, error } = await readJsonDetailed(SINGBOX_CONFIG_PATH, null);
    if (!cfg) return respondConfigError(res, error);

    const { active, status } = await singBoxStatus();
    const { enabled, policy } = getVpnStateFromConfig(cfg);
    res.json({ enabled, policy, active, status });
  });

  app.put('/sb/api/vpn', async (req, res) => {
    const enabled = !!req.body?.enabled;
    const policy = (req.body?.policy === 'all') ? 'all' : 'domains';

    const { data: cfg, error } = await readJsonDetailed(SINGBOX_CONFIG_PATH, null);
    if (!cfg) return respondConfigError(res, error);

    setVpnStateInConfig(cfg, enabled, policy);
    await writeJsonWithSudoInstall(SINGBOX_CONFIG_PATH, cfg);
    await restartSingBox();

    const { active, status } = await singBoxStatus();
    const state = getVpnStateFromConfig(cfg);
    res.json({ ok: true, ...state, active, status });
  });
}

module.exports = registerVpnRoutes;
