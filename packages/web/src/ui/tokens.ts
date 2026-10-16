// T018 · Tokens del sistema de diseño (plan §7.2), derivados del prototipo y de las maquetas aprobadas en T017.
// Esta es la única fuente: las variables CSS se generan a partir de estas constantes (tokensCss).

const light = {
  ink: '#14202b',
  ink2: '#4a5c6b',
  ink3: '#5e7081',
  ground: '#eff3f6',
  surface: '#ffffff',
  surface2: '#f7f9fb',
  line: '#d3dde5',
  line2: '#e6ecf1',
  accent: '#1a3e96',
  accentSoft: '#e4eaf7',
  accentInk: '#15327a',
  onAccent: '#ffffff',
  ok: '#1b7a4b',
  okSoft: '#e2f2e9',
  warn: '#8a5102',
  warnSoft: '#fbefd9',
  bad: '#ae241c',
  badSoft: '#fbe6e4',
};

export type PaletteKey = keyof typeof light;
export type Palette = Record<PaletteKey, string>;

const dark: Palette = {
  ink: '#e3ebf2',
  ink2: '#a6b8c7',
  ink3: '#8397a8',
  ground: '#0d141c',
  surface: '#151f2a',
  surface2: '#1b2733',
  line: '#2b3a48',
  line2: '#233140',
  accent: '#7b9de8',
  accentSoft: '#16203a',
  accentInk: '#a8c1f2',
  onAccent: '#0d141c',
  ok: '#4fbb84',
  okSoft: '#122a20',
  warn: '#d89b3c',
  warnSoft: '#2e2312',
  bad: '#e4746a',
  badSoft: '#331716',
};

export const palettes: { light: Palette; dark: Palette } = { light, dark };

export const fonts = {
  ui: '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'Consolas, "SF Mono", Menlo, "DejaVu Sans Mono", monospace',
  doc: '"Times New Roman", Times, serif',
} as const;

/** Escala tipográfica en px. */
export const fontSizes = { xs: 11, sm: 12.5, md: 14, lg: 16, xl: 23 } as const;
/** Espaciado en múltiplos de 4 px. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;
export const radii = { sm: 6, md: 9, lg: 14 } as const;
/**
 * Duraciones en ms de los patrones de movimiento (ui-spec §3). Son los máximos de la tabla; donde no fija uno, rige el
 * general de 300 ms (Const. art. XIV.3). Los presets de motion/ y las transiciones CSS las toman de aquí.
 */
export const durations = {
  pagePhone: 250, // MOV-01
  pageTablet: 220,
  pageDesktop: 180,
  listItem: 250, // MOV-02
  rowHighlightHold: 1500,
  number: 400, // MOV-03
  progress: 300,
  sheet: 240, // MOV-04
  dialog: 200,
  message: 150, // MOV-05
  press: 100, // MOV-06
  success: 300, // MOV-07
  iconRing: 300, // MOV-08
  iconLock: 200,
  iconDraw: 200,
  iconSpin: 1000, // bucle mientras se sincroniza
  iconPulse: 1600, // bucle mientras no hay conexión
  shimmer: 1400, // MOV-09 (bucle)
  step: 250, // MOV-10
  shake: 200, // MOV-11
  check: 200, // MOV-12
  summary: 220, // MOV-13
  reducedFade: 100, // RF-UI-06
} as const;
/** Objetivo táctil mínimo en teléfono y tablet (RNF-16). */
export const touchTarget = 48;
export const shadows = {
  light: {
    card: '0 1px 2px rgba(20,32,43,.08), 0 4px 12px rgba(20,32,43,.05)',
    sheet: '0 -6px 24px rgba(20,32,43,.18)',
  },
  dark: { card: '0 1px 2px rgba(0,0,0,.4), 0 4px 14px rgba(0,0,0,.3)', sheet: '0 -6px 24px rgba(0,0,0,.5)' },
} as const;

const kebab = (key: string) =>
  key
    .replace(/([A-Z])/g, '-$1')
    .replace(/(\d)/g, '-$1')
    .toLowerCase();

function vars(palette: Palette, theme: 'light' | 'dark'): string {
  const colors = Object.entries(palette).map(([k, v]) => `--${kebab(k)}:${v};`);
  const shadow = `--shadow:${shadows[theme].card};--sheet-shadow:${shadows[theme].sheet};`;
  return colors.join('') + shadow;
}

/** Variables CSS: el tema claro en :root y el oscuro según el sistema o la elección del usuario (data-theme). */
export function tokensCss(): string {
  const constants =
    `--font-ui:${fonts.ui};--font-mono:${fonts.mono};--font-doc:${fonts.doc};` +
    Object.entries(fontSizes)
      .map(([k, v]) => `--t-${k}:${v}px;`)
      .join('') +
    Object.entries(radii)
      .map(([k, v]) => `--r-${k}:${v}px;`)
      .join('') +
    Object.entries(space)
      .map(([k, v]) => `--s-${k}:${v}px;`)
      .join('') +
    Object.entries(durations)
      .map(([k, v]) => `--dur-${kebab(k)}:${v}ms;`)
      .join('') +
    `--touch:${touchTarget}px;`;
  const darkVars = `${vars(dark, 'dark')}color-scheme:dark;`;
  return (
    `:root{${vars(light, 'light')}${constants}color-scheme:light;}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${darkVars}}}` +
    `:root[data-theme="dark"]{${darkVars}}`
  );
}

export type ThemePreference = 'system' | 'light' | 'dark';

/** Aplica la preferencia de tema del perfil (P-05): "system" deja decidir al sistema operativo. */
export function applyTheme(root: HTMLElement, preference: ThemePreference): void {
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}
