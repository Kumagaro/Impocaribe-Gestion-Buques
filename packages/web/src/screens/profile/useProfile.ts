// T039 · P-05 Perfil: la lógica (plan §7.3). RF-AUT-07 (sesiones), RF-REC-03 (códigos), RF-UI-06 (tema y "Reducir
// animaciones" de este dispositivo), F-04 (cambio de contraseña). Quien debe cambiar la contraseña (RF-REC-06) solo ve
// esa sección.
import { changePasswordSchema, type SessionDto } from '@impocaribe/shared/validation';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError } from '../../api/client';
import {
  deleteOtherSessions,
  deleteSession,
  getSessions,
  postChangePassword,
  postLogout,
  postRecoveryCodes,
} from '../../api/endpoints/auth';
import type { DevicePreferences } from '../../session/app-session';
import { useAppSession } from '../../session/SessionProvider';
import { useValidatedForm } from '../../validation/useValidatedForm';

export const PROFILE_SECTIONS = [
  { id: 'datos', label: 'Datos' },
  { id: 'sesiones', label: 'Sesiones abiertas' },
  { id: 'contrasena', label: 'Contraseña' },
  { id: 'codigos', label: 'Códigos de recuperación' },
  { id: 'apariencia', label: 'Apariencia' },
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number]['id'];

const ROLE_LABEL = { apoderada: 'Apoderada', operador: 'Operador', lectura: 'Solo lectura' } as const;

type SessionsState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; list: SessionDto[] };

const messageOf = (err: unknown) =>
  err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor. Inténtelo de nuevo.';

export function useProfile() {
  const { session, state } = useAppSession();
  const navigate = useNavigate();
  const params = useParams();
  const stored = state.session!;
  const user = stored.user;
  const mustChange = user.mustChangePassword;
  const requested = PROFILE_SECTIONS.find((s) => s.id === params.seccion)?.id ?? null;
  // RF-REC-06: con la contraseña temporal, solo se puede cambiar la contraseña.
  const section: ProfileSection | null = mustChange ? 'contrasena' : requested;

  const [sessions, setSessions] = useState<SessionsState>({ status: 'loading' });
  const [notice, setNotice] = useState<{ tone: 'info' | 'bad'; text: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setSessions({ status: 'ready', list: await session.api().request(getSessions) });
    } catch (err) {
      setSessions({ status: 'error', message: messageOf(err) });
    }
  }, [session]);

  useEffect(() => {
    if (!mustChange) void loadSessions();
  }, [loadSessions, mustChange]);

  // RNF-09: capturas bloqueadas mientras se ven los códigos nuevos.
  useEffect(() => {
    if (!codes) return;
    void session.secureScreen(true);
    return () => void session.secureScreen(false);
  }, [codes, session]);

  /** Una acción con el servidor: marca el botón ocupado y muestra el resultado. */
  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setNotice({ tone: 'bad', text: messageOf(err) });
    } finally {
      setBusy(null);
    }
  };

  const password = useValidatedForm({
    schema: changePasswordSchema,
    defaultValues: { current: '', password: '', confirm: '' },
    labels: { current: 'Contraseña actual', password: 'Nueva contraseña', confirm: 'Confirmar' },
    onSubmit: async (values) => {
      setNotice(null);
      await session.api().request(postChangePassword, { body: { ...values, confirm: values.password } });
      password.form.reset();
      // El servidor ya no exige el cambio y cerró las demás sesiones (RF-AUT-07).
      if (mustChange) await session.signedIn({ ...stored, user: { ...user, mustChangePassword: false } });
      setNotice({ tone: 'info', text: 'Contraseña cambiada. Las demás sesiones se cerraron.' });
      void loadSessions();
    },
  });

  const setPreference = (change: Partial<DevicePreferences>) => void session.setPreferences(change);

  return {
    section,
    mustChange,
    open: (id: ProfileSection) => void navigate(`/perfil/${id}`),
    back: () => void navigate('/perfil'),
    user: { name: user.fullName, username: user.username, role: ROLE_LABEL[user.role], phone: user.phone },
    notice,
    busy,

    sessions,
    sessionCount: sessions.status === 'ready' ? sessions.list.length : null,
    reloadSessions: () => void loadSessions(),
    closeSession: (id: string) =>
      void act(`cerrar-${id}`, async () => {
        await session.api().request(deleteSession, { params: { id } });
        await loadSessions();
      }),
    closeOthers: () =>
      void act('cerrar-demas', async () => {
        await session.api().request(deleteOtherSessions);
        await loadSessions();
      }),

    current: password.field('current'),
    password: password.field('password'),
    confirm: password.field('confirm'),
    passwordSummary: password.summary,
    passwordError: password.formError,
    changingPassword: password.form.formState.isSubmitting,
    submitPassword: password.submit,

    codes,
    copied,
    setCopied,
    confirmRegenerate,
    askRegenerate: () => setConfirmRegenerate(true),
    cancelRegenerate: () => setConfirmRegenerate(false),
    regenerate: () =>
      void act('codigos', async () => {
        setConfirmRegenerate(false);
        const res = await session.api().request(postRecoveryCodes);
        setCopied(false);
        setCodes(res.recoveryCodes);
      }),
    closeCodes: () => setCodes(null),

    theme: state.preferences.theme,
    setTheme: (theme: DevicePreferences['theme']) => setPreference({ theme }),
    reduceMotion: state.preferences.reduceMotion,
    setReduceMotion: (reduceMotion: boolean) => setPreference({ reduceMotion }),

    signOut: () =>
      void act('salir', async () => {
        // RF-AUT-08: aunque el servidor no responda, la credencial se borra de este dispositivo.
        await session
          .api()
          .request(postLogout)
          .catch(() => undefined);
        await session.signOut();
      }),
  };
}

export type ProfileModel = ReturnType<typeof useProfile>;
