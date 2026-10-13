import { createApp } from './app.ts';
import { config } from './config.ts';

// HTTPS llega con la identidad del servidor (T033).
const { port } = config();
const app = await createApp();
await app.listen(port);
console.log(`Servidor en ${await app.getUrl()}/api/v1/health`);
