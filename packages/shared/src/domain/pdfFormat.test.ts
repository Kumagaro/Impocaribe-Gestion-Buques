import { describe, expect, it } from 'vitest';
import { pdfIssueDate, pdfLoadingDate, pdfTons } from './pdfFormat.ts';
import { parseTons } from './tons.ts';

// T077 · RF-PDF-01, plan §8.1: los formatos del documento, con los ejemplos de la spec calculados a mano.
describe('RF-PDF-01: formatos del documento', () => {
  it('fecha de emisión dd.mm.aaaa y fecha de carga dd/mm/aaaa', () => {
    expect(pdfIssueDate('2026-08-29')).toBe('29.08.2026');
    expect(pdfLoadingDate('2026-08-30')).toBe('30/08/2026');
    expect(pdfIssueDate('2027-01-05')).toBe('05.01.2027');
  });

  it.each([
    ['17.28', '17.280'],
    ['1125', '1 125.000'],
    ['0,001', '0.001'],
    ['999', '999.000'],
    ['1000', '1 000.000'],
    ['1234567,5', '1 234 567.500'],
  ])('%s t → %s', (tons, text) => {
    expect(pdfTons(parseTons(tons))).toBe(text);
  });

  it('una fecha mal escrita es un error, no un texto cualquiera', () => {
    expect(() => pdfIssueDate('29/08/2026')).toThrow('no es una fecha AAAA-MM-DD');
  });
});
