import { describe, expect, it } from 'vitest';
import { arrivalDateIssue, arrivalSchema, editVesselSchema, etaWarning, tonsSchema, vesselSchema } from './F07.ts';
import {
  allocationSchema,
  declarationNumberSchema,
  declarationSchema,
  editAllocationSchema,
  editDeclarationSchema,
  exceedsVesselText,
  surplusDispositionSchema,
} from './F08.ts';

// T062 a T068 · ui-spec §6 F-07 a F-10: las mismas reglas en la interfaz y en el servidor (DT-25).
const issues = (r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => [i.path.join('.'), i.message]);

const VESSEL = '0199f0a1-0000-7000-8000-0000000000a1';
const CLIENT = '0199f0a1-0000-7000-8000-0000000000b1';
const REASON = 'Corrección del manifiesto';

const eagle = {
  name: 'Eagle 1',
  manifest: '0080/2026',
  bl: 'BL-123',
  port: 'Mariel, terminal 2',
  internalBuyer: 'IMPOCARIBE S.A.',
  etaDate: '',
  arrivalDate: '',
  totalTons: '50000,5',
};

describe('toneladas (RF-VAL-07)', () => {
  const s = tonsSchema('Escriba el total.');
  it.each([
    ['50000', '50000.000'],
    ['0,001', '0.001'],
    ['17.28', '17.280'],
  ])('«%s» → %s', (input, out) => {
    expect(s.parse(input)).toBe(out);
  });

  it.each([
    ['', 'Escriba el total.'],
    ['0', 'Las toneladas deben ser mayores que 0.'],
    ['1,2345', 'Las toneladas admiten como máximo 3 decimales (tiene 4).'],
    ['-5', '«-5» no es una cantidad de toneladas válida.'],
    ['1000000000', 'La cantidad es demasiado grande.'],
  ])('«%s» se rechaza', (input, message) => {
    expect(issues(s.safeParse(input))).toEqual([['', message]]);
  });

  it('una asignación puede bajar a 0 (RF-ASG-03)', () => {
    expect(tonsSchema('x', { allowZero: true }).parse('0')).toBe('0.000');
  });
});

describe('F-07 Buque', () => {
  it('alta sin fechas: las vacías son null', () => {
    expect(vesselSchema.parse({ ...eagle, totalTons: '50000' })).toEqual({
      ...eagle,
      totalTons: '50000.000',
      etaDate: null,
      arrivalDate: null,
    });
  });

  it('cada campo con su mensaje', () => {
    expect(
      issues(
        vesselSchema.safeParse({
          ...eagle,
          name: 'E',
          manifest: '',
          bl: 'x'.repeat(31),
          port: 'ab',
          internalBuyer: '',
          etaDate: '2026-02-30',
          totalTons: '',
        }),
      ),
    ).toEqual([
      ['name', 'El nombre debe tener entre 2 y 60 caracteres (tiene 1).'],
      ['manifest', 'Escriba el manifiesto.'],
      ['bl', 'El B/L debe tener entre 1 y 30 caracteres (tiene 31).'],
      ['port', 'El puerto y la terminal debe tener entre 3 y 100 caracteres (tiene 2).'],
      ['internalBuyer', 'Escriba el comprador interno.'],
      ['etaDate', 'Escriba una fecha válida.'],
      ['totalTons', 'Escriba el total del buque en toneladas.'],
    ]);
  });

  it('el nombre solo admite letras, dígitos, espacios y guiones', () => {
    expect(issues(vesselSchema.safeParse({ ...eagle, name: 'Eagle/1' }))).toEqual([
      ['name', 'El nombre solo admite letras, dígitos, espacios y guiones.'],
    ]);
    expect(vesselSchema.parse({ ...eagle, name: 'Sea-Star Ñ' }).name).toBe('Sea-Star Ñ');
  });

  it('la edición acepta el motivo vacío (lo exige el servidor si cambia el total) o uno válido', () => {
    const base = { ...eagle, expectedVersion: 2 };
    expect(editVesselSchema.parse({ ...base, reason: '' }).reason).toBeUndefined();
    expect(issues(editVesselSchema.safeParse({ ...base, reason: 'corto' }))).toEqual([
      ['reason', 'El motivo debe tener al menos 10 caracteres (tiene 5).'],
    ]);
  });

  it('la fecha real: obligatoria al registrar el arribo y nunca futura', () => {
    expect(issues(arrivalSchema.safeParse({ arrivalDate: '', expectedVersion: 1 }))).toEqual([
      ['arrivalDate', 'Escriba una fecha válida.'],
    ]);
    expect(arrivalDateIssue('2026-10-21', '2026-10-20')).toBe('La fecha de arribo real no puede ser futura.');
    expect(arrivalDateIssue('2026-10-20', '2026-10-20')).toBeUndefined();
  });

  it('advierte cuando la estimada ya pasó y no hay real', () => {
    expect(etaWarning('2026-10-19', null, '2026-10-20')).toBe('La fecha estimada ya pasó; ¿registrar el arribo real?');
    expect(etaWarning('2026-10-20', null, '2026-10-20')).toBeUndefined();
    expect(etaWarning('2026-10-19', '2026-10-19', '2026-10-20')).toBeUndefined();
  });
});

