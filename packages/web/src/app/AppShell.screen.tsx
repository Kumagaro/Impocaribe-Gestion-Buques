// T025 · Elige la presentación de la estructura según la clase de dispositivo (plan §7.3).
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
}: {
  user: ShellUser;
  status: ShellStatus;
  isServerPc?: boolean;
  theme?: ThemePreference;
  onThemeChange?: (theme: ThemePreference) => void;
}) {
  const model = useAppShell({
    user,
    alerts: status.alerts,
    isServerPc,
    ...(theme ? { theme } : {}),
    ...(onThemeChange ? { onThemeChange } : {}),
  });
  const View = VIEWS[useDeviceClass()];
  return (
    <ToastProvider>
      <View model={model} status={status}>
        <Outlet />
      </View>
    </ToastProvider>
  );
}
