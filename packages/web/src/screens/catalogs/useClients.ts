// T059 · P-19 Clientes: la lógica (plan §7.3). RF-CAT-01, 07, 08 y 11, F-11. Se lee de la copia local; el mismo
// nombre al normalizar bloquea y uno parecido solo avisa (ADV-05). Los destinatarios se añaden o se desactivan: nunca
// se borran (RF-CAT-07).
import { findSimilar } from '@impocaribe/shared';
import { editClientSchema, type ClientDto } from '@impocaribe/shared/validation';
import { useId, useState } from 'react';
import { useFieldArray, type Path } from 'react-hook-form';
import type { z } from 'zod';
import { clientsApi } from '../../api/endpoints/catalogs';
import { useRecentlyChanged } from '../../sync/SyncProvider';
import type { FieldState } from '../../ui/form';
import { useValidatedForm, type FieldControl } from '../../validation/useValidatedForm';
import { byText, useCatalog, useLocal } from './useCatalog';

export type ClientsPanel = { kind: 'new' } | { kind: 'edit'; client: ClientDto } | null;
type Input = z.input<typeof editClientSchema>;

/** «2 (1 inactivo)» */
export function recipientsText(c: ClientDto): string {
  const off = c.recipients.filter((r) => !r.active).length;
  return off ? `${c.recipients.length} (${off} ${off === 1 ? 'inactivo' : 'inactivos'})` : String(c.recipients.length);
}

export function useClients() {
  const base = useCatalog();
  const clients = useLocal<ClientDto>(
    'client',
    byText((c) => c.name),
  );
  const changed = useRecentlyChanged('client');
  const [panel, setPanel] = useState<ClientsPanel>(null);
  const [confirm, setConfirm] = useState<ClientDto | null>(null);
  const ids = useId();

  const selfId = panel?.kind === 'edit' ? panel.client.id : undefined;
  const form = useValidatedForm({
    schema: editClientSchema,
    defaultValues: { name: '', recipients: [], expectedVersion: 0 },
    labels: { name: 'Nombre', recipients: 'Destinatarios', expectedVersion: 'Versión' },
    warnings: (v) => {
      const { similar } = findSimilar(String(v.name), clients, selfId);
      return similar[0] ? { name: `Hay un cliente parecido: ${similar[0].name}` } : {};
    },
    onSubmit: async ({ name, recipients, expectedVersion }) => {
      if (panel?.kind === 'edit')
        await base.api().request(clientsApi.edit, {
          params: { id: panel.client.id },
          body: { name, recipients, expectedVersion },
        });
      else
        await base.api().request(clientsApi.create, {
          body: { name, recipients: recipients.map((r) => ({ name: r.name, address: r.address })) },
        });
      setPanel(null);
      await base.done(panel?.kind === 'edit' ? `Se guardaron los cambios de ${name}.` : `Se creó el cliente ${name}.`);
    },
  });
  // keyName: el `id` de cada destinatario es el suyo (el de la base), no el de la lista del formulario.
  const list = useFieldArray({ control: form.form.control, name: 'recipients', keyName: 'key' });
  const { errors, isSubmitted } = form.form.formState;

  /** Un campo de un destinatario, con el mismo contrato que `form.field` (RF-VAL-02). */
  const recipientField = (i: number, key: 'name' | 'address'): { state: FieldState; control: FieldControl } => {
    const path = `recipients.${i}.${key}` as Path<Input>;
    const id = `${ids}-r${i}-${key}`;
    const { isTouched } = form.form.getFieldState(path, form.form.formState);
    const error = errors.recipients?.[i]?.[key]?.message;
    const value = String(form.form.watch(path) ?? '');
    const reg = form.form.register(path);
    return {
      state: { id, error, valid: (isTouched || isSubmitted) && !error && value !== '' },
      control: {
        id,
        name: path,
        value,
        invalid: error !== undefined,
        'aria-describedby': `${id}-msg`,
        ref: reg.ref,
        onBlur: reg.onBlur,
        onValueChange: (v) =>
          form.form.setValue(path, v as never, { shouldDirty: true, shouldValidate: isTouched || isSubmitted }),
      },
    };
  };

  const same = findSimilar(String(form.form.watch('name') ?? ''), clients, selfId).same;
  const fill = (client: ClientDto | null) =>
    form.reset(
      client
        ? { name: client.name, recipients: client.recipients, expectedVersion: client.rowVersion }
        : { name: '', recipients: [{ name: '', address: '' }], expectedVersion: 0 },
    );

  return {
    ...base,
    clients,
    changed,
    panel,
    close: () => setPanel(null),
    openNew: () => {
      base.setNotice(null);
      fill(null);
      setPanel({ kind: 'new' });
    },
    openEdit: (client: ClientDto) => {
      base.setNotice(null);
      fill(client);
      setPanel({ kind: 'edit', client });
    },
    nameField: form.field('name'),
    sameReason: same ? `Ya existe el cliente «${same.name}»: es el mismo nombre escrito de otra forma.` : undefined,
    recipients: list.fields.map((f, i) => ({
      key: f.key,
      /** Los que ya existen tienen id: se desactivan, no se quitan. */
      saved: Boolean((f as { id?: string }).id),
      active: (form.form.watch(`recipients.${i}.active`) as boolean | undefined) ?? true,
      name: recipientField(i, 'name'),
      address: recipientField(i, 'address'),
    })),
    recipientsError: errors.recipients?.message ?? errors.recipients?.root?.message,
    addRecipient: () => list.append({ name: '', address: '' }),
    removeRecipient: (i: number) => list.remove(i),
    toggleRecipient: (i: number, active: boolean) =>
      form.form.setValue(`recipients.${i}.active`, active, { shouldDirty: true }),
    formError: form.formError,
    summary: form.summary,
    saving: form.form.formState.isSubmitting,
    submit: form.submit,
    dirty: form.dirty,

    confirm,
    askDeactivate: (client: ClientDto) => setConfirm(client),
    cancelDeactivate: () => setConfirm(null),
    deactivate: (client: ClientDto) =>
      void base.act(`desactivar-${client.id}`, async () => {
        await base.api().request(clientsApi.deactivate, { params: { id: client.id } });
        setConfirm(null);
        setPanel(null);
        await base.done(`${client.name} quedó inactivo: ya no se podrá elegir en DM nuevas.`);
      }),
    activate: (client: ClientDto) =>
      void base.act(`activar-${client.id}`, async () => {
        await base.api().request(clientsApi.activate, { params: { id: client.id } });
        setPanel(null);
        await base.done(`${client.name} quedó activo.`);
      }),
  };
}

export type ClientsModel = ReturnType<typeof useClients>;
