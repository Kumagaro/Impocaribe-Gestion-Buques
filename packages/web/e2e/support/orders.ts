// Escenario de órdenes por API (con la Apoderada), compartido por las E2E de órdenes (T086 a T089) y de alertas (T096).
import { png } from '../../../shared/src/testing/images.ts';
import { clientsApi, carriersApi, driversApi, trailersApi, trucksApi } from '../../src/api/endpoints/catalogs';
import { putSignature, putStamp } from '../../src/api/endpoints/company';
import { declarationsApi, vesselsApi } from '../../src/api/endpoints/vessels';
import { readState } from './access';
import { signedInDevice } from './api';

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
export const havanaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Havana' }).format(new Date());

/** Lo que necesita una orden, por API (con la Apoderada), con datos propios de cada clase. */
export async function prepare(k: { code: string; dm: string; plate: string; nationalId: string; license: string }) {
  const { apoderada } = readState();
  const api = await signedInDevice(apoderada.username, apoderada.password);
  await api.request(putSignature, {
    body: {
      image: b64(png(900, 300)),
      representativeName: 'Ilén Fernández Rojas',
      credentialNo: '00123',
      position: 'Directora',
    },
  });
  await api.request(putStamp, { body: { image: b64(png(400, 400)) } });
  const client = await api.request(clientsApi.create, {
    body: {
      name: `Nuevos Tiempos ${k.code}`,
      recipients: [{ name: 'Almacén Central', address: 'Calle 100 y Boyeros, La Habana' }],
    },
  });
  const carrier = await api.request(carriersApi.create, { body: { name: `Transportes ${k.code}` } });
  const trailers = [
    await api.request(trailersApi.create, {
      body: { carrierId: carrier.id, plate: `${k.plate}A`, capacityTons: '30' },
    }),
    await api.request(trailersApi.create, {
      body: { carrierId: carrier.id, plate: `${k.plate}B`, capacityTons: '20' },
    }),
  ];
  const truck = await api.request(trucksApi.create, {
    body: {
      carrierId: carrier.id,
      plate: `${k.plate}C`,
      tractorPlate: '',
      baseLocation: '',
      trailerIds: trailers.map((t) => t.id),
    },
  });
  const driver = await api.request(driversApi.create, {
    body: {
      fullName: `Chofer ${k.code} Miranda`,
      nationalId: k.nationalId,
      licenseNo: k.license,
      carrierId: carrier.id,
    },
  });
  const vessel = await api.request(vesselsApi.create, {
    body: {
      name: `Eagle ${k.code}`,
      manifest: '0080/2026',
      bl: 'BL-E2E',
      port: 'Mariel, terminal 2',
      internalBuyer: 'IMPOCARIBE S.A.',
      etaDate: null,
      arrivalDate: havanaToday(),
      totalTons: '1000',
    },
  });
  const dm = await api.request(declarationsApi.create, {
    body: {
      number: k.dm,
      clientId: client.id,
      brand: 'Dosel',
      totalTons: '100',
      allocation: { vesselId: vessel.id, tons: '100' },
    },
  });
  return { api, client, carrier, trailers, truck, driver, vessel, dm };
}
