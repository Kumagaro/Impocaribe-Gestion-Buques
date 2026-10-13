import { createApp } from './app.ts';

// Puerto del plan §6 (8443); HTTPS llega con la identidad del servidor (T033).
const app = await createApp();
await app.listen(Number(process.env.PORT ?? 8443));
console.log(`Servidor en ${await app.getUrl()}/api/v1/health`);
