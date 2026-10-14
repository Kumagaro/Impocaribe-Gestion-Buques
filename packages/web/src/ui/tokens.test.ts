import { describe, expect, it } from 'vitest';
import { applyTheme, palettes, tokensCss, type PaletteKey } from './tokens';

// T018 · RF-UI-03, RNF-06 (tema claro y oscuro) y RNF-16 (contraste AA). Oráculo: la fórmula de contraste de WCAG 2.x,
// escrita aquí, independiente del código probado.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

// Cada texto sobre cada fondo donde aparece en las maquetas aprobadas (T017).
const PAIRS: [PaletteKey, PaletteKey][] = [
  ['ink', 'ground'],
  ['ink', 'surface'],
  ['ink', 'surface2'],
  ['ink2', 'ground'],
  ['ink2', 'surface'],
  ['ink2', 'surface2'],
  ['ink3', 'ground'],
  ['ink3', 'surface'],
  ['ink3', 'surface2'],
  ['accent', 'surface'],
  ['accent', 'surface2'],
  ['onAccent', 'accent'],
  ['accentInk', 'accentSoft'],
  ['ok', 'okSoft'],
  ['ok', 'surface'],
  ['warn', 'warnSoft'],
  ['warn', 'surface'],
  ['bad', 'badSoft'],
  ['bad', 'surface'],
  ['surface', 'ink'],
];

describe('RNF-16: contraste AA (4,5 : 1) de todos los pares de texto y fondo', () => {
  for (const theme of ['light', 'dark'] as const) {
    it.each(PAIRS)(`${theme}: %s sobre %s`, (fg, bg) => {
      expect(contrast(palettes[theme][fg], palettes[theme][bg])).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('RNF-06: tema claro y oscuro', () => {
  it('los dos temas definen exactamente los mismos tokens', () => {
    expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort());
  });

  it('cada color es un hexadecimal de 6 dígitos', () => {
    const all = [...Object.values(palettes.light), ...Object.values(palettes.dark)];
    expect(all.filter((c) => !/^#[0-9a-f]{6}$/.test(c))).toEqual([]);
  });

  it('las variables CSS definen el claro en :root y el oscuro según el sistema o la elección del usuario', () => {
    const css = tokensCss();
    expect(css).toContain(`:root{--ink:${palettes.light.ink};`);
    expect(css).toContain('@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){');
    expect(css).toContain(`:root[data-theme="dark"]{--ink:${palettes.dark.ink};`);
    expect(css).toContain('--ink-2:');
    expect(css).toContain('--accent-soft:');
    expect(css).toContain('color-scheme:dark');
  });

  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', null],
  ] as const)('la preferencia %s deja data-theme = %s', (pref, attr) => {
    const root = document.createElement('html');
    root.setAttribute('data-theme', 'dark');
    applyTheme(root, pref);
    expect(root.getAttribute('data-theme')).toBe(attr);
  });
});
