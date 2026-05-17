'use strict';

const { CLIENTS_POLICY_PATH, DEFAULT_CLIENTS_POLICY } = require('../config');
const { readJsonSafe, writeJsonWithSudoInstall } = require('../helpers/fs');
const { readDhcpLeases } = require('../helpers/leases');
const { applyBypassVpnRules } = require('../helpers/bypassVpnRules');
const { applyForceVpnRules } = require('../helpers/forceVpnRules');
const { updateForceUdpSet } = require('../helpers/forceUdpSet');
const { updateBypassVpnSet } = require('../helpers/bypassVpnSet');
const { restartSingBox } = require('../helpers/singbox');
const {
  normalizeMac,
  isValidMac,
  findActiveLease,
  hasRoutingPolicy,
  buildEffectivePolicy,
} = require('../helpers/clientPolicy');

async function applyClientRouting(policy, leases) {
  const effectivePolicy = buildEffectivePolicy(policy, leases);
  await updateBypassVpnSet(effectivePolicy);
  await applyBypassVpnRules(effectivePolicy);
  await applyForceVpnRules(effectivePolicy);
  await updateForceUdpSet(effectivePolicy);
  await restartSingBox();
}

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
    const id = normalizeMac(req.params.id);
    const { name, force_vpn, force_udp_vpn, bypass_vpn } = req.body || {};
    const routingChanged = force_vpn !== undefined || force_udp_vpn !== undefined || bypass_vpn !== undefined;

    try {
      if (!isValidMac(id)) {
        return res.status(400).json({ error: 'Invalid client MAC address' });
      }

      const leases = await readDhcpLeases();
      const activeLease = findActiveLease(leases, id);
      const pol = await readJsonSafe(CLIENTS_POLICY_PATH, DEFAULT_CLIENTS_POLICY);
      pol.clients = pol.clients || {};
      const nextClient = {
        ...(pol.clients[id] || {}),
        ...(name !== undefined ? { name: String(name) } : {}),
        ...(force_vpn !== undefined ? { force_vpn: !!force_vpn } : {}),
        ...(force_udp_vpn !== undefined ? { force_udp_vpn: !!force_udp_vpn } : {}),
        ...(bypass_vpn !== undefined ? { bypass_vpn: !!bypass_vpn } : {}),
      };
      if (nextClient.bypass_vpn) {
        nextClient.force_vpn = false;
        nextClient.force_udp_vpn = false;
      }
      if (hasRoutingPolicy(nextClient) && (routingChanged || activeLease)) {
        if (!activeLease) {
          return res.status(409).json({
            error: 'Client has no active LAN IP',
            details: ['Refresh clients and enable routing only while this MAC is active on LAN.'],
          });
        }
        nextClient.ip = activeLease.ip;
      } else if (activeLease) {
        nextClient.ip = activeLease.ip;
      }
      pol.clients[id] = nextClient;

      await writeJsonWithSudoInstall(CLIENTS_POLICY_PATH, pol);
      await applyClientRouting(pol, leases);
      res.json({ ok: true, client: pol.clients[id] });
    } catch (error) {
      console.error('Failed to update client:', error);
      res.status(500).json({ error: 'Client update failed', details: [String(error?.message || error)] });
    }
  });
}

module.exports = registerClientsRoutes;
