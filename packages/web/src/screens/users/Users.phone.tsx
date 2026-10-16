// T040 · P-21 en phone: tarjetas; alta y edición en una hoja (ui-spec P-21 y maqueta T037).
import { UsersCards } from './UsersCards';
import type { UsersModel } from './useUsers';

export function UsersPhone({ model }: { model: UsersModel }) {
  return <UsersCards model={model} overlay="sheet" />;
}
