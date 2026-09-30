import { test as setup } from '@playwright/test';
import { MAIN_URL, STORAGE_STATE } from '../playwright.config';
import { bootstrapPasskey } from './bootstrap';

/**
 * Bootstraps the main test server: the first passkey is registered through the API with a
 * software authenticator (real WebAuthn verification on the server); the resulting session
 * cookie is stored for the desktop and phone projects.
 */
setup('register the first passkey and store the session', async ({ request }) => {
  await bootstrapPasskey(request, MAIN_URL, STORAGE_STATE);
});
