import { createApp } from "./app.js";
import { getApiEnv } from "./config/env.js";

const env = getApiEnv();
const app = createApp({
  webOrigin: env.WEB_ORIGIN
});

app.listen(env.API_PORT, () => {
  console.log(`BondexOS API escuchando en puerto ${env.API_PORT}`);
});
