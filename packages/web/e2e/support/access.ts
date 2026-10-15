// T038 · Pasos de acceso compartidos por las pruebas de extremo a extremo: emparejar la app recién abierta (P-01) e
// iniciar sesión (P-03).
import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { confirmPairingCode } from './api';
import { E2E_IDENTITY, E2E_STATE_FILE } from './env';

export interface E2EUser {
  username: string;
  password: string;
  nationalId: string;
  phone: string;
  recoveryCodes: string[];
}
export interface E2EState {
  apoderada: { username: string; password: string };
  users: Record<'acceso' | 'perfil', Record<'phone' | 'tablet' | 'desktop', E2EUser>>;
}

export const readState = (): E2EState => JSON.parse(readFileSync(E2E_STATE_FILE, 'utf8')) as E2EState;

/** P-01: en TEL y TAB, por código confirmado en "la pantalla del servidor"; en la PC servidor, sola. */
export async function pairApp(page: Page, device: 'phone' | 'tablet' | 'desktop'): Promise<void> {
  if (device !== 'desktop') {
    await page.getByRole('button', { name: 'Emparejar con código' }).click();
    const shown = await page.locator('.auth-code').textContent();
    // El código que ve el dispositivo es el que muestra el servidor: si no, confirmPairingCode falla.
    await confirmPairingCode(shown!.replace(/\D/g, ''));
  }
  await expect(page.getByRole('heading', { name: `Emparejado con ${E2E_IDENTITY.name}` })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

export async function fillLogin(page: Page, username: string, password: string): Promise<void> {
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}
