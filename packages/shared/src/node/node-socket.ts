// T043 · DT-19 y plan §6.4: el equivalente de Node de platform.ws, con la misma verificación de identidad que el
// transporte HTTP (T021): a un servidor que no es el emparejado no le llega ni el primer mensaje con el token.
import WebSocket from 'ws';
import { identityAgent } from './node-transport.ts';
import type { PairedServer } from './server-identity.ts';

/** La forma de PlatformSocket (web/src/platform/platform.ts). */
export interface NodeSocket {
  send(data: string): void;
  close(): void;
  on(event: 'open' | 'message' | 'close' | 'error', listener: (data?: string) => void): void;
}

export function createNodeSocket(server: PairedServer, now: () => Date = () => new Date()) {
  const agent = identityAgent(server, now);
  return (url: string): NodeSocket => {
    const ws = new WebSocket(url, { agent });
    return {
      send: (data) => ws.send(data),
      close: () => ws.close(),
      on(event, listener) {
        if (event === 'message') ws.on('message', (data) => listener(data.toString()));
        else if (event === 'error') ws.on('error', (err) => listener(err.message));
        else ws.on(event, () => listener());
      },
    };
  };
}
