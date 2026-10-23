// T104 · P-25 Bitácora (plan §7.3). RF-BIT-02, 03: la consulta al servidor (no se copia al dispositivo), con los
// filtros de F-17 y por páginas; cada registro se despliega con lo que cambió.
import { AUDIT_GROUPS, auditActionLabel, type AuditGroup } from '@impocaribe/shared';
import { auditFilterSchema, type AuditEntryDto, type UserDirectoryEntry } from '@impocaribe/shared/validation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { auditApi } from '../../api/endpoints/consultas';
import { useAppSession } from '../../session/SessionProvider';
import { useOnline, useSyncStatus } from '../../sync/SyncProvider';
import { byText, useLocal } from '../catalogs/useCatalog';

export interface AuditFilters {
  userId: string;
  from: string;
  to: string;
  group: string;
  ref: string;
}
const EMPTY: AuditFilters = { userId: '', from: '', to: '', group: '', ref: '' };
const TYPING_MS = 300;

const FIELD: Record<string, string> = {
  tons: 'Toneladas',
  totalTons: 'Total',
  allocatedTons: 'Asignado',
  versionNo: 'Versión',
  status: 'Estado',
  reason: 'Motivo',
  brand: 'Marca',
  name: 'Nombre',
  fullName: 'Nombre',
  role: 'Rol',
  active: 'Activo',
  plate: 'Chapa',
  capacityTons: 'Capacidad',
  arrivalDate: 'Arribo',
  loadingDate: 'Fecha de carga',
  number: 'Número',
  closedSessions: 'Sesiones cerradas',
};
/** Lo que cambia en cada escritura y no dice nada a quien lee la bitácora. */
const NOISE = new Set(['rowVersion', 'updatedAt', 'createdAt', 'id']);

const show = (v: unknown): string =>
  v === null || v === undefined
    ? '—'
    : typeof v === 'boolean'
      ? v
        ? 'Sí'
        : 'No'
      : typeof v === 'object'
        ? JSON.stringify(v)
        : String(v);

/** Los campos que cambiaron, en palabras: «Toneladas: 17.280 → 18.000». Sin «antes», lo registrado. */
export function changesOf(before: unknown, after: unknown): { field: string; before: string; after: string }[] {
  const b = before && typeof before === 'object' ? (before as Record<string, unknown>) : {};
  const a = after && typeof after === 'object' ? (after as Record<string, unknown>) : {};
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter((k) => !NOISE.has(k) && JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((k) => ({ field: FIELD[k] ?? k, before: k in b ? show(b[k]) : '—', after: k in a ? show(a[k]) : '—' }));
}

/** La línea de detalle de la tabla: el motivo, el rechazo o cuántos campos cambiaron. */
export function detailOf(e: AuditEntryDto): string {
  if (!e.ok) return (e.after as { message?: string } | null)?.message ?? 'Rechazada';
  if (e.reason) return `Motivo: ${e.reason}`;
  const n = changesOf(e.before, e.after).length;
  return n === 0 ? '' : n === 1 ? '1 dato' : `${n} datos`;
}

export function useAudit() {
  const { session } = useAppSession();
  const online = useOnline();
  // Solo se pregunta al servidor cuando se sabe que responde (hasta la primera sincronización no se sabe).
  const connected = useSyncStatus().online;
  const users = useLocal<UserDirectoryEntry>(
    'user_directory',
    byText((u) => u.fullName),
  );
  const [filters, setFilters] = useState<AuditFilters>(EMPTY);
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState<number | null>(null);

  // La DM u orden se busca al dejar de escribir.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => ({ ...f, ref: typed })), TYPING_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const parsed = auditFilterSchema.safeParse(filters);
  const errors = parsed.success
    ? {}
    : Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
  const query = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')) as Record<string, string>;

  const pages = useInfiniteQuery({
    queryKey: ['audit', query],
    enabled: connected && parsed.success,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) =>
      session.api().request(auditApi.list, {
        query: pageParam === null ? query : { ...query, before: String(pageParam) },
      }),
    getNextPageParam: (last) => last.next,
  });

  return {
    online,
    filters,
    typed,
    set: (key: keyof AuditFilters, value: string) =>
      key === 'ref' ? setTyped(value) : setFilters((f) => ({ ...f, [key]: value })),
    clear: () => {
      setTyped('');
      setFilters(EMPTY);
    },
    errors: errors as Partial<Record<keyof AuditFilters, string>>,
    userOptions: [{ value: '', label: 'Todos' }, ...users.map((u) => ({ value: u.id, label: u.fullName }))],
    groupOptions: [
      { value: '', label: 'Todas' },
      ...(Object.entries(AUDIT_GROUPS) as [AuditGroup, string][]).map(([value, label]) => ({ value, label })),
    ],
    loading: pages.isPending && parsed.success,
    failed: pages.isError,
    retry: () => void pages.refetch(),
    entries: pages.data?.pages.flatMap((p) => p.entries) ?? [],
    more: pages.hasNextPage,
    loadingMore: pages.isFetchingNextPage,
    loadMore: () => void pages.fetchNextPage(),
    label: (e: AuditEntryDto) => auditActionLabel(e.action),
    detail: detailOf,
    changes: (e: AuditEntryDto) => changesOf(e.before, e.after),
    open,
    toggle: (id: number) => setOpen((o) => (o === id ? null : id)),
  };
}

export type AuditModel = ReturnType<typeof useAudit>;
