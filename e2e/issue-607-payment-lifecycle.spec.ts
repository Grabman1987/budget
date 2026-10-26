import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { addDays, addMonths, todayInVienna } from '@budget/domain';
import { expect, type Locator, type Page, type Request, type TestInfo } from '@playwright/test';
import { test } from './isolated-ledger';

// Audit timestamps use the real SQLite clock. Pin both application clocks to the actual
// Vienna day, rather than pretending a past fixture day proves a forward audited cutoff.
const TODAY = todayInVienna();
const MONTH = TODAY.slice(0, 7);
const START = `${addMonths(MONTH, -2)}-01`;
const PAST = `${addMonths(MONTH, -1)}-25`;
const ASSIGNED = `${addMonths(MONTH, 1)}-25`;
const THROUGH = `${addMonths(MONTH, 2)}-28`;
const END_FROM = `${addMonths(MONTH, 1)}-01`;
test.use({ ledgerToday: TODAY });
const displayDay = (day: string) => day.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3.$2.$1');

interface DetailRow {
  occurrenceId: string | null;
  dueDate: string;
  expectedAmountCents: number;
  status: string;
  booking: { id: string; amountCents: number; date: string } | null;
}
interface Detail {
  history: DetailRow[];
  future: DetailRow[];
}
interface Listed {
  id: string;
  accountId: string | null;
  endDate: string | null;
  lifecycle: {
    pauses: Array<{ fromDate: string; throughDate: string }>;
    endedFrom: string | null;
    endEvidence: string;
    deletion: string;
    reviewToken: string | null;
  };
}
async function post<T>(page: Page, origin: string, path: string, data: unknown, status = 200) {
  const response = await page.request.post(origin + '/api' + path, { data, headers: { origin } });
  expect(response.status(), await response.text()).toBe(status);
  return response.json() as Promise<T>;
}
async function detail(page: Page, id: string): Promise<Detail> {
  const response = await page.request.get(`/api/expected/${id}/detail`);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  return response.json() as Promise<Detail>;
}
async function listed(page: Page, id: string) {
  const response = await page.request.get('/api/expected');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { payments: Listed[] };
  const found = body.payments.find((payment) => payment.id === id);
  expect(found).toBeTruthy();
  return found!;
}
async function account(page: Page, origin: string, name: string) {
  return (
    await post<{ account: { id: string } }>(
      page,
      origin,
      '/accounts',
      {
        name,
        type: 'checking',
        onBudget: true,
        openingDate: START,
        openingBalanceCents: 100000,
      },
      201,
    )
  ).account.id;
}
async function seed(page: Page, origin: string) {
  const accountId = await account(page, origin, 'Synthetic lifecycle account');
  const { payment } = await post<{ payment: { id: string } }>(
    page,
    origin,
    '/expected',
    {
      name: 'Synthetic lifecycle payment',
      kind: 'outflow',
      accountId,
      amountCents: 1234,
      rhythm: 'monthly',
      dueDay: 25,
      dateShift: 'none',
      startDate: START,
      validFrom: START,
    },
    201,
  );
  const before = await detail(page, payment.id);
  for (const day of [PAST, ASSIGNED]) {
    const occurrence = [...before.history, ...before.future].find((row) => row.dueDate === day);
    expect(occurrence?.occurrenceId).toBeTruthy();
    const booked = await post<{ id: string }>(
      page,
      origin,
      '/bookings',
      {
        type: 'booking',
        accountId,
        date: day,
        amountCents: -1334,
        status: 'confirmed',
      },
      201,
    );
    await post(page, origin, `/expected/occurrences/${occurrence!.occurrenceId}/link`, {
      bookingId: booked.id,
    });
  }
  return { paymentId: payment.id, accountId };
}
async function undoToast(page: Page) {
  await page
    .locator('.toast.is-open')
    .getByRole('button', { name: 'Rückgängig', exact: true })
    .click();
  await expect(page.locator('.toast.is-open')).toContainText('Rückgängig gemacht.');
}
async function openAction(page: Page, kind: 'pause' | 'end') {
  const opener = page.getByRole('button', {
    name: kind === 'pause' ? 'Pausieren bis' : 'Beenden ab',
    exact: true,
  });
  await opener.focus();
  await expect(opener).toBeFocused();
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', {
    name: kind === 'pause' ? 'Zahlung pausieren' : 'Zahlung beenden',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return { opener, dialog };
}

