// T025 · Elige la presentación de la estructura según la clase de dispositivo (plan §7.3).
import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { useDeviceClass } from '../ui/device';
import { ToastProvider } from '../ui/presentation';
import type { ThemePreference } from '../ui/tokens';
import { AppShellDesktop } from './AppShell.desktop';
import { AppShellPhone } from './AppShell.phone';
import { AppShellTablet } from './AppShell.tablet';
import type { ShellStatus } from './ShellParts';
import { useAppShell, type ShellUser } from './useAppShell';

export type { ShellStatus } from './ShellParts';

const VIEWS = { phone: AppShellPhone, tablet: AppShellTablet, desktop: AppShellDesktop };

export function AppShell({
  user,
  status,
  isServerPc = false,
  theme,
  onThemeChange,
  alertsPanel,
}: {
  user: ShellUser;
  status: ShellStatus;
  isServerPc?: boolean;
  theme?: ThemePreference;
  onThemeChange?: (theme: ThemePreference) => void;
  /** ESC (P-17): el panel lateral de alertas que abre la campana; sin él, la campana lleva a /alertas. */
  alertsPanel?: (onClose: () => void) => ReactNode;
}) {
  const model = useAppShell({
    user,
    alerts: status.alerts,
    isServerPc,
    ...(theme ? { theme } : {}),
    ...(onThemeChange ? { onThemeChange } : {}),
  });
  const device = useDeviceClass();
  const View = VIEWS[device];
  return (
    <ToastProvider>
      {device === 'desktop' ? (
        <AppShellDesktop model={model} status={status} {...(alertsPanel ? { alertsPanel } : {})}>
          <Outlet />
        </AppShellDesktop>
      ) : (
        <View model={model} status={status}>
          <Outlet />
        </View>
      )}
    </ToastProvider>
  );
}
