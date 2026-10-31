// T058 · P-18 Choferes y camiones: la lógica (plan §7.3). RF-CAT-03 a 09, HU-08, F-13. Tres listas de la copia local,
// filtrables por transportista; la chapa, el carné y la licencia repetidos bloquean (RF-CAT-08, comprobado contra la
// copia local mientras se escribe y confirmado por el servidor al guardar); un nombre de chofer parecido solo avisa.
import { addTons, findSimilar, formatTons, nationalIdDateWarning, normalizePlate, parseTons } from '@impocaribe/shared';
import {
  changeDriverCarrierSchema,
  driverSchema,
  editTrailerSchema,
  editTruckSchema,
  type CarrierDto,
  type DriverDto,
  type TrailerDto,
  type TruckDto,
} from '@impocaribe/shared/validation';
import { useState } from 'react';
import { z } from 'zod';
import { changeDriverCarrier, driversApi, trailersApi, trucksApi } from '../../api/endpoints/catalogs';
import { useRecentlyChanged } from '../../sync/SyncProvider';
import { useValidatedForm } from '../../validation/useValidatedForm';
import { byText, useCatalog, useLocal } from './useCatalog';

export type FleetTab = 'trucks' | 'trailers' | 'drivers';
export type FleetPanel =
  | { kind: 'truck'; item: TruckDto | null }
  | { kind: 'trailer'; item: TrailerDto | null }
  | { kind: 'driver'; item: DriverDto | null }
  | null;

/** La capacidad del camión: la suma de sus remolques (RF-CAT-04), con el formato de pantalla (RNF-05). */
export function capacityOf(trailerIds: string[], trailers: TrailerDto[]): string {
  const tons = trailerIds.flatMap((id) => trailers.filter((t) => t.id === id).map((t) => parseTons(t.capacityTons)));
  return formatTons(addTons(...tons));
}

const driverFormSchema = driverSchema.extend({ expectedVersion: z.number().int().nonnegative() });
const TRUCK_STEPS = [['carrierId', 'plate', 'tractorPlate', 'baseLocation'], ['trailerIds'], []] as const;

