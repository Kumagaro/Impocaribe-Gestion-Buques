// Ayudas de las historias de pantallas: los campos y modelos fijos que darían los hooks, sin servidor.
import { useState, type ComponentType } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { useDeviceClass } from '../ui/device';
import type { FieldState } from '../ui/form';
import type { FieldControl } from '../validation/useValidatedForm';

export const noop = () => undefined;
export const asyncNoop = async () => undefined;

/** Un campo como lo da useValidatedForm, con su valor y su mensaje. */
export function field(
  name: string,
  value = '',
  state: Omit<FieldState, 'id'> = {},
): { state: FieldState; control: FieldControl } {
  const id = `historia-${name}`;
  return {
    state: { id, ...state },
    control: {
      id,
      name,
      value,
      invalid: state.error !== undefined,
      'aria-describedby': `${id}-msg`,
      ref: noop,
      onBlur: noop,
      onValueChange: noop,
    },
  };
}

/**
 * La presentación de la clase elegida en la barra de Storybook, con el modelo dado. Con un router de datos, como la app:
 * el aviso de cambios sin guardar (useBlocker) lo necesita.
 */
export function inDevice<M>(views: Record<'phone' | 'tablet' | 'desktop', ComponentType<{ model: M }>>, model: M) {
  function Current() {
    const View = views[useDeviceClass()];
    return <View model={model} />;
  }
  function Story() {
    const [router] = useState(() => createMemoryRouter([{ path: '*', Component: Current }]));
    return <RouterProvider router={router} />;
  }
  return Story;
}
