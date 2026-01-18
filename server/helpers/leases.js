'use strict';

const fs = require('fs');
const fsp = fs.promises;
const { PIHOLE_API_URL } = require('../config');
const { readPiHoleClients } = require('./pihole');

async function readDhcpLeases() {
  return readPiHoleClients();
}

module.exports = { readDhcpLeases };
