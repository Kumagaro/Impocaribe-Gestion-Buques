import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnimatedIcon, type IconName, type IconState } from './AnimatedIcon';

// T022 · MOV-08: cada icono en el estado con que se usa. Con "Reducir animaciones" en la barra superior quedan estáticos.
const USES: [IconName, IconState, string][] = [
  ['bell', 'ring', 'Llega una alerta'],
  ['sync', 'spin', 'Sincronizando'],
  ['offline', 'pulse', 'Sin conexión'],
  ['lock', 'lock', 'Registro bloqueado'],
  ['check', 'draw', 'Acción terminada'],
  ['bell', 'idle', 'En reposo'],
];

const meta: Meta = { title: 'Movimiento/Iconos animados' };
export default meta;

export const Estados: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
      {USES.map(([name, state, label]) => (
        <div
          key={label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 12,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 9,
          }}
        >
          <AnimatedIcon name={name} state={state} label={label} size={24} />
          <span style={{ fontSize: 13 }}>{label}</span>
        </div>
      ))}
    </div>
  ),
};
