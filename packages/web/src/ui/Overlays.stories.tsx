import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';
import { Button } from './controls';
import { ConfirmDialog, Dialog, Modal, OverrideDialog, ReasonDialog, Sheet } from './overlays';

// T023: superposiciones. Modal es hoja en teléfono y diálogo en tablet y escritorio (cambie la clase en la barra).
const meta: Meta = { title: 'Componentes/Superposiciones' };
export default meta;

function Launcher({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && children(() => setOpen(false))}
    </>
  );
}

export const Dialogo: StoryObj = {
  name: 'Diálogo',
  render: () => (
    <Launcher label="Abrir diálogo">
      {(close) => (
        <Dialog
          title="Otro usuario modificó este registro"
          description="Revise los valores actuales y rehaga sus cambios."
          onClose={close}
          footer={<Button onClick={close}>Entendido</Button>}
        />
      )}
    </Launcher>
  ),
};

export const Hoja: StoryObj = {
  render: () => (
    <Launcher label="Abrir hoja">
      {(close) => (
        <Sheet title="Más" onClose={close}>
          <p style={{ margin: 0 }}>Arrastre hacia abajo más de 80 px para cerrar.</p>
        </Sheet>
      )}
    </Launcher>
  ),
};

export const ModalSegunClase: StoryObj = {
  name: 'Modal según la clase',
  render: () => (
    <Launcher label="Abrir modal">
      {(close) => (
        <Modal title="Filtros" onClose={close} footer={<Button onClick={close}>Aplicar</Button>}>
          <p style={{ margin: 0 }}>Hoja en teléfono; diálogo en tablet y escritorio.</p>
        </Modal>
      )}
    </Launcher>
  ),
};

export const Motivo: StoryObj = {
  render: () => (
    <Launcher label="Anular orden">
      {(close) => (
        <ReasonDialog
          title="Anular orden EAGLE1-2026-V1-0042"
          confirmLabel="Anular"
          onConfirm={close}
          onClose={close}
        />
      )}
    </Launcher>
  ),
};

export const Excepcion: StoryObj = {
  name: 'Excepción',
  render: () => (
    <Launcher label="Exceder saldo">
      {(close) => (
        <OverrideDialog
          title="Exceder el saldo de la DM"
          rule="La orden pide 32,000 t y a la DM 00431 le quedan 30,500 t."
          confirmLabel="Emitir con excepción"
          onConfirm={close}
          onClose={close}
        />
      )}
    </Launcher>
  ),
};

export const ConfirmacionDestructiva: StoryObj = {
  name: 'Confirmación destructiva',
  render: () => (
    <Launcher label="Restaurar copia">
      {(close) => (
        <ConfirmDialog
          title="Restaurar copia"
          description="Se reemplazan todos los datos del servidor por los de la copia."
          word="RESTAURAR"
          confirmLabel="Restaurar"
          onConfirm={close}
          onClose={close}
        />
      )}
    </Launcher>
  ),
};
