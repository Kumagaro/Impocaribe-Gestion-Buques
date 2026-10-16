// T025 · Lógica de la estructura de pantalla: secciones del rol, sección actual, título de la ruta, atajos de escritorio
// (ui-spec §1.1) y tema. Las presentaciones AppShell.{phone,tablet,desktop} solo componen lo que esto devuelve.
import type { Role } from '@impocaribe/shared';
import { createElement, useEffect, useState } from 'react';
import { useLocation, useMatches, useNavigate } from 'react-router';
import { useDeviceClass } from '../ui/device';
import type { NavItem } from '../ui/structure';
import { applyTheme, type ThemePreference } from '../ui/tokens';
import { NEW_ORDER_ID, PHONE_BAR, phoneMore, sectionForPath, visibleSections, type Section } from './navigation';

export interface ShellUser {
  name: string;
  role: Role;
}

const ROLE_LABEL: Record<Role, string> = { apoderada: 'Apoderada', operador: 'Operador', lectura: 'Solo lectura' };
const THEME_NEXT: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' };
/** Tiempo para pulsar la segunda tecla de "G y luego T/D/B". */
const SEQUENCE_MS = 1500;
const GO_KEYS: Record<string, string> = { t: '/', d: '/dm', b: '/buques' };

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function useAppShell({
  user,
  alerts,
  isServerPc,
  theme: savedTheme,
  onThemeChange,
}: {
  user: ShellUser;
  alerts: number;
  isServerPc: boolean;
  /** La preferencia de este dispositivo (P-05); sin ella, el tema solo dura lo que la pantalla. */
  theme?: ThemePreference;
  onThemeChange?: (theme: ThemePreference) => void;
}) {
  const device = useDeviceClass();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const matches = useMatches();
  const sections = visibleSections(user.role, isServerPc);
  const newOrder = sections.find((s) => s.id === NEW_ORDER_ID);
  const current = sectionForPath(sections, pathname)?.id ?? '';
  const handle = matches.at(-1)?.handle as { title?: string; subtitle?: string } | undefined;
  const [localTheme, setLocalTheme] = useState<ThemePreference>('system');
  const theme = savedTheme ?? localTheme;

  const toItem = (s: Section): NavItem => ({
    id: s.id,
    label: s.label,
    icon: createElement(s.icon, { 'aria-hidden': true }),
    group: s.group,
    ...(s.shortcut ? { shortcut: s.shortcut } : {}),
    ...(s.id === 'alertas' && alerts > 0 ? { badge: alerts } : {}),
  });
  const go = (id: string) => {
    const s = sections.find((x) => x.id === id);
    if (s) void navigate(s.path);
  };

  useEffect(() => {
    if (device !== 'desktop') return;
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (pendingG && Date.now() - pendingG < SEQUENCE_MS && GO_KEYS[key]) {
        pendingG = 0;
        void navigate(GO_KEYS[key]);
      } else if (key === 'g') {
        pendingG = Date.now();
      } else if (key === 'n' && newOrder) {
        void navigate(newOrder.path);
      } else if (key === '/') {
        e.preventDefault();
        void navigate('/buscar');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [device, navigate, newOrder]);

  return {
    title: handle?.title ?? 'Órdenes de Carga',
    subtitle: handle?.subtitle,
    user: { name: user.name, role: ROLE_LABEL[user.role] },
    current,
    go,
    /** Escritorio: todas las secciones, Nueva orden incluida. */
    items: sections.map(toItem),
    /** Tablet: Nueva orden va destacada arriba del riel. */
    railItems: sections.filter((s) => s.id !== NEW_ORDER_ID).map(toItem),
    phoneBar: sections.filter((s) => PHONE_BAR.includes(s.id)).map(toItem),
    phoneMore: phoneMore(sections).map(toItem),
    newOrder: newOrder ? { label: newOrder.label, onClick: () => go(NEW_ORDER_ID) } : null,
    goSearch: () => void navigate('/buscar'),
    goAlerts: () => void navigate('/alertas'),
    goDiagnostics: () => void navigate('/diagnostico'),
    /** P-05: sesiones, contraseña, códigos y apariencia. */
    goProfile: () => void navigate('/perfil'),
    theme,
    cycleTheme: () => {
      const next = THEME_NEXT[theme];
      applyTheme(document.documentElement, next);
      setLocalTheme(next);
      onThemeChange?.(next);
    },
  };
}

export type AppShellModel = ReturnType<typeof useAppShell>;
