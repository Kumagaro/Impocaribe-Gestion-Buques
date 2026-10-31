// T054 · P-23 en desktop: los parámetros por grupo y el aviso legal con su vista previa a la derecha; el código de
// instalación, debajo (maqueta T053).
import {
  BackupsGroup,
  CodeSection,
  NetworkGroup,
  NoticeEditor,
  OrdersGroup,
  SaveBar,
  SettingsNotices,
} from './SettingsParts';
import type { SettingsModel } from './useSettings';

export function SettingsDesktop({ model }: { model: SettingsModel }) {
  return (
    <div className="settings">
      <form className="settings-grid" onSubmit={model.submit} noValidate>
        <div className="settings-main">
          <SettingsNotices model={model} />
          <OrdersGroup model={model} />
          <BackupsGroup model={model} />
          <NetworkGroup model={model} />
          <SaveBar model={model} />
        </div>
        <aside className="settings-side" aria-labelledby="cfg-aviso">
          <h2 id="cfg-aviso">Aviso legal del plazo</h2>
          <NoticeEditor model={model} />
        </aside>
      </form>
      <div className="settings-code">
        <CodeSection model={model} />
      </div>
    </div>
  );
}
