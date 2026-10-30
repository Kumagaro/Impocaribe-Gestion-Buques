import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../../test/screen';
import { BatteryBand } from './BatteryBand';

// R-01 y RF-ALR-01: en Android, si la app no está excluida del ahorro de batería, la app lo avisa y deja pedirlo.
describe('aviso del ahorro de batería (Android)', () => {
  it('sin la exclusión lo avisa; «Permitir» abre el permiso; al volver con la exclusión, desaparece', async () => {
    let excluded = false;
    const request = vi.fn(async () => undefined);
    await renderScreen(<BatteryBand />, {
      batteryExclusion: { excluded: async () => excluded, request },
    });
    expect(
      await screen.findByText(/Las alertas pueden no llegar con la app cerrada: Android ahorra batería/),
    ).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Permitir' }));
    expect(request).toHaveBeenCalledTimes(1);
    excluded = true;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('con la exclusión, o fuera de Android, no dice nada', async () => {
    await renderScreen(<BatteryBand />, { batteryExclusion: { excluded: async () => true, request: vi.fn() } });
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
