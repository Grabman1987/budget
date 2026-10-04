/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import { createTestDatabase } from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const webDir = mkdtempSync(join(tmpdir(), 'budget-perf-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp({
    webDir,
    auth: signedIn,
    ledger: { db: createTestDatabase().db, today: () => '2026-10-15' },
  });
});

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as any };
}
async function ok(method: string, path: string, body?: unknown) {
  const res = await call(method, path, body);
  expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
  return res.body;
}

/** A small synthetic ledger over several months, with income, spending and assignments. */
async function seed() {
  const giro = (
    await ok('POST', '/accounts', {
      name: 'Giro',
      type: 'checking',
      openingDate: '2026-01-01',
      openingBalanceCents: 200_000,
    })
  ).account;
  const spar = (
    await ok('POST', '/accounts', {
      name: 'Spar',
      type: 'savings',
      openingDate: '2026-02-01',
      openingBalanceCents: 50_000,
    })
  ).account;
  const group = (await ok('POST', '/categories/groups', { name: 'Alltag' })).group;
  const make = async (name: string, extra: object = {}) =>
    (
      await ok('POST', '/categories', {
        name,
        groupId: group.id,
        class: 'need',
        stage: 2,
        ...extra,
      })
    ).category;
  const essen = await make('Lebensmittel');
  const miete = await make('Miete', { kind: 'fixed', stage: 1 });
  const cafe = await make('Cafe', { class: 'want' });
  for (const [month, day] of [
    ['2026-01', '05'],
    ['2026-03', '07'],
    ['2026-05', '11'],
    ['2026-08', '21'],
    ['2026-09', '28'],
  ] as const) {
    await ok('POST', '/bookings', {
      type: 'booking',
      accountId: giro.id,
      date: `${month}-${day}`,
      amountCents: -3_300,
      categoryId: essen.id,
    });
  }
  await ok('POST', '/bookings', {
    type: 'booking',
    accountId: giro.id,
    date: '2026-03-01',
    amountCents: 250_000,
    incomeNextMonth: true,
  });
  for (const month of ['2026-01', '2026-03', '2026-06']) {
    await ok('PUT', `/budget/${month}/assigned`, {
      items: [
        { categoryId: miete.id, assignedCents: 10_000 },
        { categoryId: cafe.id, assignedCents: 2_000 },
      ],
    });
  }
  await ok('PUT', `/categories/${miete.id}/target`, {
    validFrom: '2026-01',
    target: { kind: 'monthly', amountCents: 89_000, dueDay: 1 },
  });
  return { giro, spar };
}

const yearOf = (year: number) =>
  Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

describe('GET /budget/months', () => {
  it('answers every month exactly like the single-month endpoint', async () => {
    await seed();
    // Before the first opening month, inside the ledger, and far after it.
    const months = [...yearOf(2025).slice(9), ...yearOf(2026), ...yearOf(2027).slice(0, 3)];
    for (const query of ['', '&cardRule=concept', '&cardRule=ynab']) {
      const batch = (await ok('GET', `/budget/months?months=${months.join(',')}${query}`)).months;
      expect(Object.keys(batch).sort()).toEqual([...months].sort());
      for (const month of months) {
        const single = await ok('GET', `/budget/${month}${query.replace('&', '?')}`);
        expect(batch[month], `${month}${query}`).toEqual(single);
      }
    }
  });

  it('takes months in any order, twice, and not more than 36', async () => {
    await seed();
    const batch = (await ok('GET', '/budget/months?months=2026-06,2026-02,2026-06')).months;
    expect(Object.keys(batch).sort()).toEqual(['2026-02', '2026-06']);
    expect(batch['2026-06']).toEqual(await ok('GET', '/budget/2026-06'));
    expect((await call('GET', '/budget/months')).status).toBe(400);
    expect((await call('GET', '/budget/months?months=2026-13')).status).toBe(400);
    const tooMany = [...yearOf(2024), ...yearOf(2025), ...yearOf(2026), '2027-01'];
    expect((await call('GET', `/budget/months?months=${tooMany.join(',')}`)).status).toBe(400);
  });
});

describe('GET /accounts/series', () => {
  it('answers every live account exactly like its own series endpoint', async () => {
    const { giro, spar } = await seed();
    await ok('POST', '/bookings', {
      type: 'booking',
      accountId: spar.id,
      date: '2026-09-12',
      amountCents: 1_234,
    });
    const range = 'from=2026-08-20&to=2026-10-15';
    const batch = (await ok('GET', `/accounts/series?${range}`)).series;
    expect(Object.keys(batch).sort()).toEqual([giro.id, spar.id].sort());
    for (const id of [giro.id, spar.id])
      expect(batch[id]).toEqual(await ok('GET', `/accounts/${id}/series?${range}`));
    const only = (await ok('GET', `/accounts/series?${range}&ids=${spar.id}`)).series;
    expect(Object.keys(only)).toEqual([spar.id]);
  });

  it('keeps the range limit and the 404 of the single endpoint', async () => {
    const { giro } = await seed();
    const range = 'from=2026-08-20&to=2026-08-22';
    const batch = (await ok('GET', `/accounts/series?${range}`)).series;
    expect(Object.keys(batch)).toContain(giro.id);
    expect((await call('GET', '/accounts/series?from=2026-08-22&to=2026-08-20')).status).toBe(400);
    expect((await call('GET', '/accounts/series?from=1900-01-01&to=2026-08-20')).status).toBe(400);
    expect((await call('GET', `/accounts/nope/series?${range}`)).status).toBe(404);
  });
});
