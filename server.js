'use strict';

const { createApp, PORT, BIND, SINGBOX_CONFIG_PATH } = require('./server/app');

const app = createApp();

app.listen(PORT, BIND, () => {
  console.log(`sb-webui listening on http://${BIND}:${PORT}`);
  console.log(`Using config: ${SINGBOX_CONFIG_PATH}`);
});
