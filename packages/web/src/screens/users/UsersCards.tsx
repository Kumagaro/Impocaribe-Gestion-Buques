// T040 · P-21 en TEL y TAB: tarjetas por usuario; el alta y la edición se abren encima (hoja en TEL, diálogo en TAB).
import { Plus } from 'lucide-react';
import { Button } from '../../ui/controls';
import { Dialog, Sheet } from '../../ui/overlays';
import { ErrorState, ListCard, Skeleton } from '../../ui/presentation';
import {
  EditUserForm,
  lastAccess,
  NewUserForm,
  panelTitle,
  roleLabel,
  StatusBadge,
  UsersDialogs,
  UsersNotice,
} from './UsersParts';
import type { UsersModel } from './useUsers';

export function UsersCards({ model, overlay }: { model: UsersModel; overlay: 'sheet' | 'dialog' }) {
  const { list, panel } = model;
  const title = panelTitle(model);
  const Overlay = overlay === 'sheet' ? Sheet : Dialog;
  return (
    <div className="users">
      <div className="users-toolbar">
        <Button icon={<Plus size={18} aria-hidden="true" />} onClick={model.openNew}>
          Nuevo usuario
        </Button>
      </div>
      <UsersNotice model={model} />
      {list.status === 'loading' && <Skeleton lines={6} />}
      {list.status === 'error' && <ErrorState message={list.message} onRetry={model.reload} />}
      {list.status === 'ready' && (
        <ul className="users-cards" aria-label="Usuarios">
          {list.users.map((u) => (
            <li key={u.id}>
              <ListCard title={u.fullName} aside={<StatusBadge user={u} />} onOpen={() => model.openEdit(u)}>
                <span>
                  {roleLabel(u.role)} · {u.username}
                </span>
                <span>Último acceso {lastAccess(model, u).toLowerCase()}</span>
              </ListCard>
            </li>
          ))}
        </ul>
      )}
      {title && (
        <Overlay title={title} onClose={model.close}>
          {panel?.kind === 'new' && <NewUserForm model={model} />}
          {panel?.kind === 'edit' && <EditUserForm model={model} user={panel.user} />}
        </Overlay>
      )}
      <UsersDialogs model={model} />
    </div>
  );
}
