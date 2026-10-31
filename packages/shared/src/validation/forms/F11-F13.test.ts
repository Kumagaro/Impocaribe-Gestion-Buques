import { describe, expect, it } from 'vitest';
import { carrierSchema } from './F12.ts';
import { clientSchema } from './F11.ts';
import {
  changeDriverCarrierSchema,
  driverSchema,
  licenseSchema,
  plateSchema,
  trailerSchema,
  truckSchema,
} from './F13.ts';

// T055 y T056 · ui-spec §6 F-11 a F-13, RF-CAT-01 a 05 y 09: las mismas reglas en la interfaz y en el servidor (DT-25).
const issues = (r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => [i.path.join('.'), i.message]);

const CARRIER = '0199f0a1-0000-7000-8000-0000000000c1';
const TRAILER = '0199f0a1-0000-7000-8000-0000000000e1';

describe('F-11 Cliente y destinatarios', () => {
  const recipient = { name: 'Almacén Central', address: 'Calle 100 y Boyeros, La Habana' };

  it('nombre de 3 a 150 caracteres y al menos un destinatario', () => {
    expect(clientSchema.parse({ name: ' Nuevos Tiempos S.R.L. ', recipients: [recipient] })).toEqual({
      name: 'Nuevos Tiempos S.R.L.',
      recipients: [recipient],
    });
    expect(issues(clientSchema.safeParse({ name: 'AB', recipients: [] }))).toEqual([
      ['name', 'El nombre debe tener entre 3 y 150 caracteres (tiene 2).'],
      ['recipients', 'Agregue al menos un destinatario.'],
    ]);
  });

  it('cada destinatario con nombre (3 a 150) y dirección (5 a 250)', () => {
    expect(
      issues(clientSchema.safeParse({ name: 'Nuevos Tiempos', recipients: [{ name: 'A', address: 'Cuba' }] })),
    ).toEqual([
      ['recipients.0.name', 'El nombre del destinatario debe tener entre 3 y 150 caracteres (tiene 1).'],
      ['recipients.0.address', 'La dirección debe tener entre 5 y 250 caracteres (tiene 4).'],
    ]);
  });

  it('un destinatario que ya existe viaja con su id y su estado', () => {
    const id = '0199f0a1-0000-7000-8000-0000000000d1';
    expect(
      clientSchema.parse({ name: 'Nuevos Tiempos', recipients: [{ ...recipient, id, active: false }] }).recipients,
    ).toEqual([{ ...recipient, id, active: false }]);
  });
});

describe('F-12 Transportista', () => {
  it('nombre de 3 a 150 caracteres', () => {
    expect(carrierSchema.parse({ name: '  Transportes Escambray ' })).toEqual({ name: 'Transportes Escambray' });
    expect(issues(carrierSchema.safeParse({ name: '' }))).toEqual([['name', 'Escriba el nombre del transportista.']]);
  });
});

