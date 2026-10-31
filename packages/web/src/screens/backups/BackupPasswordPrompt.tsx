// T105 · RF-RES-08 y ui-spec §1.2: tras el login de una Apoderada, si toca confirmar la contraseña de respaldo (cada 90
// días), un diálogo pide escribirla. «Recordármelo mañana» la aplaza un día, hasta 3 veces; después se puede cerrar
// por esta sesión y AL-23 sigue abierta hasta que alguien la confirme.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { backupPasswordApi } from '../../api/endpoints/backups';
import { useAppSession } from '../../session/SessionProvider';
import { useSyncStatus } from '../../sync/SyncProvider';
import { Button, PasswordField } from '../../ui/controls';
import { Field } from '../../ui/form';
import { Dialog } from '../../ui/overlays';

export function BackupPasswordPrompt() {
  const { session, state } = useAppSession();
  const online = useSyncStatus().online;
  const apoderada = state.session?.user.role === 'apoderada';
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['backup-password'],
    enabled: apoderada && online,
    staleTime: Infinity,
    queryFn: () => session.api().request(backupPasswordApi.status),
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState<'confirm' | 'postpone' | null>(null);
  const [closed, setClosed] = useState(false);

  if (!status.data?.due || closed) return null;
  const left = status.data.postponesLeft;
  const run = async (kind: 'confirm' | 'postpone') => {
    setBusy(kind);
    setError(undefined);
    try {
      const next =
        kind === 'confirm'
          ? await session.api().request(backupPasswordApi.confirm, { body: { password } })
          : await session.api().request(backupPasswordApi.postpone);
      queryClient.setQueryData(['backup-password'], next);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? String((e.details?.fields as Record<string, string> | undefined)?.password ?? e.message)
          : 'No se pudo conectar con el servidor. Inténtelo de nuevo.',
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      title="Confirme la contraseña de respaldo"
      description="Hace 90 días que nadie la escribe. Si se olvida, los respaldos no se podrán restaurar."
      onClose={() => setClosed(true)}
      footer={
        <>
          {left > 0 ? (
            <Button variant="ghost" onClick={() => void run('postpone')} busy={busy === 'postpone'}>
              {`Recordármelo mañana (${left === 1 ? 'queda 1 vez' : `quedan ${left} veces`})`}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setClosed(true)}>
              Ahora no
            </Button>
          )}
          <Button
            onClick={() => void run('confirm')}
            busy={busy === 'confirm'}
            busyLabel="Comprobando…"
            disabled={!password}
          >
            Confirmar
          </Button>
        </>
      }
    >
      <Field id="respaldo-confirmar" label="Contraseña de respaldo" error={error}>
        <PasswordField
          id="respaldo-confirmar"
          value={password}
          onValueChange={setPassword}
          invalid={!!error}
          aria-describedby="respaldo-confirmar-msg"
          autoComplete="off"
        />
      </Field>
    </Dialog>
  );
}
