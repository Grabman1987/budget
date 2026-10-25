import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { accounts, createTestDatabase, type OpenedDatabase } from '@budget/db';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-03-20';
const auth: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};
let opened: OpenedDatabase;
let app: ReturnType<typeof createApp>;
let webDir: string;
let id: string;
interface Listed {
  id: string;
  endDate: string | null;
  lifecycle: {
    pauses: Array<{ fromDate: string; throughDate: string }>;
    endedFrom: string | null;
    endEvidence: string;
    deletion: string;
    reviewToken: string | null;
  };
}
async function call(method: string, path: string, body?: unknown) {
  return app.request('/api' + path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
}
async function listed() {
  const response = await call('GET', '/expected');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return ((await response.json()) as { payments: Listed[] }).payments.find((p) => p.id === id)!;
}
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(TODAY + 'T12:00:00Z'));
  opened = createTestDatabase();
  opened.sqlite.function('strftime', { varargs: true }, (...args) => {
    if (args.length !== 2 || args[0] !== '%Y-%m-%dT%H:%M:%fZ' || args[1] !== 'now')
      throw new Error('Unexpected synthetic clock request');
    return new Date().toISOString();
  });
  accounts.create(
    opened.db,
    {
      id: 'synthetic-607-account',
      name: 'Synthetic account',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
    },
    { actor: 'synthetic-607' },
  );
  webDir = mkdtempSync(join(tmpdir(), 'synthetic-api-607-'));
  writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Synthetic</title>');
  app = createApp({ webDir, auth, ledger: { db: opened.db, today: () => TODAY } });
  const created = await call('POST', '/expected', {
    name: 'Synthetic payment',
    kind: 'outflow',
    accountId: 'synthetic-607-account',
    rhythm: 'monthly',
    dueDay: 25,
    dateShift: 'none',
    startDate: '2026-01-01',
    validFrom: '2026-01-01',
    amountCents: 1234,
  });
  expect(created.status).toBe(201);
  id = ((await created.json()) as { payment: { id: string } }).payment.id;
});
afterEach(() => {
  opened.close();
  rmSync(webDir, { recursive: true, force: true });
  vi.useRealTimers();
});

describe('#607 protected explicit lifecycle routes', () => {
  it('requires a current DELETE review token and leaves rejected requests byte-neutral', async () => {
    const stale = (await listed()).lifecycle.reviewToken;
    expect((await call('PATCH', `/expected/${id}`, { dueDay: 26 })).status).toBe(200);
    const before = opened.sqlite.serialize();
    expect((await call('DELETE', `/expected/${id}`)).status).toBe(400);
    expect((await call('DELETE', `/expected/${id}?reviewToken=invalid`)).status).toBe(400);
    expect((await call('DELETE', `/expected/${id}?reviewToken=${stale}`)).status).toBe(409);
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
    const current = (await listed()).lifecycle.reviewToken;
    expect((await call('DELETE', `/expected/${id}?reviewToken=${current}`)).status).toBe(200);
  });

  it('returns only the public lifecycle fields, with a stable read token and no GET mutation', async () => {
    const before = opened.sqlite.serialize();
    const first = await listed();
    expect(Object.keys(first.lifecycle).sort()).toEqual([
      'deletion',
      'endEvidence',
      'endedFrom',
      'pauses',
      'reviewToken',
    ]);
    expect(first.lifecycle).toMatchObject({
      deletion: 'neverAssigned',
      pauses: [],
      endedFrom: null,
      endEvidence: 'none',
    });
    expect(first.lifecycle.reviewToken).toMatch(/^[a-f0-9]{64}$/);
    expect((await listed()).lifecycle.reviewToken).toBe(first.lifecycle.reviewToken);
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
  });

  it('stores an inclusive pause then an exclusive end through real validated actions', async () => {
    const pause = await call('POST', `/expected/${id}/pause`, {
      throughDate: '2026-04-25',
      reviewToken: (await listed()).lifecycle.reviewToken,
    });
    expect(pause.status, await pause.clone().text()).toBe(200);
    expect((await pause.json()) as object).toHaveProperty('groupId');
    expect((await listed()).lifecycle.pauses).toEqual([
      { fromDate: TODAY, throughDate: '2026-04-25' },
    ]);
    const end = await call('POST', `/expected/${id}/end`, {
      fromDate: '2026-05-01',
      reviewToken: (await listed()).lifecycle.reviewToken,
    });
    expect(end.status, await end.clone().text()).toBe(200);
    expect(await listed()).toMatchObject({
      endDate: '2026-04-30',
      lifecycle: { endedFrom: '2026-05-01', endEvidence: 'proven' },
    });
  });

  it('rejects malformed, missing-token and backdated actions without any database change', async () => {
    const reviewToken = (await listed()).lifecycle.reviewToken;
    const before = opened.sqlite.serialize();
    for (const body of [
      { throughDate: '2026-04-31', reviewToken },
      { throughDate: '2026-04-30' },
      { throughDate: '2026-04-30', reviewToken, bookingId: 'synthetic-injected' },
    ])
      expect((await call('POST', `/expected/${id}/pause`, body)).status).toBe(400);
    expect(
      (await call('POST', `/expected/${id}/pause`, { throughDate: '2026-03-19', reviewToken }))
        .status,
    ).toBe(409);
    expect(
      (await call('POST', `/expected/${id}/end`, { fromDate: '2026-03-19', reviewToken })).status,
    ).toBe(409);
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
  });

  it('refuses an end from the stale reviewed editor after a source change', async () => {
    const reviewToken = (await listed()).lifecycle.reviewToken;
    expect((await call('PATCH', `/expected/${id}`, { categoryId: null, dueDay: 26 })).status).toBe(
      200,
    );
    const before = opened.sqlite.serialize();
    const response = await call('POST', `/expected/${id}/end`, {
      fromDate: '2026-04-01',
      reviewToken,
    });
    expect(response.status).toBe(409);
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
    expect((await listed()).endDate).toBeNull();
  });
});
