import { createApp } from './app.ts';
import { config } from './config.ts';
import type { ServerInfo } from './discovery/discovery.controller.ts';
import { startBroadcastResponder, startMdnsAnnouncer } from './discovery/announce.ts';
import { windowsMachineProtector } from './identity/protector.ts';
import { serverTls } from './identity/tls.ts';
import { SERVER_INFO } from './tokens.ts';

// T033: HTTPS con la identidad del servidor (DT-18). En desarrollo, sin identidad, HTTP
// (pnpm --filter @impocaribe/server identity:create la crea).
const cfg = config();
const tls = await serverTls(cfg, windowsMachineProtector());
const app = await createApp(tls ?? undefined);
await app.listen(cfg.port);
console.log(`Servidor en ${await app.getUrl()}/api/v1/health${tls ? '' : ' (HTTP: sin identidad del servidor)'}`);

// T034 · DT-20: con identidad, el servidor se anuncia por DNS-SD y responde a la difusión UDP 47800.
const info = app.get<ServerInfo | null>(SERVER_INFO);
if (info) {
  const announce = { ...info, port: cfg.port };
  const stopMdns = startMdnsAnnouncer(announce);
  const broadcast = await startBroadcastResponder(announce);
  app.enableShutdownHooks();
  process.once('SIGTERM', () => void Promise.all([stopMdns(), broadcast.close()]));
  console.log(`Anunciado como ${info.name} (DNS-SD _impocaribe._tcp y difusión UDP ${broadcast.port})`);
}
