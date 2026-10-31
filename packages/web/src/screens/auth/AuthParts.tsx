// T038 · Piezas comunes de las pantallas de acceso (P-01 a P-04), de las maquetas aprobadas en T037: pantalla completa
// en teléfono y tarjeta centrada en tablet y escritorio, con la marca de la app.
import type { ReactNode } from 'react';
import { AppLogo } from '../../ui/logo';

export function Brand() {
  return (
    <div className="auth-brand">
      <AppLogo />
      <div>
        <b>Órdenes de Carga</b>
        <span>IMPOCARIBE</span>
      </div>
    </div>
  );
}

/** Teléfono: pantalla completa con la marca arriba. Tablet y escritorio: tarjeta centrada. */
export function AuthFrame({
  layout,
  wide = false,
  children,
}: {
  layout: 'fullscreen' | 'card';
  /** Tarjeta ancha para los asistentes con los pasos a la izquierda (P-02). */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main className={`auth auth--${layout}`} data-layout={layout}>
      {layout === 'fullscreen' ? (
        <div className="auth__page">
          <div className="auth__top">
            <Brand />
          </div>
          <div className="auth__body">{children}</div>
        </div>
      ) : (
        <div className={wide ? 'auth__card auth__card--wide' : 'auth__card'}>
          <Brand />
          {children}
        </div>
      )}
    </main>
  );
}
