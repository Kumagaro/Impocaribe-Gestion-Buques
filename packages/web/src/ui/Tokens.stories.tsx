import type { Meta, StoryObj } from '@storybook/react-vite';
import { fontSizes, palettes, radii, touchTarget, type PaletteKey } from './tokens';

// T018: los tokens del sistema de diseño, visibles con los selectores de tema y de clase de dispositivo.
function TokensSheet() {
  const keys = Object.keys(palettes.light) as PaletteKey[];
  const cssVar = (k: string) =>
    `var(--${k
      .replace(/([A-Z])/g, '-$1')
      .replace(/(\d)/g, '-$1')
      .toLowerCase()})`;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {keys.map((k) => (
          <div
            key={k}
            style={{
              border: '1px solid var(--line)',
              borderRadius: 6,
              overflow: 'hidden',
              background: 'var(--surface)',
            }}
          >
            <div style={{ height: 44, background: cssVar(k) }} />
            <div style={{ padding: '6px 9px', fontSize: 11, fontFamily: 'var(--font-mono)' }}>{k}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        {Object.entries(fontSizes).map(([k, v]) => (
          <div key={k} style={{ fontSize: v }}>
            {k} · {v}px · 2 700,500 t
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
        Radios {Object.values(radii).join(' / ')} px · objetivo táctil {touchTarget} dp
      </div>
    </div>
  );
}

const meta: Meta<typeof TokensSheet> = { title: 'Sistema de diseño/Tokens', component: TokensSheet };
export default meta;
export const Paleta: StoryObj<typeof TokensSheet> = {};
