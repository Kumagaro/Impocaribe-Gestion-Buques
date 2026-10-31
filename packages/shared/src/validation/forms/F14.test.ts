import { describe, expect, it } from 'vitest';
import { correctOrderSchema, issueOrderSchema, voidOrderSchema } from './F14.ts';

// T079 a T082 · ui-spec §6 F-14: las mismas reglas en la interfaz y en el servidor (DT-25).
const issues = (r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => [i.path.join('.'), i.message]);
const id = (n: number) => `0199f0a1-0000-7000-8000-0000000000${String(n).padStart(2, '0')}`;
const REASON = 'Peso corregido en la báscula';

const order = {
  declarationId: id(1),
  allocationId: id(2),
  recipientId: id(3),
  truckId: id(4),
  trailerIds: [id(5)],
  driverId: id(6),
  tons: '17,28',
  waybillNo: ' cp 22352 '.replace(/ /g, ''),
  loadingDate: '2026-08-30',
  lotNo: '',
  routeSheetNo: 'HR-12',
  container: 'mscu 1234567',
};

describe('F-14 Nueva orden', () => {
  it('normaliza: toneladas con 3 decimales, carta de porte y contenedor en mayúsculas, vacíos a null', () => {
    expect(issueOrderSchema.parse(order)).toEqual({
      ...order,
      tons: '17.280',
      waybillNo: 'CP22352',
      lotNo: null,
      container: 'MSCU1234567',
    });
  });

  it('cada campo con su mensaje', () => {
    expect(
      issues(
        issueOrderSchema.safeParse({
          ...order,
          declarationId: '',
          recipientId: '',
          trailerIds: [],
          tons: '0',
          waybillNo: 'CP-1',
          loadingDate: '30/08/2026',
          lotNo: 'x'.repeat(21),
          container: 'x'.repeat(16),
        }),
      ),
    ).toEqual([
      ['declarationId', 'Elija la DM.'],
      ['recipientId', 'Elija el destinatario.'],
      ['trailerIds', 'Elija al menos un remolque.'],
      ['tons', 'Las toneladas deben ser mayores que 0.'],
      ['waybillNo', 'La carta de porte solo admite letras y dígitos.'],
      ['loadingDate', 'Escriba una fecha válida.'],
      ['lotNo', 'El LOT admite como máximo 20 caracteres (tiene 21).'],
      ['container', 'El contenedor admite como máximo 15 caracteres (tiene 16).'],
    ]);
  });

  it('un remolque no se repite; la carta de porte no pasa de 20', () => {
    expect(
      issues(issueOrderSchema.safeParse({ ...order, trailerIds: [id(5), id(5)], waybillNo: 'A'.repeat(21) })),
    ).toEqual([
      ['trailerIds', 'Un remolque no puede repetirse.'],
      ['waybillNo', 'La carta de porte admite como máximo 20 caracteres (tiene 21).'],
    ]);
  });

  it('las excepciones llevan motivo de 10 a 500 caracteres', () => {
    expect(issues(issueOrderSchema.safeParse({ ...order, overrides: { capacity: 'corto' } }))).toEqual([
      ['overrides.capacity', 'El motivo debe tener al menos 10 caracteres (tiene 5).'],
    ]);
  });
});

describe('F-14 Corregir y F-15 Anular', () => {
  it('RF-ORD-18: la DM y el buque no se aceptan; el motivo y la versión, sí', () => {
    const parsed = correctOrderSchema.parse({ ...order, declarationId: id(9), reason: REASON, expectedVersion: 1 });
    expect('declarationId' in parsed).toBe(false);
    expect(parsed.reason).toBe(REASON);
  });

  it('anular pide motivo', () => {
    expect(issues(voidOrderSchema.safeParse({ reason: '', expectedVersion: 2 }))).toEqual([
      ['reason', 'Escriba el motivo: es obligatorio y queda en la bitácora.'],
    ]);
  });
});
