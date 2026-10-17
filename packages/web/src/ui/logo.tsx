// El logo de la app: el barco de Buques en el color principal (aprobado por el responsable, 2026-10-17). La misma
// figura está en public/favicon.svg y en los iconos de Android y Electron (scripts/brand-icons.ts).
import { Ship } from 'lucide-react';

export function AppLogo({ size = 40 }: { size?: number }) {
  return (
    <span className="ui-logo" style={{ width: size, height: size }} aria-hidden="true">
      <Ship size={Math.round(size * 0.6)} />
    </span>
  );
}
