import type { Decorator, Preview } from '@storybook/react-vite';
import '../src/ui/base.css';
import '../src/ui/ui.css';
import '../src/app/app.css';
import '../src/screens/auth/auth.css';
import '../src/screens/profile/profile.css';
import '../src/screens/users/users.css';
import '../src/screens/diagnostics/diagnostics.css';
import { MotionProvider } from '../src/motion/MotionProvider';
import { DeviceClassProvider } from '../src/ui/device';
import { installTokens } from '../src/ui/theme';
import { applyTheme, type ThemePreference } from '../src/ui/tokens';

installTokens();

// Anchos de referencia de cada clase de dispositivo (ui-spec §1.1, RF-UI-02).
const DEVICE_WIDTH = { phone: 375, tablet: 1024, desktop: 1280 } as const;
type DeviceClass = keyof typeof DEVICE_WIDTH;

const withThemeAndDevice: Decorator = (Story, context) => {
  const theme = context.globals.theme as ThemePreference;
  const device = context.globals.deviceClass as DeviceClass;
  applyTheme(document.documentElement, theme);
  return (
    <div data-device-class={device} style={{ width: DEVICE_WIDTH[device], maxWidth: '100%', margin: '0 auto' }}>
      <DeviceClassProvider value={device}>
        <MotionProvider reduceMotion={context.globals.reduceMotion === 'on'}>
          <Story />
        </MotionProvider>
      </DeviceClassProvider>
    </div>
  );
};

const preview: Preview = {
  decorators: [withThemeAndDevice],
  globalTypes: {
    theme: {
      description: 'Tema',
      toolbar: {
        title: 'Tema',
        icon: 'contrast',
        items: [
          { value: 'system', title: 'Del sistema' },
          { value: 'light', title: 'Claro' },
          { value: 'dark', title: 'Oscuro' },
        ],
        dynamicTitle: true,
      },
    },
    deviceClass: {
      description: 'Clase de dispositivo',
      toolbar: {
        title: 'Dispositivo',
        icon: 'mobile',
        items: [
          { value: 'phone', title: 'Teléfono' },
          { value: 'tablet', title: 'Tablet' },
          { value: 'desktop', title: 'Escritorio' },
        ],
        dynamicTitle: true,
      },
    },
    reduceMotion: {
      description: 'Reducir animaciones (RF-UI-06)',
      toolbar: {
        title: 'Movimiento',
        icon: 'lightning',
        items: [
          { value: 'off', title: 'Con animaciones' },
          { value: 'on', title: 'Reducir animaciones' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light', deviceClass: 'desktop', reduceMotion: 'off' },
  parameters: { layout: 'padded' },
};
export default preview;
