// T021 · DT-18 y RF-RED-03: verificación de la identidad del servidor, la misma en el transporte nativo de Electron
// (T115), en el de pruebas en Node y, traducida, en el de Android (T118). Nunca compara la IP.
import type { X509Certificate } from 'node:crypto';

/** Lo que el dispositivo aprendió al emparejarse: la identidad (UUID) y la huella SHA-256 de la CA de la instalación. */
export interface PairedServer {
  identity: string;
  caFingerprint: string;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

const normalize = (fingerprint: string) => fingerprint.replaceAll(':', '').toLowerCase();

/** `chain` empieza por el certificado del servidor e incluye la CA que lo firmó. */
export function verifyServerChain(chain: X509Certificate[], server: PairedServer, now: Date): Verdict {
  const [leaf] = chain;
  const ca = chain.find((c) => normalize(c.fingerprint256) === normalize(server.caFingerprint));
  if (!leaf || !ca || !leaf.checkIssued(ca) || !leaf.verify(ca.publicKey)) {
    return {
      ok: false,
      reason: 'La autoridad de certificación no es la de este servidor: puede ser un equipo intruso.',
    };
  }
  if (now < new Date(leaf.validFrom) || now > new Date(leaf.validTo)) {
    return { ok: false, reason: 'El certificado del servidor está vencido o todavía no es válido.' };
  }
  const names = (leaf.subjectAltName ?? '').split(', ');
  if (!names.includes(`DNS:${server.identity}.impocaribe`)) {
    return { ok: false, reason: 'El certificado no corresponde al servidor emparejado.' };
  }
  return { ok: true };
}
