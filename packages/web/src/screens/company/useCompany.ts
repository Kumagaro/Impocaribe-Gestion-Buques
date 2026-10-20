// T054 · P-22 Empresa: la lógica (plan §7.3). Solo la Apoderada. RF-EMP-01 a 06 y F-05. La firma y el cuño no se
// replican (plan §4.4): se consultan en línea y, mientras se ven, las capturas quedan bloqueadas (RNF-09).
import { havanaDateTime, imageInfo } from '@impocaribe/shared';
import {
  editCompanySchema,
  IMAGE_MAX_BYTES,
  IMAGE_TRANSPARENCY_WARNING,
  imageTooBig,
  signatureSchema,
  stampSchema,
  type CompanyDto,
  type SignatureResponse,
  type StampResponse,
} from '@impocaribe/shared/validation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { getCompany, getSignature, getStamp, patchCompany, putSignature, putStamp } from '../../api/endpoints/company';
import { useAppSession } from '../../session/SessionProvider';
import { OFFLINE_REASON } from '../../sync/SyncGate';
import { useOnline } from '../../sync/SyncProvider';
import { useValidatedForm } from '../../validation/useValidatedForm';

export interface CompanyData {
  company: CompanyDto;
  signature: SignatureResponse;
  stamp: StampResponse;
}
type LoadState = { status: 'loading' } | { status: 'error'; message: string } | ({ status: 'ready' } & CompanyData);
export type CompanyPanel = 'company' | 'signature' | 'stamp' | null;

/** La imagen elegida, con lo que se muestra de ella antes de guardar. */
export interface PickedImage {
  name: string;
  sizeKb: number;
  width: number;
  height: number;
  mime: string;
  transparent: boolean;
}

export interface HistoryEntry {
  id: string;
  text: string;
  when: string;
}

const LOAD_ERROR = 'No se pudo cargar la empresa: la firma y el cuño solo se consultan con conexión al servidor.';

/** RF-EMP-04: qué falta, en una frase. */
export function missingText(signature: boolean, stamp: boolean): string | null {
  const rest = 'no se puede oficializar ni corregir órdenes; anular sí se puede.';
  if (!signature && !stamp) return `Faltan la firma oficial y el cuño oficial. Sin ellos ${rest}`;
  if (!signature) return `Falta la firma oficial. Sin ella ${rest}`;
  if (!stamp) return `Falta el cuño oficial. Sin él ${rest}`;
  return null;
}

/** RF-EMP-05: firma y cuño juntos, del cambio más reciente al más antiguo; la primera de cada uno, "cargada". */
export function historyOf(signature: SignatureResponse, stamp: StampResponse): HistoryEntry[] {
  const sig = signature.history.map((s, i) => ({
    id: s.id,
    at: s.createdAt,
    text: `Firma ${i === signature.history.length - 1 ? 'cargada' : 'reemplazada'} · ${s.representativeName}, ${s.position}`,
    by: s.createdBy,
  }));
  const st = stamp.history.map((s, i) => ({
    id: s.id,
    at: s.createdAt,
    text: `Cuño ${i === stamp.history.length - 1 ? 'cargado' : 'reemplazado'}`,
    by: s.createdBy,
  }));
  return [...sig, ...st]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((e) => ({ id: e.id, text: e.text, when: `${havanaDateTime(new Date(e.at))} · ${e.by}` }));
}

