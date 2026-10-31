// T058 y T059 · El patrón común de P-18 a P-20 (ui-spec y maqueta T057): en ESC, tabla con el detalle en un panel al
// lado; en TAB, lista y detalle lado a lado; en TEL, tarjetas y el detalle en una hoja.
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../../ui/controls';
import type { DeviceClass } from '../../ui/device';
import { Modal } from '../../ui/overlays';
import { EmptyState, Notice } from '../../ui/presentation';
import { SplitView } from '../../ui/structure';

/** Un botón desactivado con su motivo (sin conexión, RF-CON-06; o una regla). */
export const blocked = (reason: string | undefined) => (reason ? { disabledReason: reason } : {});

export interface CatalogLayoutProps {
  device: DeviceClass;
  /** Lo que se lista (en ESC, una tabla; en TAB y TEL, tarjetas). */
  list: ReactNode;
  /** Sobre la lista: filtros o pestañas. */
  toolbar?: ReactNode;
  newLabel: string;
  onNew: () => void;
  /** Solo Apoderadas y Operadores crean y cambian (EST-05); Solo lectura no ve el botón. */
  canEdit: boolean;
  offlineReason: string | undefined;
  notice: { tone: 'info' | 'bad'; text: string } | null;
  panelTitle: string | null;
  panel: ReactNode;
  onClose: () => void;
  /** Lo que se dice en TAB cuando no hay nada abierto. */
  emptyDetail: string;
  /** Confirmaciones (desactivar, cambiar de transportista…), en un diálogo en las tres clases. */
  dialogs?: ReactNode;
}

export function CatalogLayout(p: CatalogLayoutProps) {
  const head = (
    <>
      {p.canEdit && (
        <div className="catalog-toolbar">
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={p.onNew} {...blocked(p.offlineReason)}>
            {p.newLabel}
          </Button>
        </div>
      )}
      {p.notice && <Notice tone={p.notice.tone}>{p.notice.text}</Notice>}
      {p.toolbar}
    </>
  );
  const panel = p.panelTitle && (
    <div className="catalog-panel">
      <h2 className="catalog-title">{p.panelTitle}</h2>
      {p.panel}
    </div>
  );

  if (p.device === 'desktop')
    return (
      <div className="catalog">
        {head}
        <div className={p.panelTitle ? 'catalog-grid catalog-grid--panel' : 'catalog-grid'}>
          <div className="catalog-list">{p.list}</div>
          {panel && <aside className="catalog-side">{panel}</aside>}
        </div>
        {p.dialogs}
      </div>
    );

  if (p.device === 'tablet')
    return (
      <div className="catalog">
        {head}
        <SplitView
          listLabel="Lista"
          list={p.list}
          detailLabel="Detalle"
          detail={panel || <EmptyState title={p.emptyDetail} />}
        />
        {p.dialogs}
      </div>
    );

  return (
    <div className="catalog">
      {head}
      <div className="catalog-list">{p.list}</div>
      {p.panelTitle && (
        <Modal title={p.panelTitle} onClose={p.onClose}>
          {p.panel}
        </Modal>
      )}
      {p.dialogs}
    </div>
  );
}
