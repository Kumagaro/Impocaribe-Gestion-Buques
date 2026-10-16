import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bell, FileText, Home, Plus, Ship } from 'lucide-react';
import { useState } from 'react';
import { Badge, ListCard } from './presentation';
import { DataTable, NavBar, NavRail, Sidebar, SplitView, Stepper, Tabs, type Column, type NavItem } from './structure';

// T023: estructura y navegación de cada clase de dispositivo (ui-spec §1.1).
const meta: Meta = { title: 'Componentes/Estructura' };
export default meta;

function TabsDemo() {
  const [tab, setTab] = useState('ordenes');
  return (
    <Tabs
      label="Detalle del buque"
      value={tab}
      onChange={setTab}
      tabs={[
        { id: 'ordenes', label: 'Órdenes', content: '41 órdenes emitidas.' },
        { id: 'dms', label: 'DM', content: '12 DM.' },
        { id: 'bitacora', label: 'Bitácora', content: 'Registro de cambios.' },
      ]}
    />
  );
}

export const Pestanas: StoryObj = { name: 'Pestañas', render: () => <TabsDemo /> };

export const Pasos: StoryObj = {
  render: () => <Stepper steps={['Cliente', 'Chofer', 'Carga', 'Revisión']} current={2} />,
};

export const VistaDividida: StoryObj = {
  name: 'Vista dividida',
  render: () => (
    <div style={{ display: 'flex', height: 320, border: '1px solid var(--line)' }}>
      <SplitView
        listLabel="DM del buque"
        list={
          <>
            <ListCard title="DM 00431" aside={<Badge tone="ok">Activa</Badge>} selected onOpen={() => undefined} />
            <ListCard title="DM 00432" aside={<Badge tone="warn">Por vencer</Badge>} onOpen={() => undefined} />
          </>
        }
        detailLabel="DM 00431"
        detail="Detalle de la DM 00431."
      />
    </div>
  ),
};

interface Order {
  id: string;
  number: string;
  driver: string;
  tons: number;
}
const COLUMNS: Column<Order>[] = [
  { key: 'number', header: 'Orden', sortable: true, cell: (o) => o.number, sortValue: (o) => o.number },
  { key: 'driver', header: 'Chofer', sortable: true, cell: (o) => o.driver, sortValue: (o) => o.driver },
  {
    key: 'tons',
    header: 'Toneladas',
    align: 'end',
    sortable: true,
    cell: (o) => o.tons.toFixed(3).replace('.', ','),
    sortValue: (o) => o.tons,
  },
];
const orders = (n: number): Order[] =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i),
    number: `EAGLE1-2026-V1-${String(i + 1).padStart(4, '0')}`,
    driver: `CHOFER ${String((i % 65) + 1).padStart(2, '0')}`,
    tons: 15 + ((i * 37) % 300) / 100,
  }));

export const Tabla: StoryObj = {
  render: () => <DataTable caption="Órdenes" columns={COLUMNS} rows={orders(12)} onRowClick={() => undefined} />,
};
export const TablaVirtualizada: StoryObj = {
  name: 'Tabla virtualizada (más de 100 filas)',
  render: () => <DataTable caption="Órdenes" columns={COLUMNS} rows={orders(2000)} />,
};
export const TablaVacia: StoryObj = {
  name: 'Tabla vacía',
  render: () => <DataTable caption="Órdenes" columns={COLUMNS} rows={[]} empty="No hay órdenes en este buque." />,
};

const NAV: NavItem[] = [
  { id: 'inicio', label: 'Inicio', icon: <Home />, shortcut: 'Ctrl+1', group: 'Operación' },
  { id: 'buques', label: 'Buques', icon: <Ship />, shortcut: 'Ctrl+2', group: 'Operación' },
  { id: 'ordenes', label: 'Órdenes', icon: <FileText />, shortcut: 'Ctrl+3', group: 'Operación' },
  { id: 'alertas', label: 'Alertas', icon: <Bell />, badge: 3, shortcut: 'Ctrl+4', group: 'Avisos' },
];
const primary = { label: 'Nueva orden', icon: <Plus />, onClick: () => undefined };

function NavDemo({ kind }: { kind: 'bar' | 'rail' | 'side' }) {
  const [current, setCurrent] = useState('buques');
  if (kind === 'bar') return <NavBar items={NAV} current={current} onNavigate={setCurrent} primary={primary} />;
  if (kind === 'rail')
    return (
      <div style={{ height: 420, display: 'flex' }}>
        <NavRail items={NAV} current={current} onNavigate={setCurrent} primary={primary} />
      </div>
    );
  return (
    <div style={{ height: 420, display: 'flex' }}>
      <Sidebar items={NAV} current={current} onNavigate={setCurrent} footer="Ilén Fernández · Apoderada" />
    </div>
  );
}

export const BarraInferior: StoryObj = { name: 'Barra inferior (teléfono)', render: () => <NavDemo kind="bar" /> };
export const SinNuevaOrden: StoryObj = {
  name: 'Barra inferior, Solo lectura',
  render: () => <NavBar items={NAV} current="inicio" onNavigate={() => undefined} />,
};
export const Riel: StoryObj = { name: 'Riel (tablet)', render: () => <NavDemo kind="rail" /> };
export const MenuLateral: StoryObj = { name: 'Menú lateral (escritorio)', render: () => <NavDemo kind="side" /> };
