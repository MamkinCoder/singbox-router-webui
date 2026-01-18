'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('close', (code) => {
      if (code === 0) return resolve({ out, err });
      reject(new Error(`${cmd} ${args.join(' ')} failed (${code}): ${err || out}`));
    });
  });
}

async function writeJsonWithSudoInstall(finalPath, obj) {
  const tmpPath = `/tmp/sbwebui-${path.basename(finalPath)}-${Date.now()}.json`;
  const data = JSON.stringify(obj, null, 2) + '\n';
  await fsp.writeFile(tmpPath, data, { mode: 0o600 });
  await run('sudo', ['/usr/bin/install', '-m', '0644', tmpPath, finalPath]);
  await fsp.unlink(tmpPath).catch(() => {});
}

async function readJsonSafe(p, fallbackObj = null) {
  try {
    const raw = await fsp.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallbackObj;
  }
}

module.exports = {
  run,
  writeJsonWithSudoInstall,
  readJsonSafe,
};
