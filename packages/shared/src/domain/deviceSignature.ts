// DT-24: firma de cada petición con el secreto del dispositivo. La calculan la app (Web Crypto en el WebView) y el
// servidor con la misma función.
const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 en hexadecimal del cuerpo de la petición (vacío si no tiene). */
export async function bodyHash(body: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(body)));
}

export interface SignedRequest {
  method: string;
  /** Ruta con la consulta, tal como llega al servidor (por ejemplo `/api/v1/orders?x=1`). */
  path: string;
  /** Hora del dispositivo en milisegundos desde 1970 (header X-Device-Time). */
  time: string;
  body: string;
}

/** HMAC-SHA256 en hexadecimal de "MÉTODO\nruta\ntiempo\nhash del cuerpo". */
export async function signRequest(request: SignedRequest, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const canonical = `${request.method.toUpperCase()}\n${request.path}\n${request.time}\n${await bodyHash(request.body)}`;
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(canonical)));
}
