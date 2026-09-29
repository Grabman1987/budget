import { expect, test as setup } from '@playwright/test';
import { SoftAuthenticator } from '../apps/server/src/auth/testing/authenticator';
import { E2E_SETUP_TOKEN, MAIN_URL, STORAGE_STATE } from '../playwright.config';

/**
 * Bootstraps the main test server: the first passkey is registered through the API with a
 * software authenticator (real WebAuthn verification on the server); the resulting session
 * cookie is stored for the desktop and phone projects.
 */
setup('register the first passkey and store the session', async ({ request }) => {
  const headers = { origin: MAIN_URL, 'content-type': 'application/json' };
  const device = new SoftAuthenticator({ rpID: 'localhost', origin: MAIN_URL });

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

  await request.storageState({ path: STORAGE_STATE });
});
