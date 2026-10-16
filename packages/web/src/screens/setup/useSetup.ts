// T038 · P-02 Primer arranque: la lógica (plan §7.3). RF-USR-05, RF-REC-01, F-02. Solo en la PC servidor y mientras
// no haya ninguna Apoderada; en otro caso vuelve al login, que explica lo que pasa.
import { nationalIdDateWarning } from '@impocaribe/shared';
import { setupSchema } from '@impocaribe/shared/validation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { getSetupStatus, postLogin, postSetup } from '../../api/endpoints/auth';
import { useAppSession } from '../../session/SessionProvider';
import { useValidatedForm } from '../../validation/useValidatedForm';

export type SetupStep = 'checking' | 'data' | 'password' | 'codes';
export const SETUP_STEPS = ['Datos de la Apoderada', 'Contraseña', 'Códigos de recuperación'] as const;
const DATA_FIELDS = ['fullName', 'username', 'nationalId', 'phone'] as const;

export function useSetup() {
  const { session, state } = useAppSession();
  const navigate = useNavigate();
  const isServerPc = state.pairing?.isServerPc === true;
  const [step, setStep] = useState<SetupStep>('checking');
  const [codes, setCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Para entrar al terminar sin volver a pedirla; vive solo en memoria mientras dura el asistente.
  const credentials = useRef<{ username: string; password: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void session
      .api()
      .request(getSetupStatus)
      .then(
        (s) => s.configured,
        () => true,
      )
      .then((configured) => {
        if (!alive) return;
        if (configured || !isServerPc) void navigate('/login', { replace: true });
        else setStep('data');
      });
    return () => {
      alive = false;
    };
  }, [session, isServerPc, navigate]);

  // RNF-09: capturas bloqueadas mientras se ven los códigos.
  useEffect(() => {
    if (step !== 'codes') return;
    void session.secureScreen(true);
    return () => void session.secureScreen(false);
  }, [step, session]);

  const form = useValidatedForm({
    schema: setupSchema,
    defaultValues: { fullName: '', username: '', nationalId: '', phone: '', password: '', confirm: '' },
    labels: {
      fullName: 'Nombre y apellidos',
      username: 'Usuario',
      nationalId: 'Carné de identidad',
      phone: 'Teléfono',
      password: 'Contraseña',
      confirm: 'Confirmar',
    },
    warnings: (v) => {
      const nationalId = nationalIdDateWarning(v.nationalId);
      return nationalId ? { nationalId } : {};
    },
    onSubmit: async (values) => {
      try {
        const res = await session.api().request(postSetup, { body: { ...values, confirm: values.password } });
        credentials.current = { username: values.username, password: values.password };
        setCodes(res.recoveryCodes);
        setStep('codes');
      } catch (err) {
        // Un usuario o carné repetido se corrige en el paso 1.
        const fields = err instanceof ApiError ? Object.keys(err.details?.fields ?? {}) : [];
        if (fields.some((f) => (DATA_FIELDS as readonly string[]).includes(f))) setStep('data');
        throw err;
      }
    },
  });

  const next = async () => {
    if (await form.form.trigger([...DATA_FIELDS])) setStep('password');
  };

  const finish = useCallback(async () => {
    if (!credentials.current) return;
    setFinishing(true);
    setNotice(null);
    try {
      const pairing = state.pairing!;
      const res = await session.api().request(postLogin, {
        body: {
          ...credentials.current,
          deviceId: pairing.deviceId,
          deviceLabel: pairing.deviceName,
          platform: session.deviceInfo().platform,
        },
      });
      credentials.current = null;
      await session.signedIn(res);
      void navigate('/', { replace: true });
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setNotice(err.message);
      setFinishing(false);
    }
  }, [session, state.pairing, navigate]);

  return {
    step,
    stepIndex: step === 'password' ? 1 : step === 'codes' ? 2 : 0,
    fullName: form.field('fullName'),
    username: form.field('username'),
    nationalId: form.field('nationalId'),
    phone: form.field('phone'),
    password: form.field('password'),
    confirm: form.field('confirm'),
    summary: form.summary,
    notice: notice ?? form.formError,
    busy: form.form.formState.isSubmitting,
    next: () => void next(),
    back: () => setStep('data'),
    submit: form.submit,
    codes,
    copied,
    setCopied,
    finishing,
    finish: () => void finish(),
  };
}

export type SetupModel = ReturnType<typeof useSetup>;