/** Los bytes en base64, por trozos (String.fromCharCode no admite millones de argumentos). */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function useCompany() {
  const { session } = useAppSession();
  const online = useOnline();
  const [data, setData] = useState<LoadState>({ status: 'loading' });
  const [panel, setPanel] = useState<CompanyPanel>(null);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [notice, setNotice] = useState<{ tone: 'info' | 'bad'; text: string } | null>(null);

  // Rellena el formulario con lo que llegó del servidor; se asigna más abajo, cuando el formulario existe.
  const fill = useRef<(company: CompanyDto) => void>(() => undefined);
  const companyDirty = useRef(false);

  /** Con `refill` falso (tras guardar la firma o el cuño), los datos de la empresa a medio escribir se conservan. */
  const load = useCallback(
    async (refill = true) => {
      try {
        const api = session.api();
        const [company, signature, stamp] = await Promise.all([
          api.request(getCompany),
          api.request(getSignature),
          api.request(getStamp),
        ]);
        // Antes de mostrarlos: el formulario nunca se pinta vacío con los datos ya cargados.
        if (refill || !companyDirty.current) fill.current(company);
        setData({ status: 'ready', company, signature, stamp });
      } catch {
        setData({ status: 'error', message: LOAD_ERROR });
      }
    },
    [session],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // RNF-09: la firma y el cuño se ven en toda la pantalla; las capturas quedan bloqueadas hasta salir de ella.
  useEffect(() => {
    void session.secureScreen(true);
    return () => void session.secureScreen(false);
  }, [session]);

  const ready = data.status === 'ready' ? data : null;

  const done = async (text: string, refill = true) => {
    setPanel(null);
    setPicked(null);
    setNotice({ tone: 'info', text });
    await load(refill);
  };

  const company = useValidatedForm({
    schema: editCompanySchema,
    defaultValues: { legalName: '', address: '', expectedVersion: 0 },
    labels: { legalName: 'Razón social', address: 'Dirección', expectedVersion: 'Versión' },
    onSubmit: async (values) => {
      try {
        await session.api().request(patchCompany, { body: values });
      } catch (err) {
        // DT-23: otra Apoderada guardó antes. Lo escrito se conserva sobre la versión actual, para revisarlo y guardar.
        if (err instanceof ApiError && err.code === 'STALE_RECORD') {
          const fresh = await session.api().request(getCompany);
          company.form.setValue('expectedVersion', fresh.rowVersion);
        }
        throw err;
      }
      await done('Se guardaron los datos de la empresa.');
    },
  });
  companyDirty.current = company.dirty;
  fill.current = (c) =>
    company.reset({ legalName: c.legalName ?? '', address: c.address ?? '', expectedVersion: c.rowVersion });

  /** F-05: la imagen no transparente avisa, sin impedir guardar (se supo al elegirla). */
  const transparencyWarning = (image: string) =>
    image && picked && !picked.transparent ? { image: IMAGE_TRANSPARENCY_WARNING } : {};

  const signature = useValidatedForm({
    schema: signatureSchema,
    defaultValues: { image: '', representativeName: '', credentialNo: '', position: '' },
    labels: {
      image: 'Imagen de la firma',
      representativeName: 'Representante',
      credentialNo: 'No. de credencial',
      position: 'Cargo',
    },
    warnings: (v) => transparencyWarning(v.image),
    onSubmit: async (values) => {
      await session.api().request(putSignature, { body: values });
      await done('Se guardó la firma oficial. Las órdenes nuevas la usarán.', false);
    },
  });

  const stamp = useValidatedForm({
    schema: stampSchema,
    defaultValues: { image: '' },
    labels: { image: 'Imagen del cuño' },
    warnings: (v) => transparencyWarning(v.image),
    onSubmit: async (values) => {
      await session.api().request(putStamp, { body: values });
      await done('Se guardó el cuño oficial. Las órdenes nuevas lo usarán.', false);
    },
  });

  /** Lee el archivo elegido y lo deja en el campo, ya marcado: su error o aviso aparece en el momento. */
  const pick = (form: typeof signature | typeof stamp) => async (file: File | null) => {
    if (!file) return;
    // Los bytes se leen una vez; una imagen de más de 2 MB no se codifica: se rechaza por su peso.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = imageInfo(bytes);
    setPicked({
      name: file.name,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
      width: info?.width ?? 0,
      height: info?.height ?? 0,
      mime: info?.mime ?? file.type,
      transparent: info?.transparent ?? true,
    });
    const setImage = form.form.setValue as (name: 'image', value: string, o: object) => void;
    if (bytes.length > IMAGE_MAX_BYTES) {
      setImage('image', '', { shouldDirty: true, shouldTouch: true });
      (form.form.setError as (name: 'image', e: object) => void)('image', {
        type: 'size',
        message: imageTooBig(bytes.length),
      });
      return;
    }
    setImage('image', toBase64(bytes), { shouldDirty: true, shouldTouch: true, shouldValidate: true });
  };

  const current = ready?.signature.current ?? null;
  const currentStamp = ready?.stamp.current ?? null;

  return {
    data,
    reload: () => {
      setData({ status: 'loading' });
      void load();
    },
    notice,
    /** RF-CON-06 y EST-03: sin conexión, las escrituras se desactivan con el motivo. */
    offlineReason: online ? undefined : OFFLINE_REASON,
    missing: ready ? missingText(current !== null, currentStamp !== null) : null,
    history: ready ? historyOf(ready.signature, ready.stamp) : [],
    panel,
    close: () => {
      setPanel(null);
      setPicked(null);
    },
    picked,
    /** RF-VAL-10: avisa al salir con cambios sin guardar. */
    dirty: company.dirty || (panel === 'signature' && signature.dirty) || (panel === 'stamp' && stamp.dirty),

    companyFields: { legalName: company.field('legalName'), address: company.field('address') },
    companySummary: company.summary,
    companyError: company.formError,
    savingCompany: company.form.formState.isSubmitting,
    submitCompany: company.submit,
    openCompany: () => {
      setNotice(null);
      // Lo guardado, no lo que se canceló la vez anterior.
      if (ready) fill.current(ready.company);
      setPanel('company');
    },

    openSignature: () => {
      setNotice(null);
      setPicked(null);
      signature.reset({
        image: '',
        representativeName: current?.representativeName ?? '',
        credentialNo: current?.credentialNo ?? '',
        position: current?.position ?? '',
      });
      setPanel('signature');
    },
    signatureFields: {
      image: signature.field('image'),
      representativeName: signature.field('representativeName'),
      credentialNo: signature.field('credentialNo'),
      position: signature.field('position'),
    },
    signatureSummary: signature.summary,
    signatureError: signature.formError,
    savingSignature: signature.form.formState.isSubmitting,
    submitSignature: signature.submit,
    pickSignature: pick(signature),
    signatureImage: signature.form.watch('image'),

    openStamp: () => {
      setNotice(null);
      setPicked(null);
      stamp.reset({ image: '' });
      setPanel('stamp');
    },
    stampField: stamp.field('image'),
    stampSummary: stamp.summary,
    stampError: stamp.formError,
    savingStamp: stamp.form.formState.isSubmitting,
    submitStamp: stamp.submit,
    pickStamp: pick(stamp),
    stampImage: stamp.form.watch('image'),
  };
}

export type CompanyModel = ReturnType<typeof useCompany>;
