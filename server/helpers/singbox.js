'use strict';

const { run } = require('./fs');

async function restartSingBox() {
  await run('sudo', ['/bin/systemctl', 'restart', 'sing-box']);
}

async function singBoxStatus() {
  try {
    const { out } = await run('sudo', ['/bin/systemctl', 'is-active', 'sing-box']);
    const status = out.trim();
    return { active: status === 'active', status };
  } catch {
    return { active: false, status: 'unknown' };
  }
}

module.exports = { restartSingBox, singBoxStatus };