export function useFleet() {
  const base = useCatalog();
  const carriers = useLocal<CarrierDto>(
    'carrier',
    byText((c) => c.name),
  );
  const trucks = useLocal<TruckDto>(
    'truck',
    byText((t) => t.plate),
  );
  const trailers = useLocal<TrailerDto>(
    'trailer',
    byText((t) => t.plate),
  );
  const drivers = useLocal<DriverDto>(
    'driver',
    byText((d) => d.fullName),
  );
  const changed = {
    trucks: useRecentlyChanged('truck'),
    trailers: useRecentlyChanged('trailer'),
    drivers: useRecentlyChanged('driver'),
  };
  const [tab, setTab] = useState<FleetTab>('trucks');
  const [carrierFilter, setCarrierFilter] = useState('');
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<FleetPanel>(null);
  const [truckStep, setTruckStep] = useState(0);
  const [moving, setMoving] = useState<DriverDto | null>(null);

  const carrierName = (id: string) => carriers.find((c) => c.id === id)?.name ?? '';
  const ofCarrier = <T extends { carrierId: string }>(list: T[]) =>
    carrierFilter ? list.filter((x) => x.carrierId === carrierFilter) : list;
  const q = search.trim();
  const shown = {
    trucks: ofCarrier(trucks).filter((t) => !q || t.plate.includes(normalizePlate(q))),
    trailers: ofCarrier(trailers).filter((t) => !q || t.plate.includes(normalizePlate(q))),
    // El chofer se busca por su carné, que es su identificador (ui-spec P-18).
    drivers: ofCarrier(drivers).filter((d) => !q || d.nationalId.startsWith(q.replace(/\D/g, ''))),
  };
  /** Solo los activos se eligen (RF-CAT-07): transportistas para un registro nuevo o cambiado. */
  const carrierOptions = carriers.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }));

  const done = async (text: string) => {
    setPanel(null);
    await base.done(text);
  };

  // ---------- Camión ----------
  const truckItem = panel?.kind === 'truck' ? panel.item : null;
  const truck = useValidatedForm({
    schema: editTruckSchema,
    defaultValues: { carrierId: '', plate: '', tractorPlate: '', baseLocation: '', trailerIds: [], expectedVersion: 0 },
    labels: {
      carrierId: 'Transportista',
      plate: 'Chapa',
      tractorPlate: 'Chapa del tractivo',
      baseLocation: 'Basificado en',
      trailerIds: 'Remolques habituales',
      expectedVersion: 'Versión',
    },
    onSubmit: async ({ expectedVersion, ...values }) => {
      if (truckItem)
        await base
          .api()
          .request(trucksApi.edit, { params: { id: truckItem.id }, body: { ...values, expectedVersion } });
      else await base.api().request(trucksApi.create, { body: values });
      await done(
        truckItem ? `Se guardaron los cambios del camión ${values.plate}.` : `Se creó el camión ${values.plate}.`,
      );
    },
  });
  const truckCarrier = String(truck.form.watch('carrierId') ?? '');
  const truckTrailers = (truck.form.watch('trailerIds') as string[] | undefined) ?? [];
  const truckPlate = normalizePlate(String(truck.form.watch('plate') ?? ''));
  const truckSame = trucks.find((t) => t.plate === truckPlate && t.id !== truckItem?.id && truckPlate !== '');

  // ---------- Remolque ----------
  const trailerItem = panel?.kind === 'trailer' ? panel.item : null;
  const trailer = useValidatedForm({
    schema: editTrailerSchema,
    defaultValues: { carrierId: '', plate: '', capacityTons: '', expectedVersion: 0 },
    labels: { carrierId: 'Transportista', plate: 'Chapa', capacityTons: 'Capacidad (t)', expectedVersion: 'Versión' },
    onSubmit: async ({ expectedVersion, ...values }) => {
      if (trailerItem)
        await base
          .api()
          .request(trailersApi.edit, { params: { id: trailerItem.id }, body: { ...values, expectedVersion } });
      else await base.api().request(trailersApi.create, { body: values });
      await done(
        trailerItem ? `Se guardaron los cambios del remolque ${values.plate}.` : `Se creó el remolque ${values.plate}.`,
      );
    },
  });
  const trailerPlate = normalizePlate(String(trailer.form.watch('plate') ?? ''));
  const trailerSame = trailers.find((t) => t.plate === trailerPlate && t.id !== trailerItem?.id && trailerPlate !== '');

  // ---------- Chofer ----------
  const driverItem = panel?.kind === 'driver' ? panel.item : null;
  const driver = useValidatedForm({
    schema: driverFormSchema,
    defaultValues: { fullName: '', nationalId: '', licenseNo: '', carrierId: '', expectedVersion: 0 },
    labels: {
      fullName: 'Nombre y apellidos',
      nationalId: 'Carné de identidad',
      licenseNo: 'Licencia de conducción',
      carrierId: 'Transportista',
      expectedVersion: 'Versión',
    },
    warnings: (v) => {
      const people = drivers.map((d) => ({ id: d.id, name: d.fullName }));
      const parecido = findSimilar(String(v.fullName), people, driverItem?.id).similar[0];
      const fecha = nationalIdDateWarning(String(v.nationalId));
      return {
        ...(parecido ? { fullName: `Hay un chofer parecido: ${parecido.name}` } : {}),
        ...(fecha ? { nationalId: fecha } : {}),
      };
    },
    onSubmit: async ({ expectedVersion, carrierId, ...values }) => {
      // El transportista de un chofer que ya existe no se cambia aquí: pide motivo (RF-CAT-09).
      if (driverItem)
        await base
          .api()
          .request(driversApi.edit, { params: { id: driverItem.id }, body: { ...values, expectedVersion } });
      else await base.api().request(driversApi.create, { body: { ...values, carrierId } });
      await done(
        driverItem ? `Se guardaron los cambios de ${values.fullName}.` : `Se creó el chofer ${values.fullName}.`,
      );
    },
  });
  const driverId = String(driver.form.watch('nationalId') ?? '');
  const driverLicense = String(driver.form.watch('licenseNo') ?? '');
  const others = drivers.filter((d) => d.id !== driverItem?.id);
  const sameId = driverId.length === 11 ? others.find((d) => d.nationalId === driverId) : undefined;
  const sameLicense = driverLicense.length === 11 ? others.find((d) => d.licenseNo === driverLicense) : undefined;

  // ---------- Cambio de transportista (RF-CAT-09) ----------
  const move = useValidatedForm({
    schema: changeDriverCarrierSchema,
    defaultValues: { carrierId: '', reason: '', expectedVersion: 0 },
    labels: { carrierId: 'Nuevo transportista', reason: 'Motivo', expectedVersion: 'Versión' },
    onSubmit: async (values) => {
      await base.api().request(changeDriverCarrier, { params: { id: moving!.id }, body: values });
      const name = moving!.fullName;
      setMoving(null);
      await done(`${name} pasó a ${carrierName(values.carrierId)}.`);
    },
  });

  const toggle = (kind: 'truck' | 'trailer' | 'driver', item: { id: string; active: boolean }, label: string) =>
    void base.act(`${item.active ? 'desactivar' : 'activar'}-${item.id}`, async () => {
      const api = { truck: trucksApi, trailer: trailersApi, driver: driversApi }[kind];
      await base.api().request(item.active ? api.deactivate : api.activate, { params: { id: item.id } });
      await done(`${label} quedó ${item.active ? 'inactivo' : 'activo'}.`);
    });

  return {
    ...base,
    carriers,
    trucks,
    trailers,
    drivers,
    shown,
    changed,
    carrierName,
    carrierOptions,
    tab,
    setTab: (t: FleetTab) => {
      setTab(t);
      setSearch('');
    },
    carrierFilter,
    setCarrierFilter,
    search,
    setSearch,
    panel,
    close: () => setPanel(null),

    openTruck: (item: TruckDto | null) => {
      base.setNotice(null);
      setTruckStep(0);
      truck.reset(
        item
          ? { ...item, tractorPlate: item.tractorPlate ?? '', expectedVersion: item.rowVersion }
          : {
              carrierId: carrierFilter,
              plate: '',
              tractorPlate: '',
              baseLocation: '',
              trailerIds: [],
              expectedVersion: 0,
            },
      );
      setPanel({ kind: 'truck', item });
    },
    truckFields: {
      carrierId: truck.field('carrierId'),
      plate: truck.field('plate'),
      tractorPlate: truck.field('tractorPlate'),
      baseLocation: truck.field('baseLocation'),
    },
    /** Los remolques que se pueden elegir: activos y del transportista del camión (más los que ya tiene). */
    truckTrailerChoices: trailers.filter(
      (t) => (t.carrierId === truckCarrier && t.active) || truckTrailers.includes(t.id),
    ),
    truckTrailers,
    truckTrailersError: truck.form.formState.errors.trailerIds?.message as string | undefined,
    truckCapacity: capacityOf(truckTrailers, trailers),
    toggleTrailer: (id: string) =>
      truck.form.setValue(
        'trailerIds',
        truckTrailers.includes(id) ? truckTrailers.filter((x) => x !== id) : [...truckTrailers, id],
        { shouldDirty: true, shouldValidate: truck.form.formState.isSubmitted },
      ),
    truckSameReason: truckSame ? `Ya existe un camión con la chapa ${truckSame.plate}.` : undefined,
    truckSummary: truck.summary,
    truckError: truck.formError,
    savingTruck: truck.form.formState.isSubmitting,
    submitTruck: truck.submit,
    truckDirty: truck.dirty,
    /** TEL: el alta del camión va por pasos (ui-spec P-18). */
    truckStep,
    nextTruckStep: async () => {
      if (await truck.form.trigger([...TRUCK_STEPS[truckStep]!] as never)) setTruckStep((s) => Math.min(2, s + 1));
    },
    prevTruckStep: () => setTruckStep((s) => Math.max(0, s - 1)),

    openTrailer: (item: TrailerDto | null) => {
      base.setNotice(null);
      trailer.reset(
        item
          ? {
              carrierId: item.carrierId,
              plate: item.plate,
              capacityTons: item.capacityTons.replace('.', ','),
              expectedVersion: item.rowVersion,
            }
          : { carrierId: carrierFilter, plate: '', capacityTons: '', expectedVersion: 0 },
      );
      setPanel({ kind: 'trailer', item });
    },
    trailerFields: {
      carrierId: trailer.field('carrierId'),
      plate: trailer.field('plate'),
      capacityTons: trailer.field('capacityTons'),
    },
    trailerSameReason: trailerSame ? `Ya existe un remolque con la chapa ${trailerSame.plate}.` : undefined,
    trailerSummary: trailer.summary,
    trailerError: trailer.formError,
    savingTrailer: trailer.form.formState.isSubmitting,
    submitTrailer: trailer.submit,
    trailerDirty: trailer.dirty,

    openDriver: (item: DriverDto | null) => {
      base.setNotice(null);
      driver.reset(
        item
          ? { ...item, expectedVersion: item.rowVersion }
          : { fullName: '', nationalId: '', licenseNo: '', carrierId: carrierFilter, expectedVersion: 0 },
      );
      setPanel({ kind: 'driver', item });
    },
    driverFields: {
      fullName: driver.field('fullName'),
      nationalId: driver.field('nationalId'),
      licenseNo: driver.field('licenseNo'),
      carrierId: driver.field('carrierId'),
    },
    driverIdReason: sameId ? `Ya existe un chofer con el carné ${sameId.nationalId}: ${sameId.fullName}.` : undefined,
    driverLicenseReason: sameLicense
      ? `Ya existe un chofer con la licencia ${sameLicense.licenseNo}: ${sameLicense.fullName}.`
      : undefined,
    driverSummary: driver.summary,
    driverError: driver.formError,
    savingDriver: driver.form.formState.isSubmitting,
    submitDriver: driver.submit,
    driverDirty: driver.dirty,

    moving,
    askMove: (d: DriverDto) => {
      move.reset({ carrierId: '', reason: '', expectedVersion: d.rowVersion });
      setMoving(d);
    },
    cancelMove: () => setMoving(null),
    moveFields: { carrierId: move.field('carrierId'), reason: move.field('reason') },
    moveError: move.formError,
    savingMove: move.form.formState.isSubmitting,
    submitMove: move.submit,

    toggle,
  };
}

export type FleetModel = ReturnType<typeof useFleet>;
