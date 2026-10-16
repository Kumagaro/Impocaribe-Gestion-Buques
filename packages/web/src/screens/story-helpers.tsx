// Ayudas de las historias de pantallas: los campos y modelos fijos que darían los hooks, sin servidor.
import type { ComponentType } from 'react';
import { MemoryRouter } from 'react-router';
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

/** La presentación de la clase elegida en la barra de Storybook, con el modelo dado. */
export function inDevice<M>(views: Record<'phone' | 'tablet' | 'desktop', ComponentType<{ model: M }>>, model: M) {
  function Story() {
    const View = views[useDeviceClass()];
    return (
      <MemoryRouter>
        <View model={model} />
      </MemoryRouter>
    );
  }
  return Story;
}
