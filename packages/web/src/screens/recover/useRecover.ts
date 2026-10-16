// T038 · P-04 Recuperar contraseña: la lógica (plan §7.3). F-04, RF-REC-02 a 04. El servidor nunca dice qué dato
// falló; la pantalla muestra su mensaje tal cual y, si bloquea la recuperación, ya no deja intentar.
import { recoverSchema } from '@impocaribe/shared/validation';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { postRecover } from '../../api/endpoints/auth';
import { useAppSession } from '../../session/SessionProvider';
import { useValidatedForm } from '../../validation/useValidatedForm';

export function useRecover() {
  const { session } = useAppSession();
  const [done, setDone] = useState(false);
  const [locked, setLocked] = useState(false);

  const form = useValidatedForm({
    schema: recoverSchema,
    defaultValues: { username: '', nationalId: '', phone: '', code: '', password: '', confirm: '' },
    labels: {
      username: 'Usuario',
      nationalId: 'Carné',
      phone: 'Teléfono',
      code: 'Código de recuperación',
      password: 'Nueva contraseña',
      confirm: 'Confirmar',
    },
    onSubmit: async (values) => {
      try {
        // El contrato valida con el mismo esquema, que exige la confirmación: ya se comprobó que coincide.
        await session.api().request(postRecover, { body: { ...values, confirm: values.password } });
        setDone(true);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'RECOVERY_LOCKED') setLocked(true);
        throw err;
      }
    },
  });

  return {
    done,
    locked,
    notice: form.formError,
    summary: form.summary,
    username: form.field('username'),
    nationalId: form.field('nationalId'),
    phone: form.field('phone'),
    code: form.field('code'),
    password: form.field('password'),
    confirm: form.field('confirm'),
    busy: form.form.formState.isSubmitting,
    submit: form.submit,
  };
}

export type RecoverModel = ReturnType<typeof useRecover>;
