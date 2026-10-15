import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MotionProvider } from './motion/MotionProvider';
import { findPlatform } from './platform/platform';
import './ui/base.css';
import { deviceClassFor, DeviceClassProvider } from './ui/device';
import { installTokens } from './ui/theme';
import './ui/ui.css';
import './app/app.css';
import './screens/auth/auth.css';

installTokens();

// La clase se decide una vez: en Android el ancho mínimo no cambia al girar (RF-UI-02).
const deviceClass = deviceClassFor(findPlatform()?.deviceInfo() ?? null, location.search);
document.documentElement.dataset.deviceClass = deviceClass;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DeviceClassProvider value={deviceClass}>
      {/* shortcut: "Reducir animaciones" del perfil (P-05) llega con F1; hasta entonces manda el sistema. */}
      <MotionProvider reduceMotion={false}>
        <App />
      </MotionProvider>
    </DeviceClassProvider>
  </StrictMode>,
);
