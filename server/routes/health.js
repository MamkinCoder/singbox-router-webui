'use strict';

function registerHealthRoute(app) {
  app.get('/sb/api/health', async (req, res) => {
    res.json({ ok: true });
  });
}

module.exports = registerHealthRoute;