describe('F-13 Camión, remolque y chofer', () => {
  it.each([
    ['w 011 612', 'W011612'],
    ['p-12345', 'P12345'],
  ])('chapa «%s» → «%s»', (raw, plate) => {
    expect(plateSchema.parse(raw)).toBe(plate);
  });

  it.each([
    ['W011', 'La chapa debe tener entre 5 y 10 letras y dígitos (tiene 4).'],
    ['W01161234567', 'La chapa debe tener entre 5 y 10 letras y dígitos (tiene 12).'],
    ['W011#12', 'La chapa solo admite letras y dígitos.'],
    ['', 'Escriba la chapa.'],
  ])('chapa «%s»: %s', (raw, message) => {
    expect(issues(plateSchema.safeParse(raw))).toEqual([['', message]]);
  });

  it('camión: transportista, chapa y al menos un remolque; base por defecto LA HABANA', () => {
    expect(
      truckSchema.parse({
        carrierId: CARRIER,
        plate: 'w011612',
        tractorPlate: '',
        baseLocation: '',
        trailerIds: [TRAILER],
      }),
    ).toEqual({
      carrierId: CARRIER,
      plate: 'W011612',
      tractorPlate: null,
      baseLocation: 'LA HABANA',
      trailerIds: [TRAILER],
    });
    expect(
      issues(
        truckSchema.safeParse({ carrierId: '', plate: 'W011612', tractorPlate: '', baseLocation: '', trailerIds: [] }),
      ),
    ).toEqual([
      ['carrierId', 'Elija el transportista.'],
      ['trailerIds', 'Elija al menos un remolque habitual: no hay camiones sin remolque.'],
    ]);
    expect(
      issues(
        truckSchema.safeParse({
          carrierId: CARRIER,
          plate: 'W011612',
          tractorPlate: 'X1',
          baseLocation: 'a'.repeat(61),
          trailerIds: [TRAILER],
        }),
      ),
    ).toEqual([
      ['tractorPlate', 'La chapa debe tener entre 5 y 10 letras y dígitos (tiene 2).'],
      ['baseLocation', 'La base admite como máximo 60 caracteres (tiene 61).'],
    ]);
    expect(
      issues(
        truckSchema.safeParse({
          carrierId: CARRIER,
          plate: 'W011612',
          tractorPlate: '',
          baseLocation: '',
          trailerIds: [TRAILER, TRAILER],
        }),
      ),
    ).toEqual([['trailerIds', 'Un remolque aparece dos veces.']]);
  });

  it('remolque: capacidad en toneladas, mayor que 0 y hasta 100', () => {
    expect(trailerSchema.parse({ carrierId: CARRIER, plate: 'p 54321', capacityTons: '32,5' })).toEqual({
      carrierId: CARRIER,
      plate: 'P54321',
      capacityTons: '32.500',
    });
    expect(trailerSchema.parse({ carrierId: CARRIER, plate: 'P54321', capacityTons: '100' }).capacityTons).toBe(
      '100.000',
    );
    for (const [tons, message] of [
      ['0', 'La capacidad debe ser mayor que 0 t.'],
      ['100,001', 'La capacidad admite como máximo 100 t.'],
      ['12,3456', 'Las toneladas admiten como máximo 3 decimales (tiene 4).'],
      ['', 'Escriba la capacidad en toneladas.'],
      ['doce', '«doce» no es una cantidad de toneladas válida.'],
    ])
      expect(issues(trailerSchema.safeParse({ carrierId: CARRIER, plate: 'P54321', capacityTons: tons }))).toEqual([
        ['capacityTons', message],
      ]);
  });

  it.each([
    ['1234567890', 'La licencia debe tener 11 dígitos (tiene 10).'],
    ['123456789012', 'La licencia debe tener 11 dígitos (tiene 12).'],
    ['1234567890A', 'La licencia solo admite dígitos.'],
    ['', 'Escriba el número de licencia.'],
  ])('licencia «%s»: %s', (raw, message) => {
    expect(issues(licenseSchema.safeParse(raw))).toEqual([['', message]]);
  });

  it('chofer: todo obligatorio (nombre, carné, licencia y transportista)', () => {
    const ok = {
      fullName: 'Juan Carlos Miranda González',
      nationalId: '84011905548',
      licenseNo: '12345678901',
      carrierId: CARRIER,
    };
    expect(driverSchema.parse(ok)).toEqual(ok);
    expect(issues(driverSchema.safeParse({ fullName: '', nationalId: '', licenseNo: '', carrierId: '' }))).toEqual([
      ['fullName', 'Escriba el nombre y los apellidos.'],
      ['nationalId', 'Escriba el carné de identidad.'],
      ['licenseNo', 'Escriba el número de licencia.'],
      ['carrierId', 'Elija el transportista.'],
    ]);
  });

  it('RF-CAT-09: cambiar el transportista pide motivo', () => {
    expect(
      issues(changeDriverCarrierSchema.safeParse({ carrierId: CARRIER, reason: 'corto', expectedVersion: 2 })),
    ).toEqual([['reason', 'El motivo debe tener al menos 10 caracteres (tiene 5).']]);
  });
});
