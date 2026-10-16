// T040 · P-21 Usuarios: la lógica (plan §7.3). Solo la Apoderada. RF-USR-01 a 05 (alta, edición, rol, activar y
// desactivar), RF-REC-01 (códigos del nuevo usuario), RF-REC-06 (contraseña temporal), RF-AUT-04 (cambiar el rol cierra
// sus sesiones), RF-AUT-10, F-02. El servidor es quien decide; la pantalla avisa antes de lo que va a rechazar.
import { havanaDate, havanaDateTime, nationalIdDateWarning } from '@impocaribe/shared';
import { editUserSchema, newUserSchema, resetPasswordSchema, type UserListItem } from '@impocaribe/shared/validation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import {
  activateUser,
  deactivateUser,
  getUsers,
  patchUser,
  postUser,
  resetUserPassword,
} from '../../api/endpoints/users';
import { useAppSession } from '../../session/SessionProvider';
import type { FieldState } from '../../ui/form';
import { useValidatedForm } from '../../validation/useValidatedForm';

export const ROLE_OPTIONS = [
  { value: 'apoderada', label: 'Apoderada' },
  { value: 'operador', label: 'Operador' },
  { value: 'lectura', label: 'Solo lectura' },
] as const;
export const roleLabel = (role: UserListItem['role']) => ROLE_OPTIONS.find((r) => r.value === role)!.label;

export const ROLE_CHANGE_WARNING = 'Se cerrarán sus sesiones';
export const LAST_APODERADA_REASON =
  'No se puede desactivar ni cambiar de rol a la última Apoderada activa. Cree o active otra Apoderada antes.';

/** "Hoy 08:12", "Ayer 18:05" o "02/10/2026", en La Habana; "Nunca" si no ha entrado. */
export function lastAccessText(iso: string | null, now: Date): string {
  if (!iso) return 'Nunca';
  const at = new Date(iso);
  const time = havanaDateTime(at).slice(11);
  const day = havanaDate(at);
  if (day === havanaDate(now)) return `Hoy ${time}`;
  if (day === havanaDate(new Date(now.getTime() - 86_400_000))) return `Ayer ${time}`;
  return havanaDateTime(at).slice(0, 10);
}

type ListState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; users: UserListItem[] };
export type UsersPanel =
  | { kind: 'new' }
  | { kind: 'codes'; name: string; codes: string[] }
  | { kind: 'edit'; user: UserListItem }
  | { kind: 'deactivate'; user: UserListItem }
  | { kind: 'reset'; user: UserListItem }
  | null;

const messageOf = (err: unknown) =>
  err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor. Inténtelo de nuevo.';