describe('F-08 DM', () => {
  it.each([
    ['', 'Escriba el número de la DM.'],
    ['0431', 'El número de DM debe tener 5 dígitos (tiene 4).'],
    ['004311', 'El número de DM debe tener 5 dígitos (tiene 6).'],
    ['0043A', 'El número de DM solo admite dígitos.'],
  ])('el número «%s» se rechaza', (number, message) => {
    expect(issues(declarationNumberSchema.safeParse(number))).toEqual([['', message]]);
  });

  it('alta sin total y sin asignación: pendiente de total', () => {
    expect(declarationSchema.parse({ number: '00431', clientId: CLIENT, brand: ' Dosel ', totalTons: '' })).toEqual({
      number: '00431',
      clientId: CLIENT,
      brand: 'Dosel',
      totalTons: null,
    });
  });

  it('alta con asignación inicial', () => {
    expect(
      declarationSchema.parse({
        number: '00431',
        clientId: CLIENT,
        brand: 'Dosel',
        totalTons: '80000',
        allocation: { vesselId: VESSEL, tons: '80000' },
      }).allocation,
    ).toEqual({ vesselId: VESSEL, tons: '80000.000' });
  });

  it('la edición exige motivo', () => {
    expect(
      issues(editDeclarationSchema.safeParse({ brand: 'Dosel', totalTons: '80', reason: '', expectedVersion: 1 })),
    ).toEqual([['reason', 'Escriba el motivo: es obligatorio y queda en la bitácora.']]);
  });
});

describe('F-09 Asignación y F-10 Sobrante', () => {
  it('confirmar la asignación parcial exige motivo (RF-ASG-02)', () => {
    expect(issues(allocationSchema.safeParse({ vesselId: VESSEL, tons: '80000', confirmPartial: true }))).toEqual([
      ['reason', 'Escriba el motivo: es obligatorio y queda en la bitácora.'],
    ]);
    expect(allocationSchema.parse({ vesselId: VESSEL, tons: '80000', confirmPartial: true, reason: REASON })).toEqual({
      vesselId: VESSEL,
      tons: '80000.000',
      confirmPartial: true,
      reason: REASON,
    });
  });

  it('cambiar una asignación exige motivo', () => {
    expect(issues(editAllocationSchema.safeParse({ tons: '10', reason: 'x', expectedVersion: 1 }))).toEqual([
      ['reason', 'El motivo debe tener al menos 10 caracteres (tiene 1).'],
    ]);
  });

  it('transferir pide el buque destino; asignar a una DM no es destino (decisión T068)', () => {
    expect(issues(surplusDispositionSchema.safeParse({ kind: 'transfer', tons: '5', reason: REASON }))).toEqual([
      ['targetVesselId', 'Elija el buque destino.'],
    ]);
    expect(surplusDispositionSchema.safeParse({ kind: 'allocate', tons: '5', reason: REASON }).success).toBe(false);
    expect(surplusDispositionSchema.parse({ kind: 'loss', tons: '0,001', reason: REASON }).tons).toBe('0.001');
  });

  it('el texto de ADV-06 (HU-04)', () => {
    expect(exceedsVesselText('00431', 'EAGLE1', '30 000,000 t')).toBe(
      'La DM 00431 supera la cantidad restante del buque EAGLE1 en 30 000,000 t',
    );
  });
});
