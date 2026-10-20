import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import pkg from '../package.json';
import { createBrowserPlatform } from './platform/browser-platform';
import { findPlatform } from './platform/platform';
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

installTokens();

// La clase se decide una vez: en Android el ancho mínimo no cambia al girar (RF-UI-02).
const deviceClass = deviceClassFor(findPlatform()?.deviceInfo() ?? null, location.search);

// La plataforma nativa del cascarón; sin ella, la del navegador de desarrollo y de las pruebas.
const session = new AppSession(findPlatform() ?? createBrowserPlatform(location, pkg.version), pkg.version);
void session.load();
document.documentElement.dataset.deviceClass = deviceClass;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DeviceClassProvider value={deviceClass}>
      <App session={session} />
    </DeviceClassProvider>
  </StrictMode>,
);
