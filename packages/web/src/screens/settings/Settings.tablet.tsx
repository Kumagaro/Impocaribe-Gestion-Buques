// T054 · P-23 en tablet: una columna de grupos, el aviso legal con su vista previa y el código de instalación al final
// (maqueta T053).
import {
  BackupsGroup,
  CodeSection,
  Group,
  NetworkGroup,
  NoticeEditor,
  OrdersGroup,
  SaveBar,
  SettingsNotices,
} from './SettingsParts';
import type { SettingsModel } from './useSettings';

export function SettingsTablet({ model }: { model: SettingsModel }) {
  return (
    <div className="settings">
      <form className="settings-main" onSubmit={model.submit} noValidate>
        <SettingsNotices model={model} />
        <OrdersGroup model={model} />
        <BackupsGroup model={model} />
        <NetworkGroup model={model} />
        <Group id="cfg-aviso" title="Aviso legal del plazo">
          <NoticeEditor model={model} />
        </Group>
        <SaveBar model={model} />
      </form>
      <div className="settings-code">
        <CodeSection model={model} />
      </div>
    </div>
  );
}
