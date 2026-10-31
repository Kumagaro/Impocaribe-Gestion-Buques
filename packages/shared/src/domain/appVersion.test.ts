import { describe, expect, it } from 'vitest';
import { compareVersions, isBelowMinVersion, isVersion } from './appVersion.ts';

// T011 · DT-11: "por debajo de la mínima responde 426 UPGRADE_REQUIRED". Versiones semver `mayor.menor.parche`.
describe('isBelowMinVersion', () => {
  it.each([
    ['1.1.9', '1.2.0', true],
    ['1.2.0', '1.2.0', false], // la mínima misma es compatible
    ['1.2.1', '1.2.0', false],
    ['1.10.0', '1.9.0', false], // se compara como número, no como texto
    ['1.9.0', '1.10.0', true],
    ['2.0.0', '1.99.99', false],
    ['0.9.9', '1.0.0', true],
    ['1.2.0', '1.2.1', true],
    ['1.3.0', '1.2.9', false],
    ['10.0.0', '9.9.9', false], // mayor de dos cifras
    ['9.9.9', '10.0.0', true],
  ])('%s frente a la mínima %s → %s', (version, min, below) => {
    expect(isBelowMinVersion(version, min)).toBe(below);
  });

  it.each(['', '1.2', 'v1.2.0', '1.2.0-beta', 'abc'])(
    'una versión mal formada «%s» se trata como antigua',
    (version) => {
      expect(isBelowMinVersion(version, '0.0.0')).toBe(true);
    },
  );
});

// T113 · RF-UPD-02, 03: la versión más nueva de cada plataforma.
describe('compareVersions', () => {
  it.each([
    ['1.2.0', '1.10.0', -1],
    ['1.10.0', '1.2.0', 1],
    ['2.0.0', '2.0.0', 0],
    ['0.0.9', '0.1.0', -1],
  ])('%s frente a %s → %i', (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign);
  });

  it('una versión mal formada no se ordena', () => {
    expect(() => compareVersions('1.2', '1.2.0')).toThrow('Versión mal formada: 1.2');
    expect(isVersion('1.2.0')).toBe(true);
    expect(isVersion('1.2.0-beta')).toBe(false);
  });
});
