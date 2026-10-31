// T051 · ui-spec §6 F-05: tipo y tamaño de la firma y el cuño leídos de su cabecera (PNG: IHDR; JPEG: el SOF), no del
// nombre ni del tipo que declara quien la sube. Funciona igual en la interfaz y en el servidor (DT-25).

export interface ImageInfo {
  mime: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  /** Puede tener fondo transparente: PNG con canal alfa o con tRNS. JPEG nunca. */
  transparent: boolean;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const u16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u32 = (b: Uint8Array, i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
const type = (b: Uint8Array, i: number) => String.fromCharCode(b[i]!, b[i + 1]!, b[i + 2]!, b[i + 3]!);

/** null si no es un PNG o un JPEG que se pueda leer. */
export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  if (PNG_SIGNATURE.every((v, i) => bytes[i] === v)) return png(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes);
  return null;
}

function png(b: Uint8Array): ImageInfo | null {
  // IHDR es siempre el primer fragmento: largo (4), tipo (4), ancho (4), alto (4), profundidad (1), tipo de color (1).
  if (b.length < 33 || type(b, 12) !== 'IHDR') return null;
  const colorType = b[25]!;
  let transparent = colorType === 4 || colorType === 6;
  // tRNS (transparencia sin canal alfa) va antes de IDAT.
  for (let i = 33; !transparent && i + 8 <= b.length; i += 12 + u32(b, i)) {
    const t = type(b, i + 4);
    if (t === 'IDAT') break;
    if (t === 'tRNS') transparent = true;
  }
  return { mime: 'image/png', width: u32(b, 16), height: u32(b, 20), transparent };
}

function jpeg(b: Uint8Array): ImageInfo | null {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    // Marcadores sin largo: relleno (FF), TEM (01) y RSTn (D0 a D7).
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // SOF0 a SOF15, salvo DHT (C4), JPG (C8) y DAC (CC): precisión (1), alto (2), ancho (2).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > b.length) return null;
      return { mime: 'image/jpeg', width: u16(b, i + 7), height: u16(b, i + 5), transparent: false };
    }
    if (marker === 0xd9 || marker === 0xda) return null; // fin de la imagen o comienzo de los datos sin SOF
    const length = u16(b, i + 2);
    // Un segmento que se sale del archivo deja i fuera y el bucle termina sin SOF.
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}
