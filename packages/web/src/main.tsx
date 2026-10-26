import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import pkg from '../package.json';
import { createBrowserPlatform } from './platform/browser-platform';
import { capacitorBridge, capacitorPlugin } from './platform/capacitor-bridge';
import { createNativePlatform, nativeBridge } from './platform/native-platform';
import { findPlatform, setPlatform } from './platform/platform';
import { AppSession } from './session/app-session';
import './ui/base.css';
import { deviceClassFor, DeviceClassProvider } from './ui/device';
import { installTokens } from './ui/theme';
import './ui/ui.css';
import './app/app.css';
import './screens/auth/auth.css';
import './screens/profile/profile.css';
import './screens/users/users.css';
import './screens/diagnostics/diagnostics.css';
import './screens/company/company.css';
import './screens/settings/settings.css';
import './screens/catalogs/catalogs.css';
import './screens/orders/orders.css';
import './screens/alerts/alerts.css';
import './screens/audit/audit.css';
import './screens/backups/backups.css';
import './screens/updates/updates.css';
import './screens/dashboard/dashboard.css';
import './screens/search/search.css';

installTokens();

/**
 * La plataforma nativa del cascarón (T115: Electron, por su preload; T118: Android, por el plugin de Capacitor, cuya
 * información del dispositivo es asíncrona); sin ninguna, la del navegador de desarrollo y de las pruebas.
 */
async function nativePlatform() {
  const electron = nativeBridge();
  if (electron) return createNativePlatform(electron);
  const plugin = capacitorPlugin();
  return plugin ? createNativePlatform(await capacitorBridge(plugin)) : null;
}

void nativePlatform().then((native) => {
  if (native) setPlatform(native);
  // La clase se decide una vez: en Android el ancho mínimo no cambia al girar (RF-UI-02).
  const deviceClass = deviceClassFor(findPlatform()?.deviceInfo() ?? null, location.search);
  // T121 · RF-UPD-02 y DT-11: la versión es la de la app instalada (la que se actualiza), no la de esta interfaz.
  const platform = findPlatform() ?? createBrowserPlatform(location, pkg.version);
  const session = new AppSession(platform, platform.deviceInfo().appVersion);
  void session.load();
  document.documentElement.dataset.deviceClass = deviceClass;

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DeviceClassProvider value={deviceClass}>
        <App session={session} />
      </DeviceClassProvider>
    </StrictMode>,
  );
});
