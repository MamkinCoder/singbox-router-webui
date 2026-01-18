'use strict';

const { readLanClientsFromNeigh } = require('./pihole');

async function readDhcpLeases() {
  return readLanClientsFromNeigh({ iface: 'eth0' });
}

module.exports = { readDhcpLeases };
