// Preparación de las pruebas de componente.
import { cleanup, configure } from '@testing-library/react';
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

// El primer render de cada archivo carga en frío la app entera (muchas pantallas): 1 s por defecto no siempre basta.
// findBy termina en cuanto aparece el elemento, así que esperar más solo cuesta cuando algo de verdad falta.
configure({ asyncUtilTimeout: 5_000 });

// Cada prueba empieza con el documento vacío.
afterEach(() => {
  cleanup();
});
