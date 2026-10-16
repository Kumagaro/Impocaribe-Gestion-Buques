// T025 · ui-spec §1.1 y §4: secciones de la app, por grupo, con el permiso que piden y su atajo de escritorio.
import { can, type Action, type Role } from '@impocaribe/shared';
import {
  Bell,
  Building,
  Building2,
  Container,
  DatabaseBackup,
  FilePen,
  FilePlus2,
  Files,
  FileStack,
  LayoutDashboard,
  Network,
  PackageCheck,
  ScrollText,
  Server,
  Settings,
  Ship,
  Truck,
  UserCog,
  type LucideIcon,
} from 'lucide-react';

export type Group = 'Operación' | 'Catálogos' | 'Administración' | 'Sistema';

export interface Section {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  group: Group;
  /** Permiso que hace falta para verla; sin él, la sección no aparece (EST-05). */
  action?: Action;
  /** Estado del servidor: solo en la PC servidor (P-29). */
  serverPcOnly?: boolean;
  shortcut?: string;
}

export const NEW_ORDER_ID = 'nueva';

export const SECTIONS: Section[] = [
  { id: 'tablero', label: 'Tablero', path: '/', icon: LayoutDashboard, group: 'Operación', shortcut: 'G T' },
  { id: 'buques', label: 'Buques', path: '/buques', icon: Ship, group: 'Operación', shortcut: 'G B' },
  { id: 'dm', label: 'DM', path: '/dm', icon: FileStack, group: 'Operación', shortcut: 'G D' },
  {
    id: NEW_ORDER_ID,
    label: 'Nueva orden',
    path: '/ordenes/nueva',
    icon: FilePlus2,
    group: 'Operación',
    action: 'orders.issue',
    shortcut: 'N',
  },
  { id: 'ordenes', label: 'Órdenes', path: '/ordenes', icon: Files, group: 'Operación' },
  {
    id: 'borradores',
    label: 'Borradores',
    path: '/borradores',
    icon: FilePen,
    group: 'Operación',
    action: 'drafts.edit',
  },
  { id: 'alertas', label: 'Alertas', path: '/alertas', icon: Bell, group: 'Operación' },
  {
    id: 'choferes',
    label: 'Choferes y camiones',
    path: '/catalogos/choferes-camiones',
    icon: Truck,
    group: 'Catálogos',
  },
  { id: 'clientes', label: 'Clientes', path: '/catalogos/clientes', icon: Building2, group: 'Catálogos' },
  {
    id: 'transportistas',
    label: 'Transportistas',
    path: '/catalogos/transportistas',
    icon: Container,
    group: 'Catálogos',
  },
  {
    id: 'usuarios',
    label: 'Usuarios',
    path: '/usuarios',
    icon: UserCog,
    group: 'Administración',
    action: 'users.manage',
  },
  {
    id: 'empresa',
    label: 'Empresa',
    path: '/empresa',
    icon: Building,
    group: 'Administración',
    action: 'company.officialMarks',
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    path: '/configuracion',
    icon: Settings,
    group: 'Administración',
    action: 'settings.manage',
  },
  {
    id: 'respaldos',
    label: 'Respaldos',
    path: '/respaldos',
    icon: DatabaseBackup,
    group: 'Administración',
    action: 'backups.manage',
  },
  { id: 'bitacora', label: 'Bitácora', path: '/bitacora', icon: ScrollText, group: 'Administración' },
  { id: 'versiones', label: 'Versiones de la app', path: '/versiones', icon: PackageCheck, group: 'Administración' },
  { id: 'diagnostico', label: 'Diagnóstico de red', path: '/diagnostico', icon: Network, group: 'Sistema' },
  {
    id: 'servidor',
    label: 'Estado del servidor',
    path: '/servidor',
    icon: Server,
    group: 'Sistema',
    serverPcOnly: true,
  },
];

/** Secciones que ve un rol en este equipo, en el orden del menú. */
export function visibleSections(role: Role, isServerPc: boolean): Section[] {
  return SECTIONS.filter((s) => (!s.action || can(role, s.action)) && (!s.serverPcOnly || isServerPc));
}

/** Sección de la ruta actual: la de ruta más larga que la contiene ("/" solo para la raíz exacta). */
export function sectionForPath(sections: Section[], pathname: string): Section | undefined {
  return sections
    .filter((s) => (s.path === '/' ? pathname === '/' : pathname === s.path || pathname.startsWith(`${s.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

/** Teléfono: Tablero, DM, Alertas y Más en la barra; "Más" empieza por Órdenes (ui-spec §1.1). */
export const PHONE_BAR = ['tablero', 'dm', 'alertas'];
export function phoneMore(sections: Section[]): Section[] {
  const rest = sections.filter((s) => !PHONE_BAR.includes(s.id) && s.id !== NEW_ORDER_ID);
  return [...rest.filter((s) => s.id === 'ordenes'), ...rest.filter((s) => s.id !== 'ordenes')];
}
