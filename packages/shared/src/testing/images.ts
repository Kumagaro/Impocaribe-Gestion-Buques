// Imágenes mínimas para las pruebas de firma y cuño (F-05): solo la cabecera que se lee, sin píxeles reales.
// Solo para pruebas: se exporta con la condición `source` (@impocaribe/shared/testing) y no entra en dist.

/** Cabecera PNG mínima: firma, IHDR con su tamaño y tipo de color, y los fragmentos que se pidan antes de IDAT. */
export function png(width: number, height: number, colorType = 6, chunks: string[] = []): Uint8Array {
  const out: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const chunk = (type: string, data: number[]) => {
    const n = data.length;
    out.push(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...[...type].map((c) => c.charCodeAt(0)), ...data);
    out.push(0, 0, 0, 0); // CRC: no se comprueba
  };
  const u32 = (v: number) => [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  chunk('IHDR', [...u32(width), ...u32(height), 8, colorType, 0, 0, 0]);
  for (const type of chunks) chunk(type, [0, 0]);
  chunk('IDAT', [1, 2, 3]);
  chunk('IEND', []);
  return Uint8Array.from(out);
}

/** JPEG mínimo: SOI, un APP0 y el SOF indicado con su tamaño. */
export function jpeg(width: number, height: number, sof = 0xc0): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x06,
    0x4a,
    0x46,
    0x49,
    0x46,
    0xff,
    sof,
    0x00,
    0x0b,
    0x08,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    0x01,
    0x01,
    0x11,
    0x00,
    0xff,
    0xd9,
  ]);
}
