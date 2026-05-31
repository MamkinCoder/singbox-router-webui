'use strict';

const { SINGBOX_DEFAULT_INTERFACE } = require('../config');

function ensureRoute(cfg) {
  if (!cfg.route) cfg.route = {};
  return cfg.route;
}

function normalizeSingBoxRoute(cfg) {
  const route = ensureRoute(cfg);

  // Pin sing-box egress to single known-good uplink. This Pi may have other
  // interfaces on the same subnet, and auto-detect can pick the wrong one.
  route.auto_detect_interface = false;
  route.default_interface = SINGBOX_DEFAULT_INTERFACE;

  return cfg;
}

module.exports = {
  ensureRoute,
  normalizeSingBoxRoute,
};
