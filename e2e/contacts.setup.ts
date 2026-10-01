import { test as setup } from '@playwright/test';
import { CONTACTS_URL, STORAGE_STATE_CONTACTS } from '../playwright.config';
import { bootstrapPasskey } from './bootstrap';

/** The same passkey bootstrap as `sample.setup.ts`, against the contacts server. */
setup('register the first passkey on the contacts server', async ({ request }) => {
  await bootstrapPasskey(request, CONTACTS_URL, STORAGE_STATE_CONTACTS);
});
