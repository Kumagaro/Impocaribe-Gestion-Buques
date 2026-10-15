import { createApp } from './app.ts';
import { config } from './config.ts';
import { windowsMachineProtector } from './identity/protector.ts';
import { serverTls } from './identity/tls.ts';

// T033: HTTPS con la identidad del servidor (DT-18). En desarrollo, sin identidad, HTTP (pnpm --filter @impocaribe/server identity:create la crea).
const cfg = config();
const tls = await serverTls(cfg, windowsMachineProtector());
const app = await createApp(tls ?? undefined);
await app.listen(cfg.port);
console.log(`Servidor en ${await app.getUrl()}/api/v1/health${tls ? '' : ' (HTTP: sin identidad del servidor)'}`);
