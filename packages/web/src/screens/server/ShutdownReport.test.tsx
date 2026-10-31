import { serverStatusSchema } from '@impocaribe/shared/validation';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen, TEST_PAIRING } from '../../../test/screen';
import { localApi } from '../../api/endpoints/local';
import { ShutdownReport } from './ShutdownReport';

// T133 · RF-INS-09 y P-31: en la PC servidor la parte nativa sabe cuántos dispositivos hay conectados (el motivo que
// muestra Windows al apagar); en otra PC, que no es la servidor.
describe('aviso al apagar: lo que sabe la parte nativa', () => {
  it('en la PC servidor, el número de dispositivos conectados ahora', async () => {
    const reportServerPc = vi.fn(async () => undefined);
    const status = sampleOf(serverStatusSchema, {
      serverId: TEST_PAIRING.serverId,
      startedAt: '2026-10-14T12:00:00.000Z',
    });
    status.devices = [true, true, false, true].map((connected, i) => ({
      ...status.devices[0]!,
      id: `d${i}`,
      connected,
    }));
    await renderScreen(<ShutdownReport />, {
      pairing: { ...TEST_PAIRING, isServerPc: true },
      reportServerPc,
      before: (s) => s.respond(localApi.status, status),
    });
    await waitFor(() => expect(reportServerPc).toHaveBeenCalledWith(3));
  });

  it('en otra PC dice que no es la servidor y no pregunta nada', async () => {
    const reportServerPc = vi.fn(async () => undefined);
    const t = await renderScreen(<ShutdownReport />, { pairing: TEST_PAIRING, reportServerPc });
    await waitFor(() => expect(reportServerPc).toHaveBeenCalledWith(null));
    expect(t.server.calls).toEqual([]);
  });
});
