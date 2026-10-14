// Preparación de las pruebas de componente.
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom no trae matchMedia: por defecto el sistema no pide reducir el movimiento (cada prueba puede cambiarlo).
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Cada prueba empieza con el documento vacío.
afterEach(() => {
  cleanup();
});
