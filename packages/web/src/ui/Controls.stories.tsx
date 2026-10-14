import type { Meta, StoryObj } from '@storybook/react-vite';
import { Search, Send } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button, Checkbox, Combobox, DateField, IconButton, Select, Switch, TextField, TonsInput } from './controls';

// T023: controles base en todos sus estados. Tema, clase de dispositivo y movimiento se cambian en la barra superior.
const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'grid', gap: 6 }}>
    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)' }}>
      {label}
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>{children}</div>
  </div>
);

const meta: Meta = { title: 'Componentes/Controles' };
export default meta;

export const Botones: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 18 }}>
      <Row label="Variantes">
        <Button icon={<Send size={16} aria-hidden="true" />}>Emitir orden</Button>
        <Button variant="secondary">Guardar borrador</Button>
        <Button variant="ghost">Cancelar</Button>
        <Button variant="danger">Anular</Button>
      </Row>
      <Row label="En curso (MOV-07)">
        <Button busy busyLabel="Emitiendo…">
          Emitir orden
        </Button>
      </Row>
      <Row label="Desactivado con motivo (EST-03)">
        <Button disabledReason="Requiere conexión con el servidor">Emitir orden</Button>
      </Row>
      <Row label="Solo icono">
        <IconButton label="Buscar" icon={<Search size={20} aria-hidden="true" />} />
      </Row>
    </div>
  ),
};

function SelectionDemo() {
  const [keep, setKeep] = useState(true);
  const [reduce, setReduce] = useState(false);
  const [net, setNet] = useState('router');
  const [client, setClient] = useState<string | null>('c2');
  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 420 }}>
      <Checkbox label="Mantener sesión (30 días)" checked={keep} onChange={setKeep} />
      <Checkbox label="Desactivada" checked={false} onChange={() => undefined} disabled />
      <Switch label="Reducir animaciones" checked={reduce} onChange={setReduce} />
      <Select
        aria-label="Montaje de red"
        value={net}
        onValueChange={setNet}
        options={[
          { value: 'router', label: 'Router wifi' },
          { value: 'hotspot', label: 'Hotspot de un celular' },
        ]}
      />
      <Combobox
        label="Cliente"
        value={client}
        onChange={setClient}
        placeholder="Buscar cliente"
        options={[
          { value: 'c1', label: 'NUEVOS TIEMPOS S.R.L.' },
          { value: 'c2', label: 'FUSION S.R.L.' },
          { value: 'c3', label: 'PARTICULAR A' },
          { value: 'c4', label: 'Ilén Fernández' },
        ]}
      />
    </div>
  );
}

export const Seleccion: StoryObj = { name: 'Selección', render: () => <SelectionDemo /> };

function FieldsDemo() {
  const [plate, setPlate] = useState('W011612');
  const [id, setId] = useState('84011912345');
  const [tons, setTons] = useState('17,280');
  const [date, setDate] = useState('2026-10-14');
  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 420 }}>
      <TextField aria-label="Chapa" uppercase value={plate} onValueChange={setPlate} />
      <TextField aria-label="Carné" digitsOnly value={id} onValueChange={setId} />
      <TextField aria-label="Carné inválido" invalid value="840119" onValueChange={() => undefined} />
      <TextField aria-label="Bloqueado" disabled value="EAGLE1-2026-V1-0042" onValueChange={() => undefined} />
      <TonsInput aria-label="Toneladas" value={tons} onValueChange={setTons} />
      <DateField aria-label="Fecha de carga" value={date} min="2026-10-14" max="2026-10-21" onValueChange={setDate} />
    </div>
  );
}

export const Campos: StoryObj = { render: () => <FieldsDemo /> };
