import type { CompanyDto, SignatureResponse, StampResponse } from '@impocaribe/shared/validation';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { asyncNoop, field, inDevice, noop } from '../story-helpers';
import { CompanyDesktop } from './Company.desktop';
import { CompanyPhone } from './Company.phone';
import { CompanyTablet } from './Company.tablet';
import { historyOf, missingText, type CompanyModel, type CompanyPanel } from './useCompany';

// T054 · P-22 Empresa (ui-spec y maqueta T053): cada estado con un modelo fijo, sin servidor. La firma y el cuño de
// ejemplo son los dibujos de la maqueta (ficticios), en SVG para que se vean en las referencias.
const meta: Meta = { title: 'Pantallas/Empresa' };
export default meta;

const FIRMA = btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100" width="300" height="100"><path d="M14 70c22-40 38-52 44-38 6 15-14 40-6 42 10 2 26-48 38-44 10 4-8 38 4 38 12 0 20-28 30-26 8 2 2 22 10 22 14 0 26-34 40-30 10 3-2 24 8 24 18 0 34-24 52-22 14 2 22 10 50 6" fill="none" stroke="#1b2a6b" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 84c60-6 140-10 220-4" fill="none" stroke="#1b2a6b" stroke-width="2" stroke-linecap="round"/></svg>',
);
const CUNO = btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="54" fill="none" stroke="#5a2a8a" stroke-width="4"/><circle cx="60" cy="60" r="40" fill="none" stroke="#5a2a8a" stroke-width="2"/><text x="60" y="58" font-family="sans-serif" font-size="13" font-weight="700" fill="#5a2a8a" text-anchor="middle">OFICIAL</text><text x="60" y="76" font-family="sans-serif" font-size="9" fill="#5a2a8a" text-anchor="middle">LA HABANA</text></svg>',
);
const SVG = 'image/svg+xml' as 'image/png';

const COMPANY: CompanyDto = {
  legalName: 'IMPOCARIBE S.A.',
  address: 'Calle 23 No. 456, Vedado, La Habana',
  rowVersion: 3,
};
const SIG = {
  id: '0199f0a1-0000-7000-8000-0000000000a2',
  createdAt: '2026-10-14T13:12:00.000Z',
  createdBy: 'Ilén Fernández Rojas',
  representativeName: 'Ilén Fernández Rojas',
  credentialNo: '00123',
  position: 'Directora',
};
const OLD_SIG = {
  ...SIG,
  id: '0199f0a1-0000-7000-8000-0000000000a1',
  createdAt: '2026-10-02T19:31:00.000Z',
  representativeName: 'Mario Delgado Pérez',
  position: 'Director adjunto',
};
const SIGNATURE: SignatureResponse = { current: { ...SIG, mime: SVG, image: FIRMA }, history: [SIG, OLD_SIG] };
const STAMP_ITEM = {
  id: '0199f0a1-0000-7000-8000-0000000000b1',
  createdAt: '2026-10-02T19:40:00.000Z',
  createdBy: 'Ilén Fernández Rojas',
};
const STAMP: StampResponse = { current: { ...STAMP_ITEM, mime: SVG, image: CUNO }, history: [STAMP_ITEM] };
const NO_STAMP: StampResponse = { current: null, history: [] };

type Ready = Extract<CompanyModel['data'], { status: 'ready' }>;

const company = (
  panel: CompanyPanel,
  { stamp = STAMP, extra = {} }: { stamp?: StampResponse; extra?: Partial<CompanyModel> } = {},
): CompanyModel => ({
  data: { status: 'ready', company: COMPANY, signature: SIGNATURE, stamp },
  reload: noop,
  notice: null,
  offlineReason: undefined,
  missing: missingText(true, stamp.current !== null),
  history: historyOf(SIGNATURE, stamp),
  panel,
  close: noop,
  picked: null,
  dirty: false,
  companyFields: {
    legalName: field('legalName', COMPANY.legalName!),
    address: field('address', COMPANY.address!),
  },
  companySummary: [],
  companyError: null,
  savingCompany: false,
  submitCompany: asyncNoop,
  openCompany: noop,
  openSignature: noop,
  signatureFields: {
    image: field('image'),
    representativeName: field('representativeName', SIG.representativeName),
    credentialNo: field('credentialNo', SIG.credentialNo),
    position: field('position', SIG.position),
  },
  signatureSummary: [],
  signatureError: null,
  savingSignature: false,
  submitSignature: asyncNoop,
  pickSignature: asyncNoop,
  signatureImage: '',
  openStamp: noop,
  stampField: field('image'),
  stampSummary: [],
  stampError: null,
  savingStamp: false,
  submitStamp: asyncNoop,
  pickStamp: asyncNoop,
  stampImage: '',
  ...extra,
});

const VIEWS = {
  phone: ({ model }: { model: CompanyModel }) => <CompanyPhone model={model} data={model.data as Ready} />,
  tablet: ({ model }: { model: CompanyModel }) => <CompanyTablet model={model} data={model.data as Ready} />,
  desktop: ({ model }: { model: CompanyModel }) => <CompanyDesktop model={model} data={model.data as Ready} />,
};

export const TodoCargado: StoryObj = { name: 'Todo cargado', render: inDevice(VIEWS, company(null)) };
export const SinCuno: StoryObj = { name: 'Sin cuño', render: inDevice(VIEWS, company(null, { stamp: NO_STAMP })) };
export const ReemplazarFirma: StoryObj = {
  name: 'Reemplazar la firma',
  render: inDevice(
    VIEWS,
    company('signature', {
      extra: {
        picked: { name: 'firma-nueva.jpg', sizeKb: 180, width: 640, height: 220, mime: SVG, transparent: false },
        signatureImage: FIRMA,
        signatureFields: {
          image: field('image', FIRMA, { warning: 'Se recomienda fondo transparente' }),
          representativeName: field('representativeName', 'Mario Delgado Pérez'),
          credentialNo: field('credentialNo', '456'),
          position: field('position', 'Director adjunto'),
        },
      },
    }),
  ),
};
export const ImagenQueNoSirve: StoryObj = {
  name: 'Imagen que no sirve',
  render: inDevice(
    VIEWS,
    company('stamp', {
      extra: {
        picked: { name: 'cuno-pequeno.png', sizeKb: 12, width: 200, height: 80, mime: SVG, transparent: false },
        stampImage: CUNO,
        stampField: field('image', CUNO, { error: 'La imagen mide 200 × 80 px; debe medir al menos 300 × 100 px.' }),
      },
    }),
  ),
};
