import { createBooking, createTestDatabase, type ExplorerReport } from '@budget/db';
import { Hono } from 'hono';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const query = (extra: Record<string, string> = {}) =>
  new URLSearchParams({
    dim: 'kategorie',
    cls: 'alle',
    cols: 'monat',
    period: '3M',
    meas: 'summe',
    ...extra,
  });
const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

function setup({
  empty = false,
  denied = false,
  many = false,
  today = (): string => '2024-03-05',
} = {}) {
  const opened = createTestDatabase();
  const webDir = mkdtempSync(join(tmpdir(), 'budget-explorer-csv-627-'));
  writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Synthetic</title>');
  cleanup.push(() => {
    opened.close();
    rmSync(webDir, { recursive: true, force: true });
  });
  if (!empty) {
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date)
      VALUES ('budget','Synthetic checking','checking','budget',1,'2024-01-01');
      INSERT INTO category_group (id,name) VALUES ('g','Synthetic group');
    `);
    const insert = opened.sqlite.prepare(
      "INSERT INTO category (id,group_id,name,class,kind) VALUES (?,'g',?,'want','variable')",
    );
    if (many) {
      for (let i = 0; i < 201; i++) {
        const id = `c${String(i).padStart(3, '0')}`;
        insert.run(id, `Synthetic ${String(i).padStart(3, '0')}`);
        createBooking(
          opened.db,
          {
            accountId: 'budget',
            date: '2024-01-15',
            amountCents: -100,
            splits: [{ categoryId: id, amountCents: -100 }],
          },
          { actor: 'synthetic-fixture' },
        );
      }
    } else {
      insert.run('a', 'Muster; "Ö"\nZeile');
      insert.run('b', '\t=SUM(1;2)');
      for (const [categoryId, date, amountCents] of [
        ['a', '2024-01-15', -1234],
        ['a', '2024-02-15', 234],
        ['b', '2024-02-16', -100],
      ] as const)
        createBooking(
          opened.db,
          {
            accountId: 'budget',
            date,
            amountCents,
            splits: [{ categoryId, amountCents }],
          },
          { actor: 'synthetic-fixture' },
        );
    }
  }
  let stepUps = 0;
  const auth: AuthGate = {
    routes: new Hono(),
    originGuard: async (_c, next) => next(),
    requireSession: async (c, next) =>
      denied ? c.json({ error: 'unauthenticated' }, 401) : next(),
    requireStepUp: async (c) => {
      stepUps++;
      return c.json({ error: 'step_up_required' }, 403);
    },
  };
  const app = createApp({ webDir, auth, ledger: { db: opened.db, today } });
  return { app, opened, stepUps: () => stepUps };
}

const csvText = async (response: Response) =>
  new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await response.arrayBuffer());

describe('authenticated Explorer CSV #627', () => {
  it('identifies an effective-window rollover even when a 1M no-column CSV body is identical', async () => {
    let day = '2024-02-05';
    const { app, opened } = setup({ empty: true, today: () => day });
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date)
      VALUES ('budget','Synthetic checking','checking','budget',1,'2024-01-01');
      INSERT INTO category_group (id,name) VALUES ('g','Synthetic group');
      INSERT INTO category (id,group_id,name,class,kind)
      VALUES ('a','g','Synthetic','want','variable');
    `);
    for (const date of ['2024-01-15', '2024-02-15'])
      createBooking(
        opened.db,
        {
          accountId: 'budget',
          date,
          amountCents: -1234,
          splits: [{ categoryId: 'a', amountCents: -1234 }],
        },
        { actor: 'synthetic-fixture' },
      );
    const before = opened.sqlite.prepare('SELECT total_changes() AS n').get();
    const search = query({ period: '1M', cols: 'keine' });
    const janTable = (await (
      await app.request(`/api/overview/explorer?${search}`)
    ).json()) as ExplorerReport;
    const jan = await app.request(`/api/overview/explorer.csv?${search}`);
    expect(janTable.result.months).toEqual(['2024-01']);
    expect(janTable.result.rows[0]?.values).toEqual([1234]);
    expect(jan.headers.get('content-disposition')).toBe(
      'attachment; filename="explorer-2024-01-2024-01.csv"',
    );
    day = '2024-03-05';
    const febTable = (await (
      await app.request(`/api/overview/explorer?${search}`)
    ).json()) as ExplorerReport;
    const feb = await app.request(`/api/overview/explorer.csv?${search}`);
    expect(febTable.result.months).toEqual(['2024-02']);
    expect(febTable.result.rows[0]?.values).toEqual([1234]);
    expect(feb.headers.get('content-disposition')).toBe(
      'attachment; filename="explorer-2024-02-2024-02.csv"',
    );
    expect(await csvText(feb)).toBe(await csvText(jan));
    expect(opened.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(before);
  });

  it('recomputes literal current rows, raw cents and exact supplied footer without writes', async () => {
    const { app, opened, stepUps } = setup();
    const before = opened.sqlite.prepare('SELECT total_changes() AS n').get();
    const source = opened.sqlite.prepare('SELECT * FROM booking ORDER BY id').all();
    const json = await app.request(`/api/overview/explorer?${query()}`);
    const table = (await json.json()) as ExplorerReport;
    expect(
      table.result.rows.map((r: { key: string; values: number[]; total: number }) => [
        r.key,
        r.values,
        r.total,
      ]),
    ).toEqual([
      ['a', [1234, -234], 1000],
      ['b', [0, 100], 100],
    ]);
    const response = await app.request(`/api/overview/explorer.csv?${query()}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/csv;\s*charset=utf-8/i);
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="explorer-2024-01-2024-02.csv"',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    const csv = await csvText(response);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain(';"row_key";"Kategorie";"Jän 24";"Feb 24";"Gesamt"\r\n');
    expect(csv).toContain(';"a";"Muster; ""Ö""\nZeile";1234;-234;1000\r\n');
    expect(csv).toContain(';"b";"\'\t=SUM(1;2)";0;100;100\r\n');
    expect(csv).toContain(';"";"Summe";1234;-134;1100\r\n');
    expect(opened.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(before);
    expect(opened.sqlite.prepare('SELECT * FROM booking ORDER BY id').all()).toEqual(source);
    expect(stepUps()).toBe(0);
  });

  it('states the existing 200-row truncation and keeps its visible full-result totals', async () => {
    const { app } = setup({ many: true });
    const response = await app.request(`/api/overview/explorer.csv?${query()}`);
    expect(response.status).toBe(200);
    const csv = await csvText(response);
    expect(csv.match(/^"data";/gm)).toHaveLength(200);
    expect(csv).toContain(';"cents";1;"c199";"Synthetic 199";100;0;100\r\n');
    expect(csv).not.toContain('Synthetic 200');
    expect(csv).toContain(';"cents";1;"";"Summe";20100;0;20100\r\n');
  });

  it('returns a defined header and one empty marker without unfiltered fallback', async () => {
    const { app } = setup({ empty: true });
    const response = await app.request(`/api/overview/explorer.csv?${query()}`);
    expect(response.status).toBe(200);
    const csv = await csvText(response);
    expect(csv).toContain(';"row_key";"Kategorie"\r\n');
    expect(csv).toContain('"empty";"explorer";"3M";"kategorie";"alle";"summe";"cents";0;"";""\r\n');
    expect(csv.match(/\r\n/g)).toHaveLength(2);
  });

  it('rejects malformed, incomplete, future or extra query inputs instead of broadening scope', async () => {
    const { app } = setup();
    for (const search of [
      '',
      query({ dim: 'unknown' }).toString(),
      query({ period: '2024-01..2025-01' }).toString(),
      query({ rows: 'invented' }).toString(),
    ]) {
      const response = await app.request(`/api/overview/explorer.csv?${search}`);
      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toContain('application/json');
    }
  });

  it('requires the existing session boundary and preserves the full-ZIP step-up boundary', async () => {
    const denied = setup({ denied: true });
    expect((await denied.app.request(`/api/overview/explorer.csv?${query()}`)).status).toBe(401);
    const allowed = setup();
    expect((await allowed.app.request('/api/export/csv.zip')).status).toBe(403);
    expect(allowed.stepUps()).toBe(1);
  });
});
