// T021 · DT-19: transporte HTTP de pruebas en Node con la misma verificación de identidad que el nativo. La conexión
// TLS se verifica antes de entregarla a HTTP, así que a un servidor que no es el emparejado no le llega ni un byte.
import { X509Certificate } from 'node:crypto';
import { Agent, request } from 'node:https';
import { connect, type DetailedPeerCertificate } from 'node:tls';
import { verifyServerChain, type PairedServer } from './server-identity.ts';

export class ServerIdentityError extends Error {}

function peerChain(cert: DetailedPeerCertificate): X509Certificate[] {
  const chain: X509Certificate[] = [];
  for (let c: DetailedPeerCertificate | undefined = cert; c?.raw; c = c.issuerCertificate) {
    chain.push(new X509Certificate(c.raw));
    if (c.issuerCertificate === c) break; // la raíz se apunta a sí misma
  }
  return chain;
}

export function createNodeTransport(server: PairedServer, now: () => Date = () => new Date()) {
  const agent = new Agent({ keepAlive: false });
  // La CA de la instalación no es de confianza para el sistema: la confianza la decide verifyServerChain.
  agent.createConnection = (options, callback) => {
    const socket = connect({ ...(options as object), rejectUnauthorized: false });
    socket.once('secureConnect', () => {
      const verdict = verifyServerChain(peerChain(socket.getPeerCertificate(true)), server, now());
      if (verdict.ok) callback!(null, socket);
      else {
        socket.destroy();
        callback!(new ServerIdentityError(verdict.reason), undefined as never);
      }
    });
    socket.once('error', (err) => callback!(err, undefined as never));
    return undefined as never;
  };

  return (url: string, init: RequestInit): Promise<Response> =>
    new Promise((resolve, reject) => {
      const req = request(
        url,
        { method: init.method ?? 'GET', headers: init.headers as Record<string, string>, agent },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const headers = new Headers();
            for (const [k, v] of Object.entries(res.headers)) if (typeof v === 'string') headers.set(k, v);
            resolve(
              new Response(chunks.length ? Buffer.concat(chunks) : null, { status: res.statusCode ?? 0, headers }),
            );
          });
        },
      );
      req.on('error', reject);
      if (typeof init.body === 'string') req.write(init.body);
      req.end();
    });
}
