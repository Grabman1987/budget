import { test as setup } from '@playwright/test';
import { SAMPLE_URL, STORAGE_STATE_SAMPLE } from '../playwright.config';
import { bootstrapPasskey } from './bootstrap';

/** The same passkey bootstrap as `auth.setup.ts`, against the seeded sample server. */
setup('register the first passkey on the sample server', async ({ request }) => {
  await bootstrapPasskey(request, SAMPLE_URL, STORAGE_STATE_SAMPLE);
});
