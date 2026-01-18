'use strict';

const { readJsonSafe, writeJsonWithSudoInstall } = require('../helpers/fs');
const { restartSingBox, singBoxStatus } = require('../helpers/singbox');
const {
  setVpnStateInConfig,
  getVpnStateFromConfig,
} = require('../helpers/vpnState');
const { SINGBOX_CONFIG_PATH } = require('../config');

function registerVpnRoutes(app) {
  app.get('/sb/api/vpn', async (req, res) => {
    const cfg = await readJsonSafe(SINGBOX_CONFIG_PATH, null);
    if (!cfg) return res.status(500).json({ error: `Cannot read ${SINGBOX_CONFIG_PATH}` });

    const { active, status } = await singBoxStatus();
    const { enabled, policy } = getVpnStateFromConfig(cfg);
    res.json({ enabled, policy, active, status });
  });

  app.put('/sb/api/vpn', async (req, res) => {
    const enabled = !!req.body?.enabled;
    const policy = (req.body?.policy === 'all') ? 'all' : 'domains';

    const cfg = await readJsonSafe(SINGBOX_CONFIG_PATH, null);
    if (!cfg) return res.status(500).json({ error: `Cannot read ${SINGBOX_CONFIG_PATH}` });

    setVpnStateInConfig(cfg, enabled, policy);
    await writeJsonWithSudoInstall(SINGBOX_CONFIG_PATH, cfg);
    await restartSingBox();

    const { active, status } = await singBoxStatus();
    const state = getVpnStateFromConfig(cfg);
    res.json({ ok: true, ...state, active, status });
  });
}

module.exports = registerVpnRoutes;
