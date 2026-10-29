// T038 · P-03 Iniciar sesión: la lógica (plan §7.3). F-03, RF-AUT-01, 02 y 05; P-02 (sistema sin configurar).
import { loginSchema } from '@impocaribe/shared/validation';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { getSetupStatus, postLogin } from '../../api/endpoints/auth';
import { useAppSession } from '../../session/SessionProvider';
import type { FieldState } from '../../ui/form';
import { useValidatedForm } from '../../validation/useValidatedForm';

export type LoginPhase = 'checking' | 'notConfigured' | 'ready';

/** F-03: tras 3 fallos, la contraseña avisa de los intentos que quedan antes del bloqueo de 15 minutos. */
export function attemptsWarning(remaining: number): string {
  return remaining === 1
    ? 'Le queda 1 intento antes del bloqueo de 15 minutos'
    : `Le quedan ${remaining} intentos antes del bloqueo de 15 minutos`;
}

export function useLogin() {
  const { session, state } = useAppSession();
  const navigate = useNavigate();
  const pairing = state.pairing!;
  const [phase, setPhase] = useState<LoginPhase>('checking');
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const check = useCallback(async () => {
    setPhase('checking');
    const status = await session
      .api()
      .request(getSetupStatus)
      .catch(() => ({ configured: true }));
    // P-02: el primer arranque solo se hace en la PC servidor; en otro dispositivo se explica.
    if (!status.configured && pairing.isServerPc) void navigate('/setup', { replace: true });
    else setPhase(status.configured ? 'ready' : 'notConfigured');
  }, [session, pairing.isServerPc, navigate]);

  useEffect(() => {
    void check();
  }, [check]);

  const form = useValidatedForm({
    schema: loginSchema,
    defaultValues: { username: '', password: '', keepSignedIn: false },
    labels: { username: 'Usuario', password: 'Contraseña', keepSignedIn: 'Mantener sesión' },
    onSubmit: async (values) => {
      setNotice(null);
      setWarning(null);
      try {
        const res = await session.api().request(postLogin, {
          body: {
            ...values,
            deviceId: pairing.deviceId,
            deviceLabel: pairing.deviceName,
            platform: session.deviceInfo().platform,
          },
        });
        await session.signedIn(res);
        void navigate(res.user.mustChangePassword ? '/perfil' : '/', { replace: true });
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        setNotice(err.message);
        if (err.code === 'ACCOUNT_LOCKED') setLocked(true);
        const remaining = err.details?.remainingAttempts;
        if (typeof remaining === 'number') setWarning(attemptsWarning(remaining));
      }
    },
  });

  const username = form.field('username');
  const password = form.field('password');
  // F-03: tras 3 fallos, el aviso de los intentos que quedan va en la contraseña.
  const passwordState: FieldState = { ...password.state, warning: password.state.warning ?? warning ?? undefined };
  return {
    phase,
    serverName: pairing.serverName,
    /** T128 · P-29: en la PC servidor, su estado y los emparejamientos también sin sesión. */
    isServerPc: pairing.isServerPc,
    username,
    password: { ...password, state: passwordState },
    keepSignedIn: form.form.watch('keepSignedIn') as boolean,
    setKeepSignedIn: (v: boolean) => form.form.setValue('keepSignedIn', v),
    notice,
    locked,
    busy: form.form.formState.isSubmitting,
    submit: form.submit,
    recheck: () => void check(),
  };
}

export type LoginModel = ReturnType<typeof useLogin>;
