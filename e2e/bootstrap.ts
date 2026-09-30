import { expect, type APIRequestContext } from '@playwright/test';
import { SoftAuthenticator } from '../apps/server/src/auth/testing/authenticator';
import { E2E_SETUP_TOKEN } from '../playwright.config';

/**
 * Registers the first passkey on a fresh test server through the API (software authenticator, real
 * WebAuthn verification on the server) and stores the resulting session cookie at `storagePath`.
 * `request` must be bound to the server's base URL.
 */
export async function bootstrapPasskey(
  request: APIRequestContext,
  origin: string,
  storagePath: string,
): Promise<void> {
  const headers = { origin, 'content-type': 'application/json' };
  const device = new SoftAuthenticator({ rpID: 'localhost', origin });

  const options = await request.post('/api/auth/register/options', {
    headers,
    data: { setupToken: E2E_SETUP_TOKEN },
  });
  expect(options.ok()).toBe(true);
  const { options: creation } = (await options.json()) as { options: { challenge: string } };

  const verify = await request.post('/api/auth/register/verify', {
    headers,
    data: { response: device.register(creation), deviceName: 'E2E' },
  });
  expect(verify.ok()).toBe(true);
  expect(((await verify.json()) as { recoveryCodes: string[] }).recoveryCodes).toHaveLength(10);

  await request.storageState({ path: storagePath });
}
