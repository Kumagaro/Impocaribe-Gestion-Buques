// T025 · Escritorio (ui-spec §1.1): menú lateral fijo por grupos, como el prototipo; cabecera con título y subtítulo,
// búsqueda global, alertas, usuario y rol, y cambio de tema. Los atajos los atiende useAppShell.
import type { ReactNode } from 'react';
import { Sidebar } from '../ui/structure';
import { AlertsButton, SearchButton, ShellBands, SyncIndicator, ThemeButton, type ShellStatus } from './ShellParts';
import type { AppShellModel } from './useAppShell';

export function AppShellDesktop({
  model,
  status,
  children,
}: {
  model: AppShellModel;
  status: ShellStatus;
  children: ReactNode;
}) {
  return (
    <div className="app-shell app-shell--desktop">
      <Sidebar
        items={model.items}
        current={model.current}
        onNavigate={model.go}
        header={
          <div className="app-brand">
            <b>Órdenes de Carga</b>
            <span>IMPOCARIBE</span>
          </div>
        }
      />
      <div className="app-column">
        <header className="app-header">
          <div className="app-header__title">
            <h1>{model.title}</h1>
            {model.subtitle && <span>{model.subtitle}</span>}
          </div>
          <SearchButton onClick={model.goSearch} />
          <SyncIndicator syncing={status.syncing} onClick={model.goDiagnostics} />
          <AlertsButton count={status.alerts} onClick={model.goAlerts} />
          <button
            type="button"
            className="app-user"
            onClick={model.goProfile}
            aria-label={`Perfil de ${model.user.name}`}
          >
            {`${model.user.name} · ${model.user.role}`}
          </button>
          <ThemeButton theme={model.theme} onClick={model.cycleTheme} />
        </header>
        <ShellBands status={status} />
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
