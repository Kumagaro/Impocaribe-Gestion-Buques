import { describe, expect, it } from 'vitest';
import { maskDigits, maskPhone, maskTons, maskUpper } from './masks';

// T024 · RF-VAL-07: ayudas de escritura.

describe('maskDigits (carné, licencia, DM, código de 6 dígitos)', () => {
  it.each([
    ['84a01-19b', '840119'],
    [' 00431 ', '00431'],
    ['', ''],
  ])('%s → %s', (raw, out) => expect(maskDigits(raw)).toBe(out));
});

describe('maskUpper (chapas)', () => {
  it('pasa a mayúsculas, también con tildes y eñes', () => expect(maskUpper('w011612 ñá')).toBe('W011612 ÑÁ'));
});

describe('maskPhone (acepta +53, 8 dígitos)', () => {
  it.each([
    ['52345678', '52345678'],
    ['5234 5678', '52345678'],
    ['52-34-56-78', '52345678'],
    ['523456789', '52345678'],
    ['+53 5234 5678', '+53 52345678'],
    ['+5352345678', '+53 52345678'],
    ['+535234567890', '+53 52345678'],
    ['+5', '+5'],
    ['+53', '+53'],
    ['5+3', '53'],
  ])('%s → %s', (raw, out) => expect(maskPhone(raw)).toBe(out));
});

describe('maskTons (coma o punto, como máximo 3 decimales)', () => {
  it.each([
    ['17,280', '17,280'],
    ['17.28', '17,28'],
    ['17,2805', '17,280'],
    ['1a7,x2', '17,2'],
    ['17,,2', '17,2'],
    ['17.2,8', '17,28'],
    [',5', ',5'],
  ])('%s → %s', (raw, out) => expect(maskTons(raw)).toBe(out));
});
