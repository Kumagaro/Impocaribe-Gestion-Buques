// RF-RED-04 y plan §9: código de comparación del emparejamiento. Lo calculan la app (Web Crypto en el WebView) y el
// servidor con esta misma función: si alguien se interpone con otra CA o cambia un nonce, los códigos no coinciden.
const encoder = new TextEncoder();

/** 6 dígitos: SHA-256 de "huella|nonce del dispositivo|nonce del servidor", 4 primeros bytes módulo 1 000 000. */
export async function pairingCode(caFingerprint: string, clientNonce: string, serverNonce: string): Promise<string> {
  const fp = caFingerprint.replaceAll(':', '').toLowerCase();
  const digest = new DataView(
    await crypto.subtle.digest('SHA-256', encoder.encode(`${fp}|${clientNonce}|${serverNonce}`)),
  );
  return String(digest.getUint32(0) % 1_000_000).padStart(6, '0');
}
