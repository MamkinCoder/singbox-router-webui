'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { PIHOLE_API_URL } = require('../config');

function fetchUrl(url) {
  const proto = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = proto.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Pi-hole API returned ${res.statusCode}`));
        }
        resolve(body);
      });
    });
    req.on('error', reject);
  });
}

async function readPiHoleClients() {
  const url = new URL(PIHOLE_API_URL);
  let body;
  try {
    body = await fetchUrl(url);
  } catch (e) {
    throw new Error(`Pi-hole API failure: ${e.message || e}`);
  }

  let json;
  try {
    json = JSON.parse(body);
  } catch (e) {
    throw new Error(`Pi-hole API returned invalid JSON: ${e.message || e}`);
  }

  const data = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
  return data.map((item) => {
    const ip = String(item.address || item.ip || item.client || '').trim();
    const hostname = String(item.name || item.hostname || item.ip || 'unknown').trim();
    const mac = String(item.mac || item.hardware || '').trim();
    return {
      mac,
      ip,
      hostname: hostname || 'unknown',
      lease: 'pi-hole',
    };
  }).filter((client) => client.ip);
}

module.exports = { readPiHoleClients };
