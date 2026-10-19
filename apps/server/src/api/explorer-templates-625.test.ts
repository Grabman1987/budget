import { createBooking, createTestDatabase, getBooking } from '@budget/db';
import {
  explorerTemplate,
  explorerTemplateSources,
  explorerTemplateSummaries,
  type ExplorerTemplateFacts,
} from '@budget/domain';
import { Hono } from 'hono';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});
function setup(denied = false) {
  const opened = createTestDatabase();
  const webDir = mkdtempSync(join(tmpdir(), 'budget-625-'));
  writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Synthetic</title>');
  cleanup.push(() => {
    opened.close();
    rmSync(webDir, { recursive: true, force: true });
  });
  opened.sqlite.exec(`
    INSERT INTO account (id,name,type,role,on_budget,opening_date) VALUES
      ('budget','Synthetic checking','checking','budget',1,'2024-01-01');
    INSERT INTO category_group (id,name) VALUES ('g','Synthetic group');
    INSERT INTO category (id,group_id,name,class,kind) VALUES
      ('food','g','Lebensmittel','need','variable'),
      ('fun','g','Freizeit','want','variable'),
      ('saving','g','Rücklage','future','invest');
  `);
  const book = (
    date: string,
    amountCents: number,
    splits: { amountCents: number; categoryId?: string; incomeTypeId?: string }[],
  ) =>
    createBooking(
      opened.db,
      { accountId: 'budget', date, amountCents, incomeNextMonth: false, splits },
      { actor: 'synthetic-fixture' },
    );
  book('2024-01-02', 10001, [{ amountCents: 10001, incomeTypeId: 'income-salary' }]);
  book('2024-01-03', 777, [{ amountCents: 777, incomeTypeId: 'income-capital' }]);
  const shared = book('2024-01-04', -1502, [
    { amountCents: -1001, categoryId: 'food' },
    { amountCents: -501, categoryId: 'fun' },
  ]);
  book('2024-01-05', -2000, [{ amountCents: -2000, categoryId: 'saving' }]);
  book('2024-02-02', 20002, [{ amountCents: 20002, incomeTypeId: 'income-salary' }]);
  book('2024-02-03', 888, [{ amountCents: 888, incomeTypeId: 'income-capital' }]);
  book('2024-02-04', -2002, [{ amountCents: -2002, categoryId: 'food' }]);
  book('2024-02-05', 1, [{ amountCents: 1, categoryId: 'food' }]);
  book('2024-02-06', -1000, [{ amountCents: -1000, categoryId: 'fun' }]);
  book('2024-02-07', -3000, [{ amountCents: -3000, categoryId: 'saving' }]);
  book('2024-03-02', 30003, [{ amountCents: 30003, incomeTypeId: 'income-salary' }]);
  book('2024-03-04', -700, [{ amountCents: -700, categoryId: 'food' }]);
  const auth: AuthGate = {
    routes: new Hono(),
    originGuard: async (_c, next) => next(),
    requireSession: async (context, next) =>
      denied ? context.json({ error: 'unauthenticated' }, 401) : next(),
    requireStepUp: async (context) => context.json({ error: 'step_up_required' }, 403),
  };
  const sharedBooking = getBooking(opened.db, shared);
  if (!sharedBooking) throw new Error('Synthetic split booking was not read back');
  return {
    opened,
    shared: sharedBooking,
    app: createApp({ webDir, auth, ledger: { db: opened.db, today: () => '2024-03-05' } }),
  };
}

describe('625 templates reuse the existing authenticated canonical report read', () => {
  it('returns literal all-four-template values and independent replaced-report facts without a database write', async () => {
    const { app, opened } = setup();
    const before = opened.sqlite.serialize();
    const response = await app.request('/api/report-tables/income-expense');
    expect(response.status).toBe(200);
    const facts = (await response.json()) as ExplorerTemplateFacts;
    const oldResponse = await app.request('/api/report-tables/months');
    const old = (await oldResponse.json()) as ExplorerTemplateFacts;
    expect(facts.months).toEqual(old.months);
    expect(facts.months.map((month) => month.spending['food'])).toEqual([1001, 2001, 700]);
    const heat = explorerTemplate(facts, { id: 'heatmap', period: '1J' });
    const year = explorerTemplate(facts, { id: 'year', period: 'YTD', year: 2024 });
    const total = explorerTemplate(facts, { id: 'total', period: '3J' });
    const trend = explorerTemplate(facts, { id: 'category', period: '1J', categoryId: 'food' });
    expect(heat.rows.find((row) => row.key === 'cat:food')!.vals).toEqual([1001, 2001]);
    expect(explorerTemplateSummaries(year.rows.find((row) => row.key === 'cat:food')!)).toEqual({
      total: 3002,
      average: 1501,
    });
    expect(total.rows.find((row) => row.key === 'inc')!.vals).toEqual([10001, 20002, 30003]);
    expect(total.rows.find((row) => row.key === 'future')!.vals).toEqual([2000, 3000, 0]);
    expect(trend.rows[0]!.vals).toEqual([1001, 2001]);
    expect(explorerTemplateSummaries(trend.rows[0]!)).toEqual({ total: 3002, average: 1501 });
    for (const model of [heat, year, total, trend])
      for (const row of model.rows) {
        if (row.kind === 'pct') continue;
        for (const [index, cents] of row.vals.entries()) {
          const sources = explorerTemplateSources(facts, model, row.key, model.months[index]!);
          expect(
            sources.reduce((sum, source) => sum + source.cents, 0),
            `${model.id}/${row.key}/${index}`,
          ).toBe(cents ?? 0);
        }
      }
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
  });

  it('keeps a split booking cash amount distinct from its selected category contribution', async () => {
    const { app, shared } = setup();
    const facts = (await (
      await app.request('/api/report-tables/income-expense')
    ).json()) as ExplorerTemplateFacts;
    const model = explorerTemplate(facts, { id: 'category', period: '1J', categoryId: 'food' });
    expect(explorerTemplateSources(facts, model, 'cat:food', '2024-01')).toEqual([
      { bookingId: shared.id, date: '2024-01-04', cents: 1001 },
    ]);
    const response = await app.request(`/api/bookings?ids=${shared.id}`);
    expect(response.status).toBe(200);
    const raw = (await response.json()) as {
      items: { id: string; amountCents: number; splits: { amountCents: number }[] }[];
    };
    expect(raw.items).toHaveLength(1);
    expect(raw.items[0]).toMatchObject({ id: shared.id, amountCents: -1502 });
    expect(raw.items[0]!.splits.map((split) => split.amountCents)).toEqual([-1001, -501]);
    // The literal -1502 cash source has two category shares; the clicked cell is +1001 spent.
    expect(shared.amountCents).toBe(-1502);
    expect(shared.splits.map((split) => split.amountCents)).toEqual([-1001, -501]);
  });

  it('requires the normal session for classified template sources and exposes no replacement unauthenticated route', async () => {
    const { app, opened } = setup(true);
    const before = opened.sqlite.serialize();
    expect((await app.request('/api/report-tables/income-expense')).status).toBe(401);
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
  });
});
