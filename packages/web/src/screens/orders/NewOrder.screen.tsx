// T086 · P-13 Nueva orden: la lógica (useOrderForm, useNewOrder) y la presentación de la clase de dispositivo.
import { can } from '@impocaribe/shared';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { draftsApi } from '../../api/endpoints/orders';
import { useAppSession } from '../../session/SessionProvider';
import { Button } from '../../ui/controls';
import { useDeviceClass } from '../../ui/device';
import { Notice, Skeleton } from '../../ui/presentation';
import { useCatalog } from '../catalogs/useCatalog';
import { NewOrderDesktop } from './NewOrder.desktop';
import { NewOrderPhone } from './NewOrder.phone';
import { NewOrderTablet } from './NewOrder.tablet';
import { useDraftSource, useNewOrderDrafts, type DraftSource } from './useNewOrder';
import { useOrderForm } from './useOrderForm';

const VIEWS = { phone: NewOrderPhone, tablet: NewOrderTablet, desktop: NewOrderDesktop };

function NewOrder({ source }: { source: DraftSource }) {
  const drafts = useNewOrderDrafts(source);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const dm = params.get('dm');
  const initial =
    source.kind === 'local'
      ? source.payload
      : source.kind === 'server'
        ? source.draft.payload
        : dm
          ? { declarationId: dm }
          : undefined;
  const model = useOrderForm({
    ...(initial ? { initial } : {}),
    onChange: drafts.onChange,
    onDone: async (order) => {
      await drafts.issued(order);
    },
    ...(drafts.draftId ? { draftId: drafts.draftId } : {}),
  });
  const View = VIEWS[useDeviceClass()];
  return (
    <View
      p={{
        model,
        share: drafts.share,
        savedAt: drafts.savedAt,
        onCancel: () => navigate('/borradores'),
        onAnother: () => navigate(`/ordenes/nueva?dm=${model.issued!.declarationId}&otra=${model.issued!.id}`),
        onOpen: () => navigate(`/ordenes/${model.issued!.id}`),
      }}
    />
  );
}

/** EST-06: otro usuario tiene abierto el borrador compartido; una Apoderada puede liberarlo. */
function Locked({ id, by }: { id: string; by: string }) {
  const base = useCatalog();
  const { state } = useAppSession();
  const navigate = useNavigate();
  return (
    <div className="order-form">
      <Notice tone="warn">{`En edición por ${by || 'otro usuario'}.`}</Notice>
      {base.notice && <Notice tone={base.notice.tone}>{base.notice.text}</Notice>}
      <div className="catalog-actions">
        {can(state.session!.user.role, 'drafts.forceUnlock') && (
          <Button
            variant="secondary"
            busy={base.busy === 'liberar'}
            onClick={() =>
              void base.act('liberar', async () => {
                await base.api().request(draftsApi.unlock, { params: { id } });
                navigate(0);
              })
            }
          >
            Liberar el bloqueo
          </Button>
        )}
        <Button variant="ghost" onClick={() => navigate('/borradores')}>
          Volver a los borradores
        </Button>
      </div>
    </div>
  );
}

function Opening() {
  const { source, lockedBy } = useDraftSource();
  if (!source) return <Skeleton lines={6} />;
  if (lockedBy !== null && source.kind === 'server') return <Locked id={source.draft.id} by={lockedBy} />;
  return <NewOrder source={source} />;
}

export function NewOrderScreen() {
  // Otra orden (o otro borrador) empieza de cero: el formulario se monta de nuevo.
  const { search } = useLocation();
  return <Opening key={search} />;
}
