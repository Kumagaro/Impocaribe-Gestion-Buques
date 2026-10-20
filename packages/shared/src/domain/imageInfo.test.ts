import { describe, expect, it } from 'vitest';
import { jpeg, png } from '../testing/images.ts';
import { imageInfo } from './imageInfo.ts';

// T051 · ui-spec §6 F-05: la firma y el cuño son PNG o JPG reales; el tamaño se lee de la cabecera, no del nombre.

describe('imageInfo', () => {
  it('PNG con canal alfa: tamaño y transparencia', () => {
    expect(imageInfo(png(640, 220, 6))).toEqual({ mime: 'image/png', width: 640, height: 220, transparent: true });
  });

  it('PNG en escala de grises con alfa (tipo 4) también admite transparencia', () => {
    expect(imageInfo(png(300, 100, 4))?.transparent).toBe(true);
  });

  it('PNG sin alfa: transparente solo si trae tRNS antes de los datos', () => {
    expect(imageInfo(png(300, 100, 2))?.transparent).toBe(false);
    expect(imageInfo(png(300, 100, 3, ['PLTE', 'tRNS']))?.transparent).toBe(true);
  });

  it.each([0xc0, 0xc1, 0xc2])('JPEG con SOF %s: tamaño, nunca transparente', (sof) => {
    expect(imageInfo(jpeg(1200, 400, sof))).toEqual({
      mime: 'image/jpeg',
      width: 1200,
      height: 400,
      transparent: false,
    });
  });

  it('JPEG: salta los segmentos hasta el SOF y no confunde DHT (C4) con un SOF', () => {
    const withDht = Uint8Array.from([0xff, 0xd8, 0xff, 0xc4, 0x00, 0x04, 0x00, 0x00, ...jpeg(500, 150).slice(2)]);
    expect(imageInfo(withDht)).toMatchObject({ width: 500, height: 150 });
  });

  it.each([
    ['vacío', new Uint8Array()],
    ['GIF', Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0])],
    ['texto con extensión .png', new TextEncoder().encode('no soy una imagen')],
    ['PNG cortado', png(300, 100).slice(0, 20)],
    ['JPEG sin SOF', Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])],
    ['JPEG con un segmento que se sale', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x7f, 0xff, 0x00])],
  ])('%s: no es una imagen válida', (_, bytes) => {
    expect(imageInfo(bytes)).toBeNull();
  });
});

// Casos límite de la lectura, uno por cada decisión del lector (mutación, Const. art. V).
const u = (...parts: (number | number[] | Uint8Array)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'number' ? [p] : [...p])));
const SOI = [0xff, 0xd8];
/** Un SOF0 de 9 bytes (marcador, largo, precisión, alto y ancho) sin los componentes. */
const sof = (w: number, h: number, m = 0xc0) => [0xff, m, 0x00, 0x0b, 0x08, h >> 8, h & 255, w >> 8, w & 255];
const chunk = (type: string, data: number[] = []) => {
  const n = data.length;
  return [
    n >>> 24,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
    ...[...type].map((c) => c.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0,
  ];
};
const ihdr = (colorType: number) => {
  const head = png(300, 100, colorType);
  return [...head.slice(0, 33)];
};

describe('imageInfo: PNG en sus límites', () => {
  it('la firma PNG debe estar completa', () => {
    const bad = png(300, 100);
    bad[3] = 0x00;
    expect(imageInfo(bad)).toBeNull();
  });

  it('basta con la firma y el IHDR (33 bytes)', () => {
    expect(imageInfo(png(300, 100, 6).slice(0, 33))).toMatchObject({ width: 300, height: 100, transparent: true });
  });

  it('el primer fragmento debe ser IHDR', () => {
    const bad = png(300, 100);
    bad[15] = 0x58; // IHDX
    expect(imageInfo(bad)).toBeNull();
  });

  it('sin IDAT ni tRNS no es transparente (y la lectura termina)', () => {
    expect(imageInfo(u(ihdr(2), chunk('IEND')))?.transparent).toBe(false);
  });

  it('un tRNS cuyo encabezado llega justo al final cuenta', () => {
    expect(imageInfo(u(ihdr(2), [0, 0, 0, 0, 0x74, 0x52, 0x4e, 0x53]))?.transparent).toBe(true);
  });

  it('otro fragmento antes de IDAT no la hace transparente', () => {
    expect(imageInfo(u(ihdr(2), chunk('gAMA', [0, 1, 2, 3]), chunk('IDAT', [1]), chunk('IEND')))?.transparent).toBe(
      false,
    );
  });

  it('un tRNS después de IDAT no cuenta: va antes de los datos', () => {
    expect(imageInfo(u(ihdr(2), chunk('IDAT', [1]), chunk('tRNS', [0, 0]), chunk('IEND')))?.transparent).toBe(false);
  });
});

describe('imageInfo: JPEG en sus límites', () => {
  it('debe empezar por SOI (FF D8)', () => {
    expect(imageInfo(u(0x00, 0xd8, sof(400, 200)))).toBeNull();
    expect(imageInfo(u(0xff, 0x00, sof(400, 200)))).toBeNull();
    expect(imageInfo(u(0x00, 0x00, sof(400, 200)))).toBeNull();
  });

  it('salta los bytes de relleno FF', () => {
    expect(imageInfo(u(SOI, 0xff, 0xff, sof(400, 200)))).toMatchObject({ width: 400, height: 200 });
  });

  it.each([0x01, 0xd0, 0xd7])('salta los marcadores sin largo (%s)', (m) => {
    expect(imageInfo(u(SOI, 0xff, m, sof(400, 200)))).toMatchObject({ width: 400, height: 200 });
  });

  it.each([0xc3, 0xc5, 0xcf])('cualquier SOF da el tamaño (%s)', (m) => {
    expect(imageInfo(u(SOI, sof(800, 300, m)))).toMatchObject({ width: 800, height: 300 });
  });

  it.each([0xb0, 0xc4, 0xc8, 0xcc])('un segmento que no es SOF (%s) se salta por su largo', (m) => {
    expect(imageInfo(u(SOI, 0xff, m, 0x00, 0x04, 0x01, 0x02, sof(640, 220)))).toMatchObject({
      width: 640,
      height: 220,
    });
  });

  it('un segmento vacío (largo 2) se salta', () => {
    expect(imageInfo(u(SOI, 0xff, 0xe0, 0x00, 0x02, sof(640, 220)))).toMatchObject({ width: 640, height: 220 });
  });

  it.each([0, 1])('un largo imposible (%s) no es una imagen', (n) => {
    expect(imageInfo(u(SOI, 0xff, 0xe0, 0x00, n, sof(640, 220)))).toBeNull();
  });

  it.each([0xd9, 0xda])('el fin de la imagen o los datos (%s) antes del SOF: sin tamaño', (m) => {
    expect(imageInfo(u(SOI, 0xff, m, 0x00, 0x04, 0x00, 0x00, sof(640, 220)))).toBeNull();
  });

  it('un SOF que termina justo al final se lee; uno cortado, no', () => {
    expect(imageInfo(u(SOI, sof(512, 128)))).toMatchObject({ width: 512, height: 128 });
    expect(imageInfo(u(SOI, sof(512, 128).slice(0, 8)))).toBeNull();
  });
});
