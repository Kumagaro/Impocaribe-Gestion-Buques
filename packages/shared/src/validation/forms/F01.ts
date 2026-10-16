// ui-spec §6 F-01: conexión manual (P-01, "Escribir dirección"). IPv4 o nombre de equipo, con puerto opcional.
import { z } from 'zod';

/** Puerto del servidor cuando no se escribe (plan §6). */
export const DEFAULT_SERVER_PORT = 8443;
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
// Nombre de equipo: etiquetas DNS de letras, dígitos y guiones, separadas por puntos.
const HOST = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const ADDRESS_MESSAGE =
  'Escriba una dirección IPv4 o el nombre del equipo, por ejemplo 192.168.1.10 o 192.168.1.10:8443.';

export const serverAddressSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const m = /^([^:]+)(?::(\d{1,5}))?$/.exec(v);
    const host = m?.[1] ?? '';
    const port = m?.[2] === undefined ? DEFAULT_SERVER_PORT : Number(m[2]);
    // Cuatro grupos de números es una IPv4 (válida o no); lo demás, un nombre de equipo.
    const valid = /^[\d.]+$/.test(host) ? IPV4.test(host) : HOST.test(host);
    if (v === '') ctx.addIssue({ code: 'custom', message: 'Escriba la dirección del servidor.' });
    else if (!m || !valid) ctx.addIssue({ code: 'custom', message: ADDRESS_MESSAGE });
    else if (port < 1 || port > 65535) ctx.addIssue({ code: 'custom', message: 'El puerto va de 1 a 65535.' });
    else return { address: host.toLowerCase(), port };
    return z.NEVER;
  });

export const manualConnectionSchema = z.object({ address: serverAddressSchema });
