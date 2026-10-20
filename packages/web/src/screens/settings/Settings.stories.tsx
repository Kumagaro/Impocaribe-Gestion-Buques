import { DEFAULT_LEGAL_NOTICE, type SettingsDto } from '@impocaribe/shared/validation';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { asyncNoop, field, inDevice, noop } from '../story-helpers';
import { SettingsDesktop } from './Settings.desktop';
import { SettingsPhone } from './Settings.phone';
import { SettingsTablet } from './Settings.tablet';
import type { SettingsModel, SettingsPanel } from './useSettings';

// T054 · P-23 Configuración (ui-spec y maqueta T053): cada estado con un modelo fijo, sin servidor.
const meta: Meta = { title: 'Pantallas/Configuración' };
export default meta;

const SETTINGS: SettingsDto = {
  maxLoadingDaysAhead: 7,
  workdayStart: '07:00',
  workdayEnd: '19:00',
  dailyBackupHour: '20:00',
  externalBackupDir: 'E:\\Respaldos IMPOCARIBE',
  networkSetup: 'router',
  deadlineLegalNotice: DEFAULT_LEGAL_NOTICE,
  rowVersion: 5,
};

const settings = (panel: SettingsPanel, extra: Partial<SettingsModel> = {}): SettingsModel => ({
  data: { status: 'ready', settings: SETTINGS },
  reload: noop,
  notice: null,
  offlineReason: undefined,
  panel,
  open: noop,
  close: noop,
  closeNotice: asyncNoop,
  noticeError: undefined,
  fields: {
    maxLoadingDaysAhead: field('maxLoadingDaysAhead', '7'),
    workdayStart: field('workdayStart', '07:00'),
    workdayEnd: field('workdayEnd', '19:00'),
    dailyBackupHour: field('dailyBackupHour', '20:00'),
    externalBackupDir: field('externalBackupDir', 'E:\\Respaldos IMPOCARIBE'),
    networkSetup: field('networkSetup', 'router'),
    deadlineLegalNotice: field('deadlineLegalNotice', DEFAULT_LEGAL_NOTICE),
  },
  network: 'router',
  setNetwork: noop,
  noticeText: DEFAULT_LEGAL_NOTICE,
  resetNotice: noop,
  summary: [],
  formError: null,
  dirty: false,
  saving: false,
  submit: asyncNoop,
  codeFields: { currentCode: field('currentCode'), newCode: field('newCode'), confirm: field('confirm') },
  codeSummary: [],
  codeError: null,
  changingCode: false,
  submitCode: asyncNoop,
  ...extra,
});
const VIEWS = { phone: SettingsPhone, tablet: SettingsTablet, desktop: SettingsDesktop };

export const Valores: StoryObj = { name: 'Valores', render: inDevice(VIEWS, settings(null)) };
export const AvisosYError: StoryObj = {
  name: 'Avisos y error de la carpeta',
  render: inDevice(
    VIEWS,
    settings(null, {
      fields: {
        maxLoadingDaysAhead: field('maxLoadingDaysAhead', '0', {
          warning: 'Solo se podrá emitir con fecha de carga de hoy',
        }),
        workdayStart: field('workdayStart', '07:00'),
        workdayEnd: field('workdayEnd', '19:00'),
        dailyBackupHour: field('dailyBackupHour', '12:00', { warning: 'Coincide con la jornada de trabajo' }),
        externalBackupDir: field('externalBackupDir', 'F:\\USB', {
          error: 'La carpeta no existe en la PC servidor. Conecte la memoria USB o elija otra.',
        }),
        networkSetup: field('networkSetup', 'hotspot'),
        deadlineLegalNotice: field('deadlineLegalNotice', DEFAULT_LEGAL_NOTICE),
      },
      network: 'hotspot',
    }),
  ),
};
export const CodigoDeInstalacion: StoryObj = {
  name: 'Código de instalación',
  render: inDevice(
    VIEWS,
    settings('code', {
      codeFields: {
        currentCode: field('currentCode', 'ABCD-EFGH-JKMN'),
        newCode: field('newCode', 'K7QM-3XTP-R2HW', { valid: true }),
        confirm: field('confirm', 'K7QM-3XTP-R2HV', { error: 'Los códigos no coinciden.' }),
      },
    }),
  ),
};
export const SinConexion: StoryObj = {
  name: 'Sin conexión',
  render: inDevice(VIEWS, settings(null, { offlineReason: 'Requiere conexión con el servidor' })),
};