test('real pause/end and whole Undo preserve assigned cents, identities and history; stale explicit end refuses a changed source', async ({
  page,
  isolatedLedger,
}) => {
  test.setTimeout(60_000); // Two audited mutations, two real whole-group Undo actions and a stale editor.
  const { paymentId } = await seed(page, isolatedLedger.origin);
  const before = await detail(page, paymentId);
  const originalAssigned = before.future.find((row) => row.dueDate === ASSIGNED)!;
  expect(originalAssigned).toMatchObject({
    expectedAmountCents: -1234,
    booking: { amountCents: -1334 },
  });
  expect(before.history.find((row) => row.dueDate === PAST)).toMatchObject({
    expectedAmountCents: -1234,
    booking: { amountCents: -1334 },
  });
  await page.goto(`/plan/erwartet/${paymentId}`);
  await expect(page.getByRole('button', { name: 'Löschen', exact: true })).toHaveCount(0);
  const pause = await openAction(page, 'pause');
  const pausePosts: string[] = [];
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === `/api/expected/${paymentId}/pause` &&
      request.method() === 'POST'
    )
      pausePosts.push(request.postData() ?? '');
  });
  const pauseInput = pause.dialog.getByLabel('Pausieren bis einschließlich', { exact: true });
  await pauseInput.fill(displayDay(addDays(TODAY, -1)));
  await expect
    .poll(() => pauseInput.evaluate((element) => (element as HTMLInputElement).validity.valid))
    .toBe(false);
  await pause.dialog.getByRole('button', { name: 'Pause speichern', exact: true }).click();
  await expect(pause.dialog.getByText('Bitte heute oder einen späteren Tag wählen.')).toBeVisible();
  expect(pausePosts).toEqual([]);
  await pauseInput.fill(displayDay(THROUGH));
  await pause.dialog.getByRole('button', { name: 'Pause speichern', exact: true }).click();
  await expect(pause.dialog).toBeHidden();
  expect(pausePosts).toHaveLength(1);
  expect(JSON.parse(pausePosts[0]!)).toMatchObject({ throughDate: THROUGH });
  expect((await listed(page, paymentId)).lifecycle.pauses).toEqual([
    { fromDate: TODAY, throughDate: THROUGH },
  ]);
  const paused = await detail(page, paymentId);
  expect(paused.history).toEqual(before.history);
  expect(paused.future.find((row) => row.dueDate === ASSIGNED)).toEqual(originalAssigned);
  expect(paused.future.filter((row) => row.booking === null && row.dueDate <= THROUGH)).toEqual([]);
  await undoToast(page);
  expect(await detail(page, paymentId)).toEqual(before);
  expect((await listed(page, paymentId)).lifecycle.pauses).toEqual([]);

  const end = await openAction(page, 'end');
  await end.dialog.getByLabel('Beenden ab', { exact: true }).fill(displayDay(END_FROM));
  await end.dialog.getByRole('button', { name: 'Beenden bestätigen', exact: true }).click();
  await expect(end.dialog).toBeHidden();
  expect((await listed(page, paymentId)).lifecycle).toMatchObject({
    endedFrom: END_FROM,
    endEvidence: 'proven',
  });
  const ended = await detail(page, paymentId);
  expect(ended.history).toEqual(before.history);
  expect(ended.future.find((row) => row.dueDate === ASSIGNED)).toEqual(originalAssigned);
  expect(ended.future.filter((row) => row.booking === null && row.dueDate >= END_FROM)).toEqual([]);
  await undoToast(page);
  expect(await detail(page, paymentId)).toEqual(before);
  expect((await listed(page, paymentId)).endDate).toBeNull();

  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Zahlung bearbeiten', exact: true });
  await expect(edit.getByLabel('Letzte Fälligkeit einschließlich')).toHaveJSProperty(
    'readOnly',
    true,
  );
  await expect(edit).toContainText('„Beenden ab“');
  await edit.getByRole('button', { name: 'Abbrechen', exact: true }).click();

  const stale = await openAction(page, 'end');
  const reviewedToken = (await listed(page, paymentId)).lifecycle.reviewToken;
  const otherAccount = await account(page, isolatedLedger.origin, 'Synthetic changed source');
  const changed = await page.request.patch(`/api/expected/${paymentId}`, {
    data: { accountId: otherAccount },
    headers: { origin: isolatedLedger.origin },
  });
  expect(changed.status(), await changed.text()).toBe(200);
  const afterIndependentEdit = await detail(page, paymentId);
  const listedAfterEdit = await listed(page, paymentId);
  expect(listedAfterEdit.lifecycle.reviewToken).not.toBe(reviewedToken);
  await stale.dialog.getByLabel('Beenden ab', { exact: true }).fill(displayDay(END_FROM));
  const response = page.waitForResponse(
    (reply) =>
      new URL(reply.url()).pathname === `/api/expected/${paymentId}/end` &&
      reply.request().method() === 'POST',
  );
  await stale.dialog.getByRole('button', { name: 'Beenden bestätigen', exact: true }).click();
  const refused = await response;
  expect(refused.status()).toBe(409);
  expect(refused.request().postDataJSON()).toEqual({
    fromDate: END_FROM,
    reviewToken: reviewedToken,
  });
  await expect(stale.dialog).toBeVisible();
  await expect(stale.dialog.getByLabel('Beenden ab', { exact: true })).toHaveValue(
    displayDay(END_FROM),
  );
  expect(await detail(page, paymentId)).toEqual(afterIndependentEdit);
  expect(await listed(page, paymentId)).toEqual(listedAfterEdit);
});

