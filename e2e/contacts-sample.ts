import { test as base } from '@playwright/test';
import { CONTACTS_URL, STORAGE_STATE_CONTACTS } from '../playwright.config';
import { SAMPLE_NOW } from './sample';

export { CONTACTS_URL };

/**
 * `test` for specs that run against the contacts server: the seeded sample ledger on 17.09.2026
 * plus the opt-in contacts scenario (`withContactsScenario`, packages/fixtures). Its Auslagen move
 * cash, so it is a server of its own and the shared sample server keeps the prototype figures.
 * READ-ONLY: specs that write use the main server with entities of their own. The browser clock
 * is fixed to `SAMPLE_NOW`, light scheme and reduced motion by default.
 */
export const contactsTest = base.extend({
  baseURL: CONTACTS_URL,
  storageState: STORAGE_STATE_CONTACTS,
  colorScheme: ['light', { option: true }],
  reducedMotion: ['reduce', { option: true }],
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(new Date(SAMPLE_NOW));
    await use(page);
  },
});
