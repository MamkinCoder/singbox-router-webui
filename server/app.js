'use strict';

const express = require('express');
const path = require('path');
const registerDomainRoutes = require('./routes/domains');
const registerVlessRoutes = require('./routes/vless');
const registerVpnRoutes = require('./routes/vpn');
const registerClientsRoutes = require('./routes/clients');
const registerHealthRoute = require('./routes/health');
const { FRONTEND_DIST, SINGBOX_CONFIG_PATH } = require('./config');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const BIND = process.env.BIND || '0.0.0.0';

function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/', express.static(FRONTEND_DIST));
  app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));

  registerDomainRoutes(app);
  registerVlessRoutes(app);
  registerVpnRoutes(app);
  registerClientsRoutes(app);
  registerHealthRoute(app);

  return app;
}

module.exports = { createApp, PORT, BIND, SINGBOX_CONFIG_PATH };
