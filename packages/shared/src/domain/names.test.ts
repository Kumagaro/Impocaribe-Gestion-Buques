import { describe, expect, it } from 'vitest';
import { findSimilar, normalizeName, normalizePlate, similarNames } from './names.ts';

// T055 · RF-CAT-01 y 08, ADV-05, plan §4.2 (Catálogos): mismo nombre al normalizar; parecidos, solo aviso.

describe('normalizeName', () => {
  it.each([
    ['Nuevos Tiempos S.R.L.', 'NUEVOS TIEMPOS SRL'],
    ['NUEVOS TIEMPOS SRL', 'NUEVOS TIEMPOS SRL'],
    ['  nuevos   tiempos,  s.r.l ', 'NUEVOS TIEMPOS SRL'],
    ['Empresa Cárnica «La Habana»', 'EMPRESA CARNICA LA HABANA'],
    ['Ñame y Cía.', 'NAME Y CIA'],
    ['Transporte-Escambray', 'TRANSPORTE ESCAMBRAY'],
  ])('«%s» → «%s»', (raw, normalized) => {
    expect(normalizeName(raw)).toBe(normalized);
  });
});

describe('normalizePlate', () => {
  it.each([
    ['w 011 612', 'W011612'],
    ['W011612', 'W011612'],
    [' p-123 456 ', 'P123456'],
  ])('«%s» → «%s»', (raw, plate) => {
    expect(normalizePlate(raw)).toBe(plate);
  });
});

describe('similarNames (ADV-05)', () => {
  it('«Nuevos Tiempos» y «Nuevo Tiempo» son parecidos', () => {
    expect(similarNames('Nuevos Tiempos', 'Nuevo Tiempo')).toBe(true);
  });

  it('dos nombres iguales al normalizar no son "parecidos": son el mismo (eso lo bloquea la unicidad)', () => {
    expect(similarNames('Nuevos Tiempos S.R.L.', 'NUEVOS TIEMPOS SRL')).toBe(false);
  });

  it.each([
    ['Juan Carlos Miranda González', 'Juan Carlos Miranda Gonzales'],
    ['Transportes Escambray', 'Transporte Escambray'],
    ['ABC', 'ABD'],
  ])('«%s» ~ «%s»', (a, b) => {
    expect(similarNames(a, b)).toBe(true);
  });

  it.each([
    ['Nuevos Tiempos', 'Viejos Tiempos'],
    ['Transportes Escambray', 'Transportes Habana'],
    ['ABC', 'XYZ'],
  ])('«%s» y «%s» no se parecen', (a, b) => {
    expect(similarNames(a, b)).toBe(false);
  });

  it('el umbral crece con el largo: dos cambios en un nombre largo se avisan; en uno corto, no', () => {
    expect(similarNames('Empresa Mayorista Pinar', 'Empresa Mayorista Pinal')).toBe(true);
    expect(similarNames('Abcde', 'Axcye')).toBe(false);
  });
});

describe('findSimilar', () => {
  const items = [
    { id: '1', name: 'Nuevos Tiempos' },
    { id: '2', name: 'Transportes Escambray' },
    { id: '3', name: 'Nuevo Tiempo' },
  ];

  it('devuelve el igual al normalizar (que bloquea) aparte de los parecidos (que avisan)', () => {
    expect(findSimilar('NUEVOS  tiempos', items)).toEqual({ same: items[0], similar: [items[2]] });
  });

  it('no se compara consigo mismo al editar', () => {
    expect(findSimilar('Nuevos Tiempos', items, '1')).toEqual({ same: undefined, similar: [items[2]] });
  });

  it('un nombre vacío no busca nada', () => {
    expect(findSimilar('  ', items)).toEqual({ same: undefined, similar: [] });
  });
});
