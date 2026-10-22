import AxeBuilder from '@axe-core/playwright';
import { accounts, createBooking, openDatabase, schema, stagePayslip } from '@budget/db';
import { expect, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { test } from './isolated-ledger';

test.use({ ledgerToday: '2026-10-20' });
async function theme(page: Page, desired: 'light' | 'dark') {
  const resolved = () =>
    page.evaluate(() => {
      const value = document.documentElement.dataset['theme'];
      return value === 'light' || value === 'dark'
        ? value
        : matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    });
  if ((await resolved()) !== desired) {
    if (page.viewportSize()!.width === 390) {
      const menu = page.locator('.m-profile > summary');
      await menu.click();
      await page
        .locator('.m-profile')
        .getByRole('button', {
          name: desired === 'dark' ? 'Dunkle Blaupause' : 'Heller Zeichenfilm',
          exact: true,
        })
        .click();
      await menu.click();
    } else
      await page
        .locator('.sidebar-foot')
        .getByRole('button', { name: 'Hell/Dunkel umschalten', exact: true })
        .click();
  }
  await expect.poll(resolved).toBe(desired);
}
async function hit(control: Locator) {
  // Center assisted scrolling clears the fixed phone tab bar; viewport-only minimum scrolling
  // can leave an otherwise reachable control beneath that overlay.
  await control.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }),
  );
  const box = await control.evaluate((element) => {
    const r = element.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      width: r.width,
      height: r.height,
      top: r.top,
      bottom: r.bottom,
      interceptor: top ? { tag: top.tagName, className: top.getAttribute('class') } : null,
      visible: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      hit: top === element || element.contains(top),
    };
  });
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.visible).toBe(true);
  expect(box.hit, JSON.stringify(box)).toBe(true);
}
async function singleLineText(control: Locator) {
  const geometry = await control.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const lines = Array.from(range.getClientRects());
    const bounds = element.getBoundingClientRect();
    return {
      lines: lines.length,
      contained: lines.every((line) => line.left >= bounds.left && line.right <= bounds.right),
    };
  });
  expect(geometry.lines).toBe(1);
  expect(geometry.contained).toBe(true);
}
for (const [profile, desired, viewport] of [
  ['desktop', 'light', { width: 1440, height: 900 }],
  ['desktop', 'dark', { width: 1440, height: 900 }],
  ['phone', 'light', { width: 390, height: 844 }],
  ['phone', 'dark', { width: 390, height: 844 }],
] as const)
  test(`566 real task sources, counts and read-only actions in ${profile} ${desired}`, async ({
    browser,
    isolatedLedger,
  }, info) => {
    const opened = openDatabase(isolatedLedger.databasePath),
      accountId = randomUUID();
    const ctx = { actor: 'synthetic-566' };
    accounts.create(
      opened.db,
      {
        id: accountId,
        name: 'Muster Prüfkonto',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2025-01-01',
        openingBalanceCents: 100000,
      },
      ctx,
    );
    createBooking(
      opened.db,
      {
        accountId,
        date: '2026-09-01',
        amountCents: -1201,
        memo: 'Synthetic assignment 566',
        splits: [{ amountCents: -1201 }],
      },
      ctx,
    );
    for (const [title, refType, kind] of [
      ['Synthetic Plan 566', 'savings_plan', 'other'],
      ['Synthetic unknown 566', 'unfamiliar-source', 'consent'],
    ] as const)
      opened.db
        .insert(schema.inboxItem)
        .values({ id: randomUUID(), title, refType, kind, createdAt: '2026-10-20T08:00:00Z' })
        .run();
    opened.db
      .insert(schema.receipt)
      .values({
        id: randomUUID(),
        storageKey: 'synthetic-566.pdf',
        mime: 'application/pdf',
        sha256: 'a'.repeat(64),
        sizeBytes: 100,
        originalFilename: 'synthetic-566.pdf',
      })
      .run();
    stagePayslip(
      opened.db,
      {
        sha256: 'b'.repeat(64),
        sizeBytes: 100,
        source: 'manual',
        filename: 'synthetic-payroll-566.pdf',
        parsed: {
          documentType: 'unknown',
          periodSource: null,
          payoutDate: null,
          draft: null,
          differenceCents: null,
          warnings: ['Synthetic review required'],
        },
      },
      ctx,
    );
    const snapshot = () =>
      JSON.stringify({
        bookings: opened.db.select().from(schema.booking).all(),
        splits: opened.db.select().from(schema.bookingSplit).all(),
        inbox: opened.db.select().from(schema.inboxItem).all(),
        receipts: opened.db.select().from(schema.receipt).all(),
        payroll: opened.db.select().from(schema.payslipIntake).all(),
        checks: opened.db.select().from(schema.accountReconciliation).all(),
        audit: opened.db.select().from(schema.auditLog).all(),
      });
    const before = snapshot(),
      writes: string[] = [];
    const context = await browser.newContext({
      baseURL: isolatedLedger.origin,
      storageState: isolatedLedger.storageState,
      viewport,
      isMobile: profile === 'phone',
      hasTouch: profile === 'phone',
      deviceScaleFactor: profile === 'phone' ? 3 : 1,
    });
    try {
      const page = await context.newPage();
      page.on('request', (request) => {
        if (
          new URL(request.url()).pathname.startsWith('/api/') &&
          !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
        )
          writes.push(request.method());
      });
      await page.goto('/konten/pruefen?teil=aufgaben');
      await theme(page, desired);
      const status = page.getByRole('region', { name: 'Bankstatus' });
      await expect(status).toContainText('Bank: nicht verbunden');
      await expect(page.getByRole('region', { name: 'Bankstatus' })).toHaveCount(1);
      const setup = status.getByRole('link', { name: 'Einrichten', exact: true });
      await expect(setup).toHaveAttribute('href', '/einstellungen/datenquellen');
      await hit(setup);
      const response = await page.request.get('/api/inbox?segment=aufgaben&limit=1');
      expect(response.status()).toBe(200);
      const model = (await response.json()) as {
        count: number;
        segments: { umsaetze: number; aufgaben: number };
        taskSources: Record<string, number>;
      };
      expect(model.segments).toEqual({ umsaetze: 1, aufgaben: 5 });
      expect(model.taskSources).toEqual({
        accounts: 1,
        plan: 1,
        receipts: 1,
        payslips: 1,
        other: 1,
      });
      expect(model.count).toBe(6);
      const pill = await page.request.get('/api/inbox/count');
      expect((await pill.json()).count).toBe(6);
      const sources = page.getByRole('table', { name: 'Alle offenen Aufgaben nach Quelle' });
      await expect(sources.getByRole('row')).toHaveCount(6);
      await singleLineText(sources.getByRole('columnheader', { name: 'Offen', exact: true }));
      for (const label of [
        'Konten prüfen',
        'Plan',
        'Belege ohne Buchung',
        'Gehaltszettel',
        'Weitere Aufgaben',
      ]) {
        const action = sources.getByRole('button', { name: `${label} öffnen`, exact: true });
        await hit(action);
        await singleLineText(action);
      }
      await expect(page.locator('html')).toHaveJSProperty('scrollWidth', viewport.width);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`task-sources-${profile}-${desired}.png`),
        fullPage: true,
      });
      await sources.getByRole('button', { name: 'Plan öffnen', exact: true }).click();
      await expect(page.getByText('Synthetic Plan 566', { exact: true })).toBeVisible();
      await sources.getByRole('button', { name: 'Weitere Aufgaben öffnen', exact: true }).click();
      await expect(page.getByText('Synthetic unknown 566', { exact: true })).toBeVisible();
      await sources
        .getByRole('button', { name: 'Belege ohne Buchung öffnen', exact: true })
        .click();
      await expect(page.getByText('synthetic-566.pdf', { exact: false })).toBeVisible();
      await sources.getByRole('button', { name: 'Gehaltszettel öffnen', exact: true }).click();
      await expect(page.getByRole('link', { name: 'Gehaltsreport', exact: true })).toHaveAttribute(
        'href',
        '/reports/gehalt',
      );
      await sources.getByRole('button', { name: 'Konten prüfen öffnen', exact: true }).click();
      await singleLineText(
        sources.getByRole('button', { name: 'Konten prüfen schließen', exact: true }),
      );
      const reminder = page.getByRole('link', { name: 'Kontostand prüfen', exact: true });
      await hit(reminder);
      await reminder.click();
      await expect(
        page.getByRole('dialog', { name: 'Kontostand prüfen · Muster Prüfkonto', exact: true }),
      ).toBeVisible();
      await page.goto('/konten/pruefen?teil=umsaetze');
      const row = page.getByTestId('inbox-row').filter({ hasText: 'Synthetic assignment 566' });
      await expect(row).toContainText('−12,01');
      await row.getByRole('button', { name: 'Zuordnen', exact: true }).click();
      const editor = page.getByRole('dialog', { name: 'Buchung bearbeiten', exact: true });
      await expect(editor).toBeVisible();
      await expect(editor.getByLabel('Betrag', { exact: true })).toHaveValue('12,01');
      expect(writes).toEqual([]);
      expect(snapshot()).toBe(before);
      await writeFile(
        info.outputPath(`task-sources-${profile}-${desired}.json`),
        JSON.stringify(
          {
            source: 'synthetic-only',
            engine: browser.browserType().name(),
            project: info.project.name,
            viewport,
            theme: desired,
            model,
            noWrites: true,
            preservedFinancialSnapshot: true,
            assistedScrollHitChecks: true,
            physicalDeviceClaim: false,
          },
          null,
          2,
        ),
      );
    } finally {
      try {
        await context.close();
      } finally {
        opened.close();
      }
    }
  });
