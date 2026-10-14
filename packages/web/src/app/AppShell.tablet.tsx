// T025 · Tablet (ui-spec §1.1): riel lateral con todas las secciones y Nueva orden destacada; cabecera con título,
// conexión, búsqueda y contador de alertas.
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavRail } from '../ui/structure';
import { AlertsButton, SearchButton, ShellBands, SyncIndicator, type ShellStatus } from './ShellParts';
import type { AppShellModel } from './useAppShell';

export function AppShellTablet({
  model,
  status,
  children,
}: {
  model: AppShellModel;
  status: ShellStatus;
  children: ReactNode;
}) {
  return (
    <div className="app-shell app-shell--tablet">
      <NavRail
        items={model.railItems}
        current={model.current}
        onNavigate={model.go}
        {...(model.newOrder ? { primary: { ...model.newOrder, icon: <Plus aria-hidden="true" /> } } : {})}
      />
      <div className="app-column">
        <header className="app-header">
          <h1>{model.title}</h1>
          <SyncIndicator syncing={status.syncing} onClick={model.goDiagnostics} />
          <SearchButton onClick={model.goSearch} />
          <AlertsButton count={status.alerts} onClick={model.goAlerts} />
        </header>
        <ShellBands status={status} />
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
