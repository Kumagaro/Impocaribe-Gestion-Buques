import type { Meta, StoryObj } from '@storybook/react-vite';
import { inDevice, noop } from '../story-helpers';
import { AlertsDesktop } from './Alerts.desktop';
import { AlertsPanelView } from './Alerts.parts';
import { AlertsPhone } from './Alerts.phone';
import { AlertsTablet } from './Alerts.tablet';
import { EXPIRED } from './alerts.fixtures';
import { alertsStoryModel as model, DRAFTS, OFFLINE } from './alerts.story-model';
import { fromServer } from './useAlertFeed';

// T096 y T097 · P-17 Alertas (ui-spec P-17 y maqueta T095): cada estado con un modelo fijo, sin servidor. Datos ficticios.
const meta: Meta = { title: 'Pantallas/Alertas' };
export default meta;

const VIEWS = { phone: AlertsPhone, tablet: AlertsTablet, desktop: AlertsDesktop };

export const Abiertas: StoryObj = { render: inDevice(VIEWS, model()) };
export const Atendidas: StoryObj = {
  render: inDevice(
    VIEWS,
    model({ status: 'attended', locals: [], server: [fromServer(EXPIRED)], selected: fromServer(EXPIRED) }),
  ),
};
export const SinConexion: StoryObj = {
  render: inDevice(VIEWS, model({ locals: [OFFLINE, DRAFTS], offlineReason: 'Requiere conexión con el servidor' })),
};
export const SinAlertas: StoryObj = {
  render: inDevice(VIEWS, model({ locals: [], server: [], open: 0, selected: null })),
};
export const PanelLateral: StoryObj = {
  // El panel va en un portal: la pantalla de debajo queda en la raíz de la historia, como en la app.
  render: () => (
    <>
      <p>Tablero (la pantalla actual sigue debajo)</p>
      <AlertsPanelView model={model()} onClose={noop} />
    </>
  ),
};
