// T051 y T052 · plan §6.2: empresa, firma y cuño oficiales (P-22) y configuración del sistema (P-23). Las rutas y sus
// esquemas son los del servidor (contrato, T026).
import {
  companyDtoSchema,
  editCompanySchema,
  editSettingsSchema,
  installationCodeChangeSchema,
  officialStatusSchema,
  settingsDtoSchema,
  signatureResponseSchema,
  signatureSchema,
  signatureVersionSchema,
  stampResponseSchema,
  stampSchema,
} from '@impocaribe/shared/validation';
import { defineEndpoint } from '../client';

const A = ['apoderada'] as const;

export const getCompany = defineEndpoint({
  method: 'GET',
  path: '/company',
  output: companyDtoSchema,
  roles: ['apoderada', 'operador', 'lectura'],
});
export const patchCompany = defineEndpoint({
  method: 'PATCH',
  path: '/company',
  input: editCompanySchema,
  output: companyDtoSchema,
  errors: ['STALE_RECORD'],
  roles: A,
});
export const getSignature = defineEndpoint({
  method: 'GET',
  path: '/company/signature',
  output: signatureResponseSchema,
  roles: A,
});
export const putSignature = defineEndpoint({
  method: 'PUT',
  path: '/company/signature',
  input: signatureSchema,
  output: signatureVersionSchema,
  roles: A,
});
export const getStamp = defineEndpoint({
  method: 'GET',
  path: '/company/stamp',
  output: stampResponseSchema,
  roles: A,
});
export const putStamp = defineEndpoint({
  method: 'PUT',
  path: '/company/stamp',
  input: stampSchema,
  output: stampResponseSchema.shape.history.element,
  roles: A,
});
export const getOfficialStatus = defineEndpoint({
  method: 'GET',
  path: '/company/official-status',
  output: officialStatusSchema,
  roles: ['apoderada', 'operador'],
});
export const getSettings = defineEndpoint({ method: 'GET', path: '/settings', output: settingsDtoSchema, roles: A });
export const patchSettings = defineEndpoint({
  method: 'PATCH',
  path: '/settings',
  input: editSettingsSchema,
  output: settingsDtoSchema,
  errors: ['STALE_RECORD'],
  roles: A,
});
export const postInstallationCode = defineEndpoint({
  method: 'POST',
  path: '/settings/installation-code',
  input: installationCodeChangeSchema,
  errors: ['INSTALL_CODE_INVALID'],
  roles: A,
});
