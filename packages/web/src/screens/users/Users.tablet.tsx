// T040 · P-21 en tablet: tarjetas; alta y edición en un diálogo (ui-spec P-21 y maqueta T037).
import { UsersCards } from './UsersCards';
import type { UsersModel } from './useUsers';

export function UsersTablet({ model }: { model: UsersModel }) {
  return <UsersCards model={model} overlay="dialog" />;
}
