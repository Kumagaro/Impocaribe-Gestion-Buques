import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './controls';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  ListCard,
  LockedNotice,
  OfflineBanner,
  PageHeader,
  ProgressBar,
  Skeleton,
  StatCard,
  ToastProvider,
  useToast,
} from './presentation';

// T023: piezas de presentación y estados obligatorios (ui-spec §2).
const meta: Meta = { title: 'Componentes/Presentación' };
export default meta;

export const Insignias: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge tone="ok">Emitida</Badge>
      <Badge tone="info">Borrador</Badge>
      <Badge tone="warn">Por vencer</Badge>
      <Badge tone="bad">Rechazada</Badge>
      <Badge tone="mute">Anulada</Badge>
    </div>
  ),
};

export const CifrasYAvance: StoryObj = {
  name: 'Cifras y avance',
  render: () => (
    <div style={{ display: 'grid', gap: 14, maxWidth: 640 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <StatCard label="Total del buque" value="2 700,500 t" />
        <StatCard label="Cargado" value="700,460 t" note="41 órdenes emitidas" />
        <StatCard label="Saldo" value="2 000,040 t" />
      </div>
      <ProgressBar label="Avance del buque" value={25.9} />
      <ProgressBar label="DM casi agotada" value={92} tone="warn" />
      <ProgressBar label="DM completa" value={100} tone="ok" />
    </div>
  ),
};

export const Tarjetas: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 10, maxWidth: 380 }}>
      <PageHeader title="Buque EAGLE 1" subtitle="Viaje 1 · 2026" actions={<Button>Nueva orden</Button>} />
      <Card title="Resumen">Contenido de una tarjeta.</Card>
      <ListCard title="DM 00431" aside={<Badge tone="ok">Activa</Badge>} onOpen={() => undefined}>
        NUEVOS TIEMPOS S.R.L. · saldo 30,500 t · 12/30
      </ListCard>
      <ListCard title="DM 00432" aside={<Badge tone="warn">Por vencer</Badge>} selected onOpen={() => undefined}>
        FUSION S.R.L. · saldo 4,120 t · 28/30
      </ListCard>
    </div>
  ),
};

export const Estados: StoryObj = {
  name: 'Estados (EST-01 a EST-06)',
  render: () => (
    <div style={{ display: 'grid', gap: 18, maxWidth: 520 }}>
      <Skeleton lines={4} />
      <EmptyState
        title="No hay órdenes todavía"
        description="Las órdenes emitidas de este buque aparecen aquí."
        actionLabel="Nueva orden"
        onAction={() => undefined}
      />
      <OfflineBanner online={false} asOf="14/10/2026 16:40" pendingDrafts={2} />
      <ErrorState
        message="No se pudo cargar el buque. Compruebe la conexión con el servidor."
        onRetry={() => undefined}
      />
      <LockedNotice by="Ilén Fernández" since="16:40" />
      <LockedNotice by="Ilén Fernández" since="16:40" onRelease={() => undefined} />
    </div>
  ),
};

function ToastDemo() {
  const toast = useToast();
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button onClick={() => toast.show({ tone: 'success', text: 'Orden EAGLE1-2026-V1-0042 emitida' })}>Éxito</Button>
      <Button
        variant="danger"
        onClick={() => toast.show({ tone: 'error', text: 'Las toneladas superan el saldo de la DM' })}
      >
        Error
      </Button>
    </div>
  );
}

export const Avisos: StoryObj = {
  render: () => (
    <ToastProvider>
      <ToastDemo />
    </ToastProvider>
  ),
};
