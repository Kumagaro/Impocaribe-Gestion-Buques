// T114 · P-26 Versiones de la app (plan §7.3). RF-UPD-01: las versiones publicadas por plataforma, cuál es la mínima
// y sus novedades; una Apoderada publica (el archivo va en multipart) y marca la mínima. Se consulta al servidor.
import {
  APP_PLATFORMS,
  publishReleaseSchema,
  type ReleaseDto,
  type ReleasePlatform,
} from '@impocaribe/shared/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { updatesApi } from '../../api/endpoints/updates';
import { useAppSession } from '../../session/SessionProvider';
import { useSyncStatus } from '../../sync/SyncProvider';
import { useCatalog } from '../catalogs/useCatalog';
import { useAppUpdate } from './AppUpdateProvider';

const KEY = ['releases'] as const;

export interface PublishForm {
  platform: ReleasePlatform;
  version: string;
  notes: string;
  file: File | null;
  /** T117: la firma del instalador de Windows (el .sig que dejó el build junto al .exe). */
  signature: File | null;
}
type FormErrors = Partial<Record<keyof PublishForm, string>>;

export function useReleases() {
  const base = useCatalog();
  const { session, state } = useAppSession();
  const connected = useSyncStatus().online;
  const update = useAppUpdate();
  const queryClient = useQueryClient();
  const app = session.app();
  const list = useQuery({
    queryKey: KEY,
    enabled: connected,
    queryFn: () => base.api().request(updatesApi.list),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });

  const [platform, setPlatform] = useState<ReleasePlatform>(app.platform);
  const [form, setForm] = useState<PublishForm | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState<ReleaseDto | null>(null);

  const all = list.data ?? [];
  const latestOf = (p: ReleasePlatform) => all.find((r) => r.platform === p) ?? null;

  return {
    ...base,
    connected,
    loading: connected && list.isPending,
    failed: list.isError,
    retry: () => void refresh(),
    /** ui-spec P-26: publicar y marcar la mínima, solo una Apoderada. */
    canPublish: state.session?.user.role === 'apoderada',
    /** «Esta PC: 1.3.0 · al día». */
    thisDevice: {
      label: app.platform === 'windows' ? 'Esta PC' : 'Este dispositivo',
      version: app.version,
      newer: update?.available ? update.latest : null,
    },
    platform,
    setPlatform,
    releases: all.filter((r) => r.platform === platform),
    isApp: (APP_PLATFORMS as readonly string[]).includes(platform),
    latestOf,

    // Publicar (RF-UPD-01).
    form,
    errors,
    formError,
    uploading,
    openPublish: () => {
      setErrors({});
      setFormError(null);
      setForm({ platform, version: '', notes: '', file: null, signature: null });
    },
    closePublish: () => !uploading && setForm(null),
    setField: <K extends keyof PublishForm>(key: K, value: PublishForm[K]) => {
      setForm((f) => f && { ...f, [key]: value });
      setErrors((e) => ({ ...e, [key]: undefined }));
    },
    publish: async () => {
      if (!form) return;
      const signature = form.platform === 'windows' && form.signature ? (await form.signature.text()).trim() : '';
      const parsed = publishReleaseSchema.safeParse({ ...form, signature });
      const next: FormErrors = {};
      if (!parsed.success) for (const i of parsed.error.issues) next[i.path[0] as keyof PublishForm] ??= i.message;
      if (!form.file) next.file = 'Elija el archivo del instalador.';
      setErrors(next);
      if (!parsed.success || !form.file) return;
      const body = new FormData();
      body.append('platform', parsed.data.platform);
      body.append('version', parsed.data.version);
      body.append('notes', parsed.data.notes);
      if (parsed.data.signature) body.append('signature', parsed.data.signature);
      body.append('file', form.file, form.file.name);
      setUploading(true);
      setFormError(null);
      try {
        const r = await base.api().request(updatesApi.publish, { body: body as never });
        setForm(null);
        setPlatform(r.platform);
        await refresh();
        base.setNotice({ tone: 'info', text: `Se publicó la ${r.version}. Los dispositivos verán el aviso.` });
      } catch (e) {
        const fields = (e instanceof ApiError ? e.details?.fields : undefined) as FormErrors | undefined;
        if (fields && Object.keys(fields).length > 0) setErrors(fields);
        else
          setFormError(e instanceof ApiError ? e.message : 'No se pudo conectar con el servidor. Inténtelo de nuevo.');
      } finally {
        setUploading(false);
      }
    },

    // Marcar la mínima (RF-UPD-01, 04).
    confirming,
    askMin: (r: ReleaseDto) => setConfirming(r),
    cancelMin: () => setConfirming(null),
    markMin: () =>
      void base.act('minima', async () => {
        const r = confirming!;
        await base.api().request(updatesApi.minSupported, { params: { id: r.id } });
        setConfirming(null);
        await refresh();
        base.setNotice({ tone: 'info', text: `La ${r.version} es ahora la versión mínima.` });
      }),
  };
}

export type ReleasesModel = ReturnType<typeof useReleases>;
