// T056 · plan §4.4 y §6.2 (Catálogos): los DTO que publica el servidor y guarda la copia local, completos e incluidos
// los inactivos (RF-CAT-07). Las toneladas viajan como texto con 3 decimales ("32.500").
import { z } from 'zod';

const record = { id: z.uuid(), active: z.boolean(), rowVersion: z.number().int().positive() };

export const recipientDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string(),
  active: z.boolean(),
});
export const clientDtoSchema = z.object({ ...record, name: z.string(), recipients: z.array(recipientDtoSchema) });
export type ClientDto = z.infer<typeof clientDtoSchema>;

export const carrierDtoSchema = z.object({ ...record, name: z.string() });
export type CarrierDto = z.infer<typeof carrierDtoSchema>;

export const trailerDtoSchema = z.object({
  ...record,
  plate: z.string(),
  capacityTons: z.string(),
  carrierId: z.uuid(),
});
export type TrailerDto = z.infer<typeof trailerDtoSchema>;

export const truckDtoSchema = z.object({
  ...record,
  plate: z.string(),
  tractorPlate: z.string().nullable(),
  baseLocation: z.string(),
  carrierId: z.uuid(),
  /** Los remolques habituales, en orden. */
  trailerIds: z.array(z.uuid()),
});
export type TruckDto = z.infer<typeof truckDtoSchema>;

export const driverDtoSchema = z.object({
  ...record,
  fullName: z.string(),
  nationalId: z.string(),
  licenseNo: z.string(),
  carrierId: z.uuid(),
});
export type DriverDto = z.infer<typeof driverDtoSchema>;
