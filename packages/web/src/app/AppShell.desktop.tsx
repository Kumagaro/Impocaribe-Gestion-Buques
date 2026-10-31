// T025 · Escritorio (ui-spec §1.1): menú lateral fijo por grupos, como el prototipo; cabecera con título y subtítulo,
// búsqueda global, alertas, usuario y rol, y cambio de tema. Los atajos los atiende useAppShell.
import { useState, type ReactNode } from 'react';
import { AppLogo } from '../ui/logo';
import { Sidebar } from '../ui/structure';
import { AlertsButton, SearchButton, ShellBands, SyncIndicator, ThemeButton, type ShellStatus } from './ShellParts';
import type { AppShellModel } from './useAppShell';

export function AppShellDesktop({
  model,
  status,
  alertsPanel,
  children,
}: {
  model: AppShellModel;
  status: ShellStatus;
  alertsPanel?: (onClose: () => void) => ReactNode;
  children: ReactNode;
}) {
  const [panel, setPanel] = useState(false);
  return (
    <div className="app-shell app-shell--desktop">
      <Sidebar
        items={model.items}
        current={model.current}
        onNavigate={model.go}
        header={
          <div className="app-brand">
            <AppLogo size={32} />
            <div>
              <b>Órdenes de Carga</b>
              <span>IMPOCARIBE</span>
            </div>
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
          <AlertsButton count={status.alerts} onClick={alertsPanel ? () => setPanel(true) : model.goAlerts} />
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
        {panel && alertsPanel?.(() => setPanel(false))}
      </div>
    </div>
  );
}
