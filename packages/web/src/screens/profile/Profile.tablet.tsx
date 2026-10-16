// T039 · P-05 en tablet: secciones a la izquierda y contenido a la derecha (ui-spec P-05 y maqueta T037).
import { ProfileColumns } from './ProfileColumns';
import type { ProfileModel } from './useProfile';

export function ProfileTablet({ model }: { model: ProfileModel }) {
  return <ProfileColumns model={model} />;
}