async function theme(page: Page, value: 'light' | 'dark') {
  const resolved = () =>
    page.evaluate(() =>
      document.documentElement.dataset['theme'] === 'dark' ||
      (document.documentElement.dataset['theme'] !== 'light' &&
        matchMedia('(prefers-color-scheme: dark)').matches)
        ? 'dark'
        : 'light',
    );
  if ((await resolved()) !== value) {
    if (page.viewportSize()!.width < 768) {
      const summary = page.locator('.m-profile > summary');
      await summary.click();
      await page
        .locator('.m-profile')
        .getByRole('button', {
          name: value === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
          exact: true,
        })
        .click();
      await summary.click();
    } else
      await page
        .locator('.sidebar-foot')
        .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
        .click();
  }
  await expect.poll(resolved).toBe(value);
}
async function target44(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}
async function inspect(
  page: Page,
  info: TestInfo,
  id: string,
  value: 'light' | 'dark',
  profile: string,
) {
  await page.goto(`/plan/erwartet/${id}`);
  await theme(page, value);
  await expect(page.locator('.xp-big')).toContainText('−12,34 €');
  const before = await detail(page, id);
  const paymentWrites: string[] = [];
  const observe = (request: Request) => {
    if (new URL(request.url()).pathname.startsWith('/api/expected') && request.method() !== 'GET')
      paymentWrites.push(request.method());
  };
  page.on('request', observe);
  try {
    for (const kind of ['pause', 'end'] as const) {
      const { dialog, opener } = await openAction(page, kind);
      const input = dialog.getByLabel(
        kind === 'pause' ? 'Pausieren bis einschließlich' : 'Beenden ab',
        { exact: true },
      );
      await input.focus();
      await expect(input).toBeFocused();
      await input.fill(displayDay(addDays(TODAY, -1)));
      await expect
        .poll(() => input.evaluate((element) => (element as HTMLInputElement).validity.valid))
        .toBe(false);
      await input.fill(displayDay(kind === 'pause' ? THROUGH : END_FROM));
      await expect(input).toHaveValue(displayDay(kind === 'pause' ? THROUGH : END_FROM));
      await expect
        .poll(() => input.evaluate((element) => (element as HTMLInputElement).validity.valid))
        .toBe(true);
      await target44(input);
      for (const button of await dialog.locator('.xp-lifecycle button').all())
        await target44(button);
      await page.evaluate(() => document.fonts.ready);
      const violations = (await new AxeBuilder({ page }).include('dialog[open]').analyze())
        .violations;
      expect(violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await input.press('Tab');
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath(`lifecycle-${profile}-${value}-${kind}.png`),
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
      await target44(opener);
    }
    await page.keyboard.press('Control+Shift+H');
    await expect(page.locator('.xp-big')).toContainText('•••');
    const text = await page.locator('.xp-panel').innerText();
    expect(text).not.toContain('12,34');
    expect(text).not.toContain('13,34');
    await page.screenshot({
      path: info.outputPath(`lifecycle-${profile}-${value}-privacy.png`),
      animations: 'disabled',
    });
    await page.keyboard.press('Control+Shift+H');
    await expect(page.locator('.xp-big')).toContainText('−12,34 €');
    expect(await detail(page, id)).toEqual(before);
    expect(paymentWrites).toEqual([]);
    const path = info.outputPath(`lifecycle-${profile}-${value}-runtime.json`);
    await writeFile(
      path,
      JSON.stringify(
        {
          engine: page.context().browser()!.browserType().name(),
          project: info.project.name,
          profile,
          theme: value,
          viewport: page.viewportSize(),
          synthetic: true,
          scopedAxe: 'both open lifecycle dialogs, all rules enabled',
          paymentWrites,
          ...(await page.evaluate(() => ({
            coarse: matchMedia('(pointer: coarse)').matches,
            maxTouchPoints: navigator.maxTouchPoints,
            dpr: devicePixelRatio,
          }))),
        },
        null,
        2,
      ),
    );
    await info.attach(`lifecycle-${profile}-${value}-runtime`, {
      path,
      contentType: 'application/json',
    });
  } finally {
    page.off('request', observe);
  }
}

for (const value of ['light', 'dark'] as const) {
  test(`${value}: lifecycle controls preserve keyboard focus, date input, touch targets and privacy on the actual engine`, async ({
    page,
    browser,
    isolatedLedger,
  }, info) => {
    test.setTimeout(60_000); // WebKit additionally inspects the genuine desktop-layout context.
    const { paymentId } = await seed(page, isolatedLedger.origin);
    await inspect(page, info, paymentId, value, info.project.name);
    if (browser.browserType().name() === 'webkit') {
      const context = await browser.newContext({
        baseURL: isolatedLedger.origin,
        storageState: isolatedLedger.storageState,
        viewport: { width: 1440, height: 900 },
        isMobile: false,
        hasTouch: false,
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      });
      try {
        const desktop = await context.newPage();
        await desktop.clock.setFixedTime(new Date(`${TODAY}T12:00:00+02:00`));
        await inspect(desktop, info, paymentId, value, 'webkit-desktop-layout1440');
      } finally {
        await context.close();
      }
    }
  });
}
