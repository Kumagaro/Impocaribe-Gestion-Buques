// T040 · P-21 en desktop: tabla y edición en un panel al lado (ui-spec P-21 y maqueta T037).
import { Plus } from 'lucide-react';
import { Button } from '../../ui/controls';
import { ErrorState, Skeleton } from '../../ui/presentation';
import { DataTable, type Column } from '../../ui/structure';
import {
  EditUserForm,
  lastAccess,
  NewUserForm,
  panelTitle,
  roleLabel,
  StatusBadge,
  UsersDialogs,
  UsersNotice,
  blocked,
} from './UsersParts';
import type { UsersModel } from './useUsers';

type UserRow = Extract<UsersModel['list'], { status: 'ready' }>['users'][number];

export function UsersDesktop({ model }: { model: UsersModel }) {
  const { list, panel } = model;
  const title = panelTitle(model);
  const columns: Column<UserRow>[] = [
    { key: 'nombre', header: 'Nombre', cell: (u) => u.fullName, sortable: true, sortValue: (u) => u.fullName },
    { key: 'usuario', header: 'Usuario', cell: (u) => u.username, sortable: true, sortValue: (u) => u.username },
    { key: 'rol', header: 'Rol', cell: (u) => roleLabel(u.role), sortable: true, sortValue: (u) => roleLabel(u.role) },
    { key: 'estado', header: 'Estado', cell: (u) => <StatusBadge user={u} /> },
    {
      key: 'acceso',
      header: 'Último acceso',
      cell: (u) => lastAccess(model, u),
      sortable: true,
      sortValue: (u) => u.lastAccessAt ?? '',
    },
  ];
  return (
    <div className="users">
      <div className="users-toolbar">
        <Button icon={<Plus size={18} aria-hidden="true" />} onClick={model.openNew} {...blocked(model.offlineReason)}>
          Nuevo usuario
        </Button>
      </div>
      <UsersNotice model={model} />
      <div className={title ? 'users-grid users-grid--panel' : 'users-grid'}>
        <div className="users-table">
          {list.status === 'loading' && <Skeleton lines={6} />}
          {list.status === 'error' && <ErrorState message={list.message} onRetry={model.reload} />}
          {list.status === 'ready' && (
            <DataTable
              caption="Usuarios"
              columns={columns}
              rows={list.users}
              onRowClick={model.openEdit}
              changed={model.changed}
            />
          )}
        </div>
        {title && (
          <aside className="users-panel" aria-labelledby="usuarios-panel">
            <h2 id="usuarios-panel" className="users-title">
              {title}
            </h2>
            {panel?.kind === 'new' && <NewUserForm model={model} />}
            {panel?.kind === 'edit' && <EditUserForm model={model} user={panel.user} />}
          </aside>
        )}
      </div>
      <UsersDialogs model={model} />
    </div>
  );
}
