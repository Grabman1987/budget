import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { openDatabase, schema } from '@budget/db';
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-20' });

test('bank candidates precede reminders and remain isolated review work in the account before explicit merge confirmation and Undo', async ({
  page,
  browser,
  request,
  isolatedLedger,
}, info) => {
  const { origin, databasePath, storageState } = isolatedLedger;
  const post = async (path: string, data: unknown) => {
    const response = await request.post(origin + '/api' + path, { headers: { origin }, data });
    expect(response.status()).toBe(201);
    return response.json();
  };
  const first = (
    await post('/accounts', {
      name: 'Konto A 724',
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 100000,
    })
  ).account as { id: string };
  const second = (
    await post('/accounts', {
      name: 'Konto B 724',
      type: 'savings',
      openingDate: '2026-01-01',
      openingBalanceCents: 100000,
    })
  ).account as { id: string };
  const depot = (
    await post('/accounts', { name: 'Depot 724', type: 'brokerage', openingDate: '2026-01-01' })
  ).account as { id: string };
  await post('/bookings', {
    type: 'booking',
    accountId: first.id,
    date: '2026-09-01',
    amountCents: -777,
    status: 'pending',
    memo: 'Manuelle offene Buchung 724',
  });
  const candidateA = randomUUID();
  const candidateB = randomUUID();
  const candidateDepot = randomUUID();
  const opened = openDatabase(databasePath);
  try {
    // Equal display names are legal legacy data; create API names remain unique.
    opened.db.update(schema.account).set({ name: 'Gleiches Konto 724' }).run();
    for (const [id, accountId, amountCents, memo] of [
      [candidateA, first.id, -1201, 'Bankkandidat A 724'],
      [candidateB, second.id, -9909, 'Bankkandidat B 724'],
      [candidateDepot, depot.id, -3311, 'Bankkandidat Depot 724'],
    ] as const) {
      opened.db
        .insert(schema.bankSyncCandidate)
        .values({
          id,
          accountId,
          date: '2026-10-19',
          amountCents,
          currency: 'EUR',
          dedupeKey: id,
          memo,
        })
        .run();
      opened.db
        .insert(schema.inboxItem)
        .values({
          id,
          kind: 'import',
          title: 'Bankumsatz prüfen',
          refType: 'bank-sync-candidate',
          refId: id,
        })
        .run();
    }
    const state = () => ({
      accounts: opened.db.select().from(schema.account).all(),
      bookings: opened.db.select().from(schema.booking).all(),
      splits: opened.db.select().from(schema.bookingSplit).all(),
      audit: opened.db.select().from(schema.auditLog).all(),
      candidates: opened.db.select().from(schema.bankSyncCandidate).all(),
      inbox: opened.db.select().from(schema.inboxItem).all(),
    });
    const before = state();
    const balances = async (client: APIRequestContext) => {
      const response = await client.get(origin + '/api/accounts');
      expect(response.status()).toBe(200);
      const accounts = (await response.json()).accounts as { id: string; balanceCents: number }[];
      return [
        accounts.find((row) => row.id === first.id)!.balanceCents,
        accounts.find((row) => row.id === second.id)!.balanceCents,
      ];
    };
    expect(await balances(request)).toEqual([99223, 100000]);
    const reminders = await request.get(origin + '/api/accounts/reminders');
    expect(reminders.status()).toBe(200);
    expect(
      (await reminders.json()).reminders.some(
        (row: { accountId: string }) => row.accountId === first.id,
      ),
    ).toBe(true);
    const writes: string[] = [];
    page.on('request', (incoming) => {
      if (
        new URL(incoming.url()).pathname.startsWith('/api/') &&
        !['GET', 'HEAD', 'OPTIONS'].includes(incoming.method())
      )
        writes.push(incoming.method());
    });
    await page.goto('/konten/pruefen?von=%2F');
    const globalCandidate = page.getByTestId('inbox-row').filter({ hasText: 'Bankkandidat A 724' });
    await expect(globalCandidate).toBeVisible();
    const reminder = page.getByRole('heading', { name: 'Konten prüfen', exact: true });
    await expect(reminder).toBeVisible();
    expect(
      await globalCandidate.evaluate((node) =>
        Boolean(
          node.compareDocumentPosition(document.getElementById('account-reminder-title')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
    ).toBe(true);
    const proof: object[] = [];
    const desktop = await browser.newContext({
      baseURL: origin,
      storageState,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      reducedMotion: 'reduce',
    });
    try {
      const desktopPage = await desktop.newPage();
      await desktopPage.clock.setFixedTime(new Date('2026-10-20T12:00:00+02:00'));
      desktopPage.on('request', (incoming) => {
        if (
          new URL(incoming.url()).pathname.startsWith('/api/') &&
          !['GET', 'HEAD', 'OPTIONS'].includes(incoming.method())
        )
          writes.push(incoming.method());
      });
      for (const [view, profile] of [
        [page, 'configured'],
        [desktopPage, 'desktop1440'],
      ] as const) {
        await view.goto(
          `/konten/${first.id}?bankSource=${candidateB}&aufgaben=historical&teil=aufgaben`,
        );
        const queue = view.getByRole('region', { name: 'Bankumsätze prüfen', exact: true });
        const row = queue.getByTestId('inbox-row');
        const heading = view.getByRole('heading', { name: 'Gleiches Konto 724', exact: true });
        await expect(heading).toBeVisible();
        const balance = view.getByTestId('account-balance');
        await expect(balance).toContainText('992,23');
        expect(
          await heading.evaluate((node) =>
            Boolean(
              node.compareDocumentPosition(document.querySelector('.kinbox')!) &
              Node.DOCUMENT_POSITION_FOLLOWING,
            ),
          ),
        ).toBe(true);
        expect(
          await balance.evaluate((node) =>
            Boolean(
              node.compareDocumentPosition(document.querySelector('.kinbox')!) &
              Node.DOCUMENT_POSITION_FOLLOWING,
            ),
          ),
        ).toBe(true);
        await expect(row).toHaveCount(1);
        await expect(row).toContainText('Bankkandidat A 724');
        await expect(queue).not.toContainText('Bankkandidat B 724');
        await expect(queue).not.toContainText('Manuelle offene Buchung 724');
        await expect(queue.getByRole('checkbox')).toHaveCount(0);
        await expect(
          queue.getByRole('button', { name: 'Nicht übernehmen', exact: true }),
        ).toBeVisible();
        for (const theme of ['light', 'dark'] as const) {
          await view.evaluate((value) => {
            document.documentElement.dataset.theme = value;
          }, theme);
          await row.scrollIntoViewIfNeeded();
          const action = queue.getByRole('button', { name: 'Nicht übernehmen', exact: true });
          const rect = await action.boundingBox();
          expect(rect).not.toBeNull();
          expect(rect!.width).toBeGreaterThanOrEqual(44);
          expect(rect!.height).toBeGreaterThanOrEqual(44);
          expect(
            await view.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await view.screenshot({
            path: info.outputPath(`bank-review-${profile}-${theme}.png`),
            fullPage: false,
          });
          expect(
            (await new AxeBuilder({ page: view }).include('main').analyze()).violations,
          ).toEqual([]);
          proof.push({
            profile,
            theme,
            engine: browser.browserType().name(),
            viewport: view.viewportSize(),
            candidateIds: [candidateA],
            balances: [99223, 100000],
            actionRect: rect,
          });
          expect(state()).toEqual(before);
        }
        await view.goto(`/konten/${second.id}`);
        const otherQueue = view.getByRole('region', { name: 'Bankumsätze prüfen', exact: true });
        await expect(otherQueue.getByTestId('inbox-row')).toHaveCount(1);
        await expect(otherQueue).toContainText('Bankkandidat B 724');
        await expect(otherQueue).not.toContainText('Bankkandidat A 724');
      }
    } finally {
      await desktop.close();
    }
    await page.goto(`/konten/${depot.id}`);
    const depotQueue = page.getByRole('region', { name: 'Bankumsätze prüfen', exact: true });
    await expect(depotQueue.getByTestId('inbox-row')).toHaveCount(1);
    await expect(depotQueue).toContainText('Bankkandidat Depot 724');
    await expect(depotQueue).not.toContainText('Bankkandidat A 724');
    const depotValue = page.getByTestId('depot-value');
    await expect(depotValue).toBeVisible();
    expect(
      await depotValue.evaluate((node) =>
        Boolean(
          node.compareDocumentPosition(document.querySelector('.kinbox')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
    ).toBe(true);
    expect(writes).toEqual([]);
    expect(state()).toEqual(before);
    await writeFile(info.outputPath('bank-review-safe-proof.json'), JSON.stringify(proof, null, 2));
    await info.attach('bank-review-safe-proof', {
      path: info.outputPath('bank-review-safe-proof.json'),
      contentType: 'application/json',
    });

    // With bank transport deliberately unconfigured in this isolated ledger, use the existing
    // real merge-confirmation path, not a mocked new-candidate confirmation response.
    const manual = (await post('/bookings', {
      type: 'booking',
      accountId: first.id,
      date: '2026-10-18',
      amountCents: -1201,
      status: 'pending',
      memo: 'Bewusst erfasste passende Buchung 724',
    })) as { id: string; groupId: string };
    expect(await balances(request)).toEqual([98022, 100000]);
    await page.goto(`/konten/${first.id}`);
    const queue = page.getByRole('region', { name: 'Bankumsätze prüfen', exact: true });
    await queue.locator('.bank-review summary').click();
    const confirmed = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `/api/bank-sync/candidates/${candidateA}/merge`,
    );
    await queue.getByRole('button', { name: /Mit Buchung .* zusammenführen/ }).click();
    const confirmation = await confirmed;
    expect(confirmation.status()).toBe(200);
    const saved = (await confirmation.json()) as { groupId: string };
    const merged = await request.get(origin + `/api/bookings/${manual.id}`);
    expect((await merged.json()).booking).toMatchObject({
      accountId: first.id,
      amountCents: -1201,
      status: 'confirmed',
    });
    await expect(queue.getByTestId('inbox-row')).toHaveCount(0);
    expect(await balances(request)).toEqual([98022, 100000]);
    const undo = await request.post(origin + '/api/undo', {
      headers: { origin },
      data: { groupId: saved.groupId },
    });
    expect(undo.status()).toBe(200);
    expect(await balances(request)).toEqual([98022, 100000]);
    const pending = await request.get(origin + `/api/bookings/${manual.id}`);
    expect((await pending.json()).booking).toMatchObject({ amountCents: -1201, status: 'pending' });
    const undoManual = await request.post(origin + '/api/undo', {
      headers: { origin },
      data: { groupId: manual.groupId },
    });
    expect(undoManual.status()).toBe(200);
    await page.reload();
    await expect(queue.getByTestId('inbox-row')).toHaveCount(1);
    expect(await balances(request)).toEqual([99223, 100000]);
    const dismissed = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `/api/inbox/${candidateA}/resolve`,
    );
    await queue.getByRole('button', { name: 'Nicht übernehmen', exact: true }).click();
    const dismissal = await dismissed;
    expect(dismissal.status()).toBe(200);
    const result = (await dismissal.json()) as { groupId: string };
    await expect(queue.getByTestId('inbox-row')).toHaveCount(0);
    expect(await balances(request)).toEqual([99223, 100000]);
    const restored = await request.post(origin + '/api/undo', {
      headers: { origin },
      data: { groupId: result.groupId },
    });
    expect(restored.status()).toBe(200);
    await page.reload();
    await expect(queue.getByTestId('inbox-row')).toHaveCount(1);
    expect(await balances(request)).toEqual([99223, 100000]);
    const bookings = await request.get(origin + `/api/bookings?accountId=${first.id}`);
    const items = (await bookings.json()).items as { amountCents: number; status: string }[];
    expect(items.map(({ amountCents, status }) => ({ amountCents, status }))).toEqual([
      { amountCents: -777, status: 'pending' },
    ]);
  } finally {
    opened.close();
  }
});
