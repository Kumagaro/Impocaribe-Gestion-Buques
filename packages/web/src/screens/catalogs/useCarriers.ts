// T059 · P-20 Transportistas: la lógica (plan §7.3). RF-CAT-02, 07, 08 y 10, F-12. Se lee de la copia local; el
// mismo nombre al normalizar bloquea y uno parecido solo avisa (ADV-05).
import { findSimilar } from '@impocaribe/shared';
import {
  editCarrierSchema,
  type CarrierDto,
  type DriverDto,
  type TrailerDto,
  type TruckDto,
} from '@impocaribe/shared/validation';
import { useState } from 'react';
import { carriersApi } from '../../api/endpoints/catalogs';
import { useRecentlyChanged } from '../../sync/SyncProvider';
import { useValidatedForm } from '../../validation/useValidatedForm';
import { byText, useCatalog, useLocal } from './useCatalog';

export type CarriersPanel = { kind: 'new' } | { kind: 'edit'; carrier: CarrierDto } | null;

/** RF-CAT-10: el aviso antes de desactivar, con lo que deja de poder elegirse. */
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** «1 camión · 2 remolques · 1 chofer» */
export function fleetText(c: { trucks: number; trailers: number; drivers: number }): string {
  return `${n(c.trucks, 'camión', 'camiones')} · ${n(c.trailers, 'remolque', 'remolques')} · ${n(c.drivers, 'chofer', 'choferes')}`;
}

export function deactivateText(c: { trucks: number; trailers: number; drivers: number }): string {
  return (
    `Este transportista tiene ${n(c.trucks, 'camión', 'camiones')}, ${n(c.trailers, 'remolque', 'remolques')} y ` +
    `${n(c.drivers, 'chofer', 'choferes')}. Al desactivarlo, dejarán de poder elegirse en órdenes nuevas.`
  );
}

export function useCarriers() {
  const base = useCatalog();
  const carriers = useLocal<CarrierDto>(
    'carrier',
    byText((c) => c.name),
  );
  const trucks = useLocal<TruckDto>(
    'truck',
    byText((t) => t.plate),
  );
  const trailers = useLocal<TrailerDto>(
    'trailer',
    byText((t) => t.plate),
  );
  const drivers = useLocal<DriverDto>(
    'driver',
    byText((d) => d.fullName),
  );
  const changed = useRecentlyChanged('carrier');
  const [panel, setPanel] = useState<CarriersPanel>(null);
  const [confirm, setConfirm] = useState<CarrierDto | null>(null);

  const counts = (id: string) => ({
    trucks: trucks.filter((t) => t.carrierId === id).length,
    trailers: trailers.filter((t) => t.carrierId === id).length,
    drivers: drivers.filter((d) => d.carrierId === id).length,
  });

  const selfId = panel?.kind === 'edit' ? panel.carrier.id : undefined;
  const form = useValidatedForm({
    schema: editCarrierSchema,
    defaultValues: { name: '', expectedVersion: 0 },
    labels: { name: 'Nombre', expectedVersion: 'Versión' },
    warnings: (v) => {
      const { similar } = findSimilar(String(v.name), carriers, selfId);
      return similar[0] ? { name: `Hay un transportista parecido: ${similar[0].name}` } : {};
    },
    onSubmit: async ({ name, expectedVersion }) => {
      if (panel?.kind === 'edit')
        await base
          .api()
          .request(carriersApi.edit, { params: { id: panel.carrier.id }, body: { name, expectedVersion } });
      else await base.api().request(carriersApi.create, { body: { name } });
      setPanel(null);
      await base.done(
        panel?.kind === 'edit' ? `Se guardaron los cambios de ${name}.` : `Se creó el transportista ${name}.`,
      );
    },
  });

  // RF-CAT-08: el mismo nombre al normalizar no se puede guardar; se dice cuál es.
  const same = findSimilar(String(form.form.watch('name') ?? ''), carriers, selfId).same;

  return {
    ...base,
    carriers,
    changed,
    counts,
    panel,
    close: () => setPanel(null),
    openNew: () => {
      base.setNotice(null);
      form.reset({ name: '', expectedVersion: 0 });
      setPanel({ kind: 'new' });
    },
    openEdit: (carrier: CarrierDto) => {
      base.setNotice(null);
      form.reset({ name: carrier.name, expectedVersion: carrier.rowVersion });
      setPanel({ kind: 'edit', carrier });
    },
    nameField: form.field('name'),
    sameReason: same
      ? `Ya existe el transportista «${same.name}»: es el mismo nombre escrito de otra forma.`
      : undefined,
    formError: form.formError,
    summary: form.summary,
    saving: form.form.formState.isSubmitting,
    submit: form.submit,
    dirty: form.dirty,

    confirm,
    askDeactivate: (carrier: CarrierDto) => setConfirm(carrier),
    cancelDeactivate: () => setConfirm(null),
    deactivate: (carrier: CarrierDto) =>
      void base.act(`desactivar-${carrier.id}`, async () => {
        await base.api().request(carriersApi.deactivate, { params: { id: carrier.id } });
        setConfirm(null);
        setPanel(null);
        await base.done(`${carrier.name} quedó inactivo: sus camiones, remolques y choferes ya no se pueden elegir.`);
      }),
    activate: (carrier: CarrierDto) =>
      void base.act(`activar-${carrier.id}`, async () => {
        await base.api().request(carriersApi.activate, { params: { id: carrier.id } });
        setPanel(null);
        await base.done(`${carrier.name} quedó activo.`);
      }),
  };
}

export type CarriersModel = ReturnType<typeof useCarriers>;