export function useUsers() {
  const { session } = useAppSession();
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [panel, setPanel] = useState<UsersPanel>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'info' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList({ status: 'ready', users: await session.api().request(getUsers) });
    } catch (err) {
      setList({ status: 'error', message: messageOf(err) });
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  // RNF-09: capturas bloqueadas mientras se ven los códigos del nuevo usuario.
  const showingCodes = panel?.kind === 'codes';
  useEffect(() => {
    if (!showingCodes) return;
    void session.secureScreen(true);
    return () => void session.secureScreen(false);
  }, [showingCodes, session]);

  const users = list.status === 'ready' ? list.users : [];
  const activeApoderadas = users.filter((u) => u.active && u.role === 'apoderada').length;
  /** A la última Apoderada activa no se la puede desactivar ni cambiar de rol (RF-USR-04). */
  const isLastApoderada = (u: UserListItem) => u.active && u.role === 'apoderada' && activeApoderadas === 1;

  const done = async (text: string) => {
    setPanel(null);
    setNotice({ tone: 'info', text });
    await load();
  };

  const create = useValidatedForm({
    schema: newUserSchema,
    defaultValues: {
      fullName: '',
      username: '',
      nationalId: '',
      phone: '',
      role: 'operador',
      password: '',
      confirm: '',
    },
    labels: {
      fullName: 'Nombre y apellidos',
      username: 'Usuario',
      nationalId: 'Carné de identidad',
      phone: 'Teléfono',
      role: 'Rol',
      password: 'Contraseña',
      confirm: 'Confirmar',
    },
    warnings: (v) => {
      const nationalId = nationalIdDateWarning(v.nationalId);
      return nationalId ? { nationalId } : {};
    },
    onSubmit: async (values) => {
      const res = await session.api().request(postUser, { body: { ...values, confirm: values.password } });
      create.form.reset();
      setCopied(false);
      setPanel({ kind: 'codes', name: res.user.fullName, codes: res.recoveryCodes });
      await load();
    },
  });

  const edited = panel?.kind === 'edit' ? panel.user : null;
  const edit = useValidatedForm({
    schema: editUserSchema,
    defaultValues: { fullName: '', username: '', nationalId: '', phone: '', role: 'operador', expectedVersion: 0 },
    labels: {
      fullName: 'Nombre y apellidos',
      username: 'Usuario',
      nationalId: 'Carné de identidad',
      phone: 'Teléfono',
      role: 'Rol',
      expectedVersion: 'Versión',
    },
    warnings: (v) => {
      const nationalId = nationalIdDateWarning(v.nationalId);
      return nationalId ? { nationalId } : {};
    },
    onSubmit: async (values) => {
      await session.api().request(patchUser, { params: { id: edited!.id }, body: values });
      await done(`Se guardaron los cambios de ${values.fullName}.`);
    },
  });

  const reset = useValidatedForm({
    schema: resetPasswordSchema,
    defaultValues: { password: '', confirm: '' },
    labels: { password: 'Contraseña temporal', confirm: 'Confirmar' },
    onSubmit: async (values) => {
      const user = panel?.kind === 'reset' ? panel.user : null;
      await session
        .api()
        .request(resetUserPassword, { params: { id: user!.id }, body: { ...values, confirm: values.password } });
      reset.form.reset();
      await done(`${user!.fullName} deberá cambiar la contraseña temporal al entrar. Sus sesiones se cerraron.`);
    },
  });

  // F-02 y RF-AUT-04: cambiar el rol cierra sus sesiones; se avisa en cuanto se elige otro, sin esperar a salir del campo.
  const editRole = edit.field('role');
  const roleChanged = edited !== null && edit.form.watch('role') !== edited.role;
  const editRoleState: FieldState = { ...editRole.state, warning: roleChanged ? ROLE_CHANGE_WARNING : undefined };

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setPanel(null);
      setNotice({ tone: 'bad', text: messageOf(err) });
    } finally {
      setBusy(null);
    }
  };

  return {
    list,
    reload: () => void load(),
    now: session.now(),
    notice,
    busy,
    panel,
    isLastApoderada,
    close: () => setPanel(null),

    openNew: () => {
      setNotice(null);
      create.form.reset();
      setPanel({ kind: 'new' });
    },
    newFields: {
      fullName: create.field('fullName'),
      username: create.field('username'),
      nationalId: create.field('nationalId'),
      phone: create.field('phone'),
      role: create.field('role'),
      password: create.field('password'),
      confirm: create.field('confirm'),
    },
    newSummary: create.summary,
    newError: create.formError,
    creating: create.form.formState.isSubmitting,
    submitNew: create.submit,

    copied,
    setCopied,

    openEdit: (user: UserListItem) => {
      setNotice(null);
      edit.form.reset({
        fullName: user.fullName,
        username: user.username,
        nationalId: user.nationalId,
        phone: user.phone,
        role: user.role,
        expectedVersion: user.rowVersion,
      });
      setPanel({ kind: 'edit', user });
    },
    editFields: {
      fullName: edit.field('fullName'),
      username: edit.field('username'),
      nationalId: edit.field('nationalId'),
      phone: edit.field('phone'),
      role: { ...editRole, state: editRoleState },
    },
    editSummary: edit.summary,
    editError: edit.formError,
    saving: edit.form.formState.isSubmitting,
    submitEdit: edit.submit,

    askDeactivate: (user: UserListItem) => setPanel({ kind: 'deactivate', user }),
    deactivate: (user: UserListItem) =>
      void act(`desactivar-${user.id}`, async () => {
        await session.api().request(deactivateUser, { params: { id: user.id } });
        await done(`${user.fullName} quedó inactivo y sus sesiones se cerraron.`);
      }),
    activate: (user: UserListItem) =>
      void act(`activar-${user.id}`, async () => {
        await session.api().request(activateUser, { params: { id: user.id } });
        await done(`${user.fullName} quedó activo.`);
      }),

    openReset: (user: UserListItem) => {
      reset.form.reset();
      setPanel({ kind: 'reset', user });
    },
    resetFields: { password: reset.field('password'), confirm: reset.field('confirm') },
    resetError: reset.formError,
    resetting: reset.form.formState.isSubmitting,
    submitReset: reset.submit,
  };
}

export type UsersModel = ReturnType<typeof useUsers>;
