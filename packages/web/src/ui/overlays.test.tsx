import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderUi } from '../../test/render';
import { ConfirmDialog, Dialog, Modal, OverrideDialog, ReasonDialog, Sheet } from './overlays';

// T023 · plan §7.2, ui-spec §1.3 (diálogos estándar) y §6 F-15, MOV-04: foco atrapado, Esc, hoja con arrastre.

function Opener({ children }: { children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      {open && children(() => setOpen(false))}
    </>
  );
}

describe('Dialog', () => {
  function renderDialog() {
    renderUi(
      <Opener>
        {(close) => (
          <Dialog title="Anular orden" onClose={close} footer={<button>Confirmar</button>}>
            <input aria-label="Motivo" />
          </Dialog>
        )}
      </Opener>,
    );
  }

  it('es modal, lleva su título como nombre y pone el foco dentro', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog', { name: 'Anular orden' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('Tab y Mayús+Tab no salen del diálogo', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog');
    for (let i = 0; i < 5; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 5; i++) {
      await userEvent.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('Esc lo cierra y el foco vuelve al botón que lo abrió', async () => {
    renderDialog();
    const opener = screen.getByRole('button', { name: 'Abrir' });
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('MOV-04: entra con escala y fundido; con movimiento reducido, solo fundido', () => {
    const { unmount } = renderUi(<Dialog title="t" onClose={() => undefined} />);
    expect(screen.getByRole('dialog').getAttribute('data-motion')).toBe('scale');
    unmount();
    renderUi(<Dialog title="t" onClose={() => undefined} />, { reduceMotion: true });
    expect(screen.getByRole('dialog').getAttribute('data-motion')).toBe('fade');
  });
});

describe('Sheet (MOV-04 en teléfono)', () => {
  function drag(target: HTMLElement, dy: number) {
    fireEvent.pointerDown(target, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(target, { pointerId: 1, clientY: 100 + dy });
    fireEvent.pointerUp(target, { pointerId: 1, clientY: 100 + dy });
  }

  it('se cierra al arrastrar hacia abajo más del umbral', () => {
    const onClose = vi.fn();
    renderUi(<Sheet title="Más" onClose={onClose} />, { device: 'phone' });
    drag(screen.getByText('Más'), 81);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('por debajo del umbral vuelve a su sitio sin cerrarse', () => {
    const onClose = vi.fn();
    renderUi(<Sheet title="Más" onClose={onClose} />, { device: 'phone' });
    drag(screen.getByText('Más'), 80);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('sheet-drag').style.transform).toBe('translateY(0px)');
  });

  it('arrastrar hacia arriba no la mueve', () => {
    const onClose = vi.fn();
    renderUi(<Sheet title="Más" onClose={onClose} />, { device: 'phone' });
    const title = screen.getByText('Más');
    fireEvent.pointerDown(title, { pointerId: 1, clientY: 300 });
    fireEvent.pointerMove(title, { pointerId: 1, clientY: 100 });
    expect(screen.getByTestId('sheet-drag').style.transform).toBe('translateY(0px)');
  });

  it('también se cierra con Esc', async () => {
    const onClose = vi.fn();
    renderUi(<Sheet title="Más" onClose={onClose} />, { device: 'phone' });
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Modal', () => {
  it.each([
    ['phone', 'sheet'],
    ['tablet', 'dialog'],
    ['desktop', 'dialog'],
  ] as const)('en %s se presenta como %s', (device, kind) => {
    renderUi(<Modal title="Filtros" onClose={() => undefined} />, { device });
    expect(screen.getByRole('dialog').getAttribute('data-kind')).toBe(kind);
  });
});

describe('ReasonDialog (F-15)', () => {
  it('cuenta los caracteres y no confirma con menos de 10', async () => {
    const onConfirm = vi.fn();
    renderUi(
      <ReasonDialog title="Anular orden" confirmLabel="Anular" onConfirm={onConfirm} onClose={() => undefined} />,
    );
    const reason = screen.getByRole('textbox', { name: 'Motivo' });
    await userEvent.type(reason, 'Error chap');
    expect(screen.getByText('10/500')).not.toBeNull();
    await userEvent.clear(reason);
    await userEvent.type(reason, '  Error ch  ');
    await userEvent.click(screen.getByRole('button', { name: 'Anular' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('El motivo debe tener al menos 10 caracteres (tiene 8).')).not.toBeNull();
    expect(reason.getAttribute('aria-invalid')).toBe('true');
  });

  it('con un motivo válido confirma con el texto sin espacios en los extremos', async () => {
    const onConfirm = vi.fn();
    renderUi(
      <ReasonDialog title="Anular orden" confirmLabel="Anular" onConfirm={onConfirm} onClose={() => undefined} />,
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Motivo' }), '  Chapa equivocada  ');
    await userEvent.click(screen.getByRole('button', { name: 'Anular' }));
    expect(onConfirm).toHaveBeenCalledWith('Chapa equivocada');
  });

  it('no deja escribir más de 500 caracteres', () => {
    renderUi(<ReasonDialog title="t" confirmLabel="Anular" onConfirm={() => undefined} onClose={() => undefined} />);
    expect(screen.getByRole('textbox', { name: 'Motivo' }).getAttribute('maxlength')).toBe('500');
  });
});

describe('OverrideDialog (F-15, excepción)', () => {
  it('explica la regla con sus números y no confirma con menos de 10 caracteres de motivo', async () => {
    const onConfirm = vi.fn();
    renderUi(
      <OverrideDialog
        title="Exceder el saldo de la DM"
        rule="La orden pide 32,000 t y a la DM 00431 le quedan 30,500 t."
        confirmLabel="Emitir con excepción"
        onConfirm={onConfirm}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByRole('dialog').textContent).toContain(
      'La orden pide 32,000 t y a la DM 00431 le quedan 30,500 t.',
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Motivo' }), '123456789');
    await userEvent.click(screen.getByRole('button', { name: 'Emitir con excepción' }));
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Motivo' }), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Emitir con excepción' }));
    expect(onConfirm).toHaveBeenCalledWith('1234567890');
  });
});

describe('ConfirmDialog (F-15, confirmación destructiva)', () => {
  it('solo confirma al escribir la palabra exacta en mayúsculas', async () => {
    const onConfirm = vi.fn();
    renderUi(
      <ConfirmDialog
        title="Restaurar copia"
        description="Se reemplazan todos los datos del servidor."
        word="RESTAURAR"
        confirmLabel="Restaurar"
        onConfirm={onConfirm}
        onClose={() => undefined}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Escriba RESTAURAR para confirmar' });
    await userEvent.type(input, 'restaurar');
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Escriba exactamente RESTAURAR, en mayúsculas.')).not.toBeNull();
    await userEvent.clear(input);
    await userEvent.type(input, 'RESTAURAR');
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Cancelar cierra sin confirmar', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    renderUi(
      <ConfirmDialog title="t" word="RESTAURAR" confirmLabel="Restaurar" onConfirm={onConfirm} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect([onClose.mock.calls.length, onConfirm.mock.calls.length]).toEqual([1, 0]);
  });
});
