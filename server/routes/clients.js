'use strict';

const { CLIENTS_POLICY_PATH, DEFAULT_CLIENTS_POLICY } = require('../config');
const { readJsonSafe, writeJsonWithSudoInstall } = require('../helpers/fs');
const { readDhcpLeases } = require('../helpers/leases');
const { applyForceVpnRules } = require('../helpers/forceVpnRules');
const { updateForceUdpSet } = require('../helpers/forceUdpSet');
const { restartSingBox } = require('../helpers/singbox');

function registerClientsRoutes(app) {
  app.get('/sb/api/clients', async (req, res) => {
    const pol = await readJsonSafe(CLIENTS_POLICY_PATH, DEFAULT_CLIENTS_POLICY);
    res.json(pol);
  });

  app.get('/sb/api/clients/leases', async (req, res) => {
    try {
      const leases = await readDhcpLeases();
      res.json({ leases });
    } catch (e) {
      res.status(500).json({ error: 'Cannot read DHCP leases', details: [String(e.message || e)] });
    }
  });

  app.put('/sb/api/clients/:id', async (req, res) => {
    const id = req.params.id;
    const { name, force_vpn, force_udp_vpn, ip } = req.body || {};

    try {
      const pol = await readJsonSafe(CLIENTS_POLICY_PATH, DEFAULT_CLIENTS_POLICY);
      pol.clients = pol.clients || {};
      pol.clients[id] = {
        ...(pol.clients[id] || {}),
        ...(name !== undefined ? { name: String(name) } : {}),
        ...(force_vpn !== undefined ? { force_vpn: !!force_vpn } : {}),
        ...(force_udp_vpn !== undefined ? { force_udp_vpn: !!force_udp_vpn } : {}),
        ...(ip !== undefined ? { ip: String(ip) } : {}),
      };

      await writeJsonWithSudoInstall(CLIENTS_POLICY_PATH, pol);
      await applyForceVpnRules(pol);
      await updateForceUdpSet(pol);
      await restartSingBox();
      res.json({ ok: true, client: pol.clients[id] });
    } catch (error) {
      console.error('Failed to update client:', error);
      res.status(500).json({ error: 'Client update failed', details: [String(error?.message || error)] });
    }
  });
}

module.exports = registerClientsRoutes;
