import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { accounts, createTestDatabase, type OpenedDatabase } from '@budget/db';
import { createApp, type AuthGate } from '../app';
import type { PaymentDetail } from '@budget/db';

const auth: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
type StoredOccurrence = { paymentId: string; dueDate: string; amountCents: number };
let opened: OpenedDatabase;
let app: ReturnType<typeof createApp>;
let webDir: string;
let today: string;

beforeEach(() => {
  opened = createTestDatabase();
  accounts.create(
    opened.db,
    {
      id: 'synthetic-payment-account',
      name: 'Synthetic payment account',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2023-10-01',
    },
    { actor: 'synthetic-606' },
  );
  webDir = mkdtempSync(join(tmpdir(), 'synthetic-detail-606-'));
  writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Synthetic</title>');
  today = '2024-01-15';
  app = createApp({ webDir, auth, ledger: { db: opened.db, today: () => today } });
});

afterEach(() => {
  opened.close();
  rmSync(webDir, { recursive: true, force: true });
});

async function get<T>(path: string): Promise<T> {
  const response = await app.request('/api' + path);
  expect(response.status).toBe(200);
  return response.json() as Promise<T>;
}

async function payment(startDate = '2024-01-01', dueDay = 20) {
  const response = await app.request('/api/expected', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Synthetic monthly payment',
      kind: 'outflow',
      accountId: 'synthetic-payment-account',
      rhythm: 'monthly',
      dueDay,
      dateShift: 'none',
      startDate,
      validFrom: startDate,
      amountCents: 1234,
    }),
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return response.json() as Promise<{ payment: { id: string } }>;
}

async function dates(from: string, to: string) {
  const result = await get<{ occurrences: StoredOccurrence[] }>(
    `/expected/occurrences?from=${from}&to=${to}&includeSkipped=1`,
  );
  return result.occurrences;
}

describe('#606 existing direct-detail read versus explicit materialization', () => {
  it('distinguishes the stale empty SELECT from real 35/90-day dues and explicit refresh', async () => {
    const created = await payment();
    today = '2026-09-17';
    const beforeReads = opened.sqlite.serialize();

    const listed = await get<{ payments: Array<{ id: string; nextDueDate: string }> }>('/expected');
    expect(listed.payments).toEqual([
      expect.objectContaining({ id: created.payment.id, nextDueDate: '2026-09-20' }),
    ]);
    // Exact range currently requested by direct PaymentPanel at this fixed date.
    expect(await dates('2025-09-01', '2027-09-28')).toEqual([]);
    // Independently calculated inclusive day windows: Sep17 +35=Oct22, +90=Dec16.
    expect(await dates('2026-09-17', '2026-10-22')).toEqual([]);
    expect(await dates('2026-09-17', '2026-12-16')).toEqual([]);
    expect(opened.sqlite.serialize().equals(beforeReads)).toBe(true);

    const refresh = await app.request('/api/expected/refresh', { method: 'POST' });
    expect(refresh.status, await refresh.clone().text()).toBe(200);
    expect(opened.sqlite.serialize().equals(beforeReads)).toBe(false);
    const afterExplicitRefresh = opened.sqlite.serialize();
    const in35 = await dates('2026-09-17', '2026-10-22');
    const in90 = await dates('2026-09-17', '2026-12-16');
    expect(in35.map((row) => row.dueDate)).toEqual(['2026-09-20', '2026-10-20']);
    expect(in90.map((row) => row.dueDate)).toEqual(['2026-09-20', '2026-10-20', '2026-11-20']);
    expect(in90.map((row) => row.amountCents)).toEqual([-1234, -1234, -1234]);
    expect(in90.every((row) => row.paymentId === created.payment.id)).toBe(true);
    expect(opened.sqlite.serialize().equals(afterExplicitRefresh)).toBe(true);
  });

  it('separates the old end-day28 exclusion from the short monthly-window case', async () => {
    today = '2026-09-17';
    const created = await payment('2027-09-30', 30);
    const beforeReads = opened.sqlite.serialize();
    expect(await dates('2025-09-01', '2027-09-28')).toEqual([]);
    expect(await dates('2027-09-01', '2027-09-30')).toEqual([
      expect.objectContaining({
        paymentId: created.payment.id,
        dueDate: '2027-09-30',
        amountCents: -1234,
      }),
    ]);
    // The distant first due is legitimately outside both near-term windows.
    expect(await dates('2026-09-17', '2026-10-22')).toEqual([]);
    expect(await dates('2026-09-17', '2026-12-16')).toEqual([]);
    expect(opened.sqlite.serialize().equals(beforeReads)).toBe(true);
  });
});

describe('#606 additive read-only detail API', () => {
  it('shows stale monthly next dates without a refresh, with no-store and no ledger/audit mutation', async () => {
    const { payment: created } = await payment();
    today = '2026-09-17';
    const before = opened.sqlite.serialize();
    const response = await app.request(`/api/expected/${created.id}/detail`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const detail = (await response.json()) as PaymentDetail;
    expect(detail).toMatchObject({ paymentId: created.id, asOf: '2026-09-17' });
    expect(
      detail.future
        .slice(0, 3)
        .map((r) => [
          r.dueDate,
          r.expectedAmountCents,
          r.source,
          r.occurrenceId,
          r.actualComparableCents,
          r.deviationCents,
        ]),
    ).toEqual([
      ['2026-09-20', -1234, 'preview', null, null, null],
      ['2026-10-20', -1234, 'preview', null, null, null],
      ['2026-11-20', -1234, 'preview', null, null, null],
    ]);
    expect(detail.history).toHaveLength(12);
    expect(detail.history[0]?.dueDate).toBe('2025-01-20');
    expect(await dates('2025-09-01', '2027-09-28')).toEqual([]);
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
  });

  it('retains actual version save/undo while exposing the fourth future term for read-only inspection', async () => {
    today = '2026-09-17';
    const { payment: created } = await payment('2026-12-28', 28);
    async function write<T>(path: string, data: unknown, status: number) {
      const response = await app.request('/api' + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      expect(response.status).toBe(status);
      return response.json() as Promise<T>;
    }
    const version = await write<{ groupId: string }>(
      `/expected/${created.id}/versions`,
      { validFrom: '2027-02-01', amountCents: 5000 },
      201,
    );
    const before = opened.sqlite.serialize();
    const detail = await get<PaymentDetail>(`/expected/${created.id}/detail`);
    expect(detail.future.slice(0, 4).map((r) => [r.dueDate, r.expectedAmountCents])).toEqual([
      ['2026-12-28', -1234],
      ['2027-01-28', -1234],
      ['2027-02-28', -5000],
      ['2027-03-28', -5000],
    ]);
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
    await write('/undo', { groupId: version.groupId }, 200);
    const restored = await get<PaymentDetail>(`/expected/${created.id}/detail`);
    expect(restored.future.slice(0, 4).map((r) => r.expectedAmountCents)).toEqual([
      -1234, -1234, -1234, -1234,
    ]);
  });

  it('retains missing-payment errors and requires the existing session gate', async () => {
    expect((await app.request('/api/expected/not-present/detail')).status).toBe(404);
    const denied = createApp({
      webDir,
      ledger: { db: opened.db, today: () => today },
      auth: { ...auth, requireSession: async (c) => c.json({ error: 'unauthorized' }, 401) },
    });
    const response = await denied.request('/api/expected/not-present/detail');
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
