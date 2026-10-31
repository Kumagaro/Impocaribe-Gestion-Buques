// T054 · P-23 en phone: grupos apilados; el aviso legal y el código de instalación se abren en una hoja (maqueta T053).
import { Button } from '../../ui/controls';
import { Notice } from '../../ui/presentation';
import {
  BackupsGroup,
  Group,
  NetworkGroup,
  OrdersGroup,
  SaveBar,
  SettingsDialogs,
  SettingsNotices,
} from './SettingsParts';
import { NOTICE_MAX, type SettingsModel } from './useSettings';

export function SettingsPhone({ model }: { model: SettingsModel }) {
  return (
    <div className="settings">
      <form className="settings-main" onSubmit={model.submit} noValidate>
        <SettingsNotices model={model} />
        <OrdersGroup model={model} />
        <BackupsGroup model={model} />
        <NetworkGroup model={model} short />
        <Group id="cfg-aviso" title="Aviso legal del plazo">
          <p className="settings-text">{`${model.noticeText.length} de ${NOTICE_MAX} caracteres`}</p>
          {model.noticeError && <Notice tone="bad">{model.noticeError}</Notice>}
          <Button variant="ghost" onClick={() => model.open('notice')}>
            Editar el aviso
          </Button>
        </Group>
        <Group id="cfg-codigo" title="Código de instalación">
          <Button variant="ghost" onClick={() => model.open('code')} aria-label="Cambiar el código de instalación">
            Cambiar el código
          </Button>
        </Group>
        <SaveBar model={model} />
      </form>
      <SettingsDialogs model={model} />
    </div>
  );
}
