// T025 · Teléfono (ui-spec §1.1): cabecera con título, conexión y búsqueda; barra inferior con Nueva orden en el centro
// y "Más", que abre una hoja con el resto de secciones.
import { Ellipsis, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Sheet } from '../ui/overlays';
import { NavBar } from '../ui/structure';
import { SearchButton, ShellBands, SyncIndicator, type ShellStatus } from './ShellParts';
import type { AppShellModel } from './useAppShell';

const MORE = 'mas';

export function AppShellPhone({
  model,
  status,
  children,
}: {
  model: AppShellModel;
  status: ShellStatus;
  children: ReactNode;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const inMore = model.phoneMore.some((i) => i.id === model.current);
  return (
    <div className="app-shell app-shell--phone">
      <header className="app-header">
        <h1>{model.title}</h1>
        <SyncIndicator syncing={status.syncing} onClick={model.goDiagnostics} />
        <SearchButton onClick={model.goSearch} />
      </header>
      <ShellBands status={status} />
      <main className="app-main">{children}</main>
      <NavBar
        items={[...model.phoneBar, { id: MORE, label: 'Más', icon: <Ellipsis aria-hidden="true" /> }]}
        current={inMore ? MORE : model.current}
        onNavigate={(id) => (id === MORE ? setMoreOpen(true) : model.go(id))}
        {...(model.newOrder ? { primary: { ...model.newOrder, icon: <Plus aria-hidden="true" /> } } : {})}
      />
      {moreOpen && (
        <Sheet title="Más" onClose={() => setMoreOpen(false)}>
          <div className="app-more">
            {model.phoneMore.map((item) => (
              <button
                key={item.id}
                type="button"
                className="app-more__item"
                data-touch="true"
                aria-current={item.id === model.current ? 'page' : undefined}
                onClick={() => {
                  setMoreOpen(false);
                  model.go(item.id);
                }}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className="app-more__item"
              data-touch="true"
              onClick={() => {
                setMoreOpen(false);
                model.goProfile();
              }}
            >
              Perfil
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
