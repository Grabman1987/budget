/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import {
  account,
  accounts,
  auditLog,
  booking,
  category,
  createBooking,
  createTestDatabase,
  deleteBooking,
  envelopeMonth,
  expectedOccurrence,
  expectedPayment,
  importRun,
  ynabRegisterRow,
  type Db,
  runInTransaction,
} from '@budget/db';
import type { TargetModel } from '@budget/import-ynab';
import { ynabExport, YNAB_FILE_NAMES } from '@budget/fixtures/ynab';
import { and, eq, isNull } from 'drizzle-orm';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AuthGate } from '../app';
import { writeImport } from './commit';

const webDir = mkdtempSync(join(tmpdir(), 'budget-import-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const files = ynabExport(1);

let db: Db;
let stepUpFresh: boolean;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  vi.stubEnv('BUDGET_IMPORT_HTTP', '1');
  db = createTestDatabase().db;
  stepUpFresh = true;
  const gate: AuthGate = {
    originGuard: async (_c, next) => next(),
    requireSession: async (_c, next) => next(),
    requireStepUp: async (c, next) =>
      stepUpFresh ? next() : c.json({ error: 'step_up_required' }, 403),
    routes: new Hono(),
  };
  app = createApp({ webDir, auth: gate, ledger: { db, today: () => '2026-09-29' } });
});
afterEach(() => vi.unstubAllEnvs());

/** A call of the import API; a job (202) is followed until it ends, like the wizard does. */
async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api/imports${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const json = (await res.json()) as Record<string, any>;
  if (res.status !== 202) return { status: res.status, body: json };
  return { ...(await finished(json['job'].id as string)), job: json['job'] };
}

async function finished(jobId: string): Promise<{ status: number; body: Record<string, any> }> {
  for (;;) {
    const res = await app.request(`/api/imports/jobs/${jobId}`);
    const { job } = (await res.json()) as Record<string, any>;
    if (job.state !== 'running') return job.result;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function upload(register = files.register, plan = files.plan) {
  const form = new FormData();
  form.append('files', new File([register], YNAB_FILE_NAMES.register));
  form.append('files', new File([plan], YNAB_FILE_NAMES.plan));
  const res = await app.request('/api/imports/ynab', { method: 'POST', body: form });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

/** `€` as its UTF-8 bytes read as latin1. */
const EURO = 'â\u0082¬';

const liveBookings = () => db.select().from(booking).where(isNull(booking.deletedAt)).all().length;
const liveExpected = () =>
  db.select().from(expectedPayment).where(isNull(expectedPayment.deletedAt)).all();
const liveOccurrences = () =>
  db.select().from(expectedOccurrence).where(isNull(expectedOccurrence.deletedAt)).all().length;

/**
 * An export file with lines changed (`change` gets each line, `null` drops it); the bytes are
 * read as latin1 so the CESU-8 emoji pass through untouched.
 */
function edit(bytes: Uint8Array, change: (line: string) => string | null): Uint8Array {
  const eol = String.fromCharCode(13, 10);
  const lines = Buffer.from(bytes).toString('latin1').split(eol);
  const out = lines.map((l, i) => (i === 0 || l === '' ? l : change(l)));
  return new Uint8Array(Buffer.from(out.filter((l) => l !== null).join(eol), 'latin1'));
}

describe('YNAB import runs', () => {
  it('rejects a raw EUR import mapped to a USD account atomically', () => {
    accounts.create(
      db,
      {
        id: 'usd-import-target',
        name: 'Dollar tracking',
        type: 'other_asset',
        role: 'investment',
        onBudget: false,
        currency: 'USD',
        openingDate: '2023-10-01',
        sortOrder: 1,
      },
      { actor: 'tester' },
    );
    db.insert(importRun).values({ id: 'usd-import-run', source: 'ynab', status: 'staged' }).run();
    const auditCount = db.select().from(auditLog).all().length;
    const target: TargetModel = {
      startMonth: '2026-01',
      months: [],
      accounts: [
        {
          id: 'source-usd',
          ynabName: 'Dollar tracking',
          name: 'Dollar tracking',
          type: 'other_asset',
          onBudget: false,
          closedAt: null,
          openingDate: '2026-01-01',
          openingBalanceCents: 0,
          adjustments: [],
        },
      ],
      categories: [],
      bookings: [
        {
          id: 'source-row',
          line: 2,
          accountId: 'source-usd',
          date: '2026-01-05',
          payee: '',
          systemPayee: null,
          contact: null,
          flag: '',
          status: 'confirmed',
          memo: '',
          amountCents: -100,
          splits: [
            {
              payee: '',
              amountCents: -100,
              categoryId: null,
              memo: '',
              transferId: null,
              transferAccountId: null,
              contact: null,
              project: null,
              incomeType: null,
              ruleId: null,
            },
          ],
          scheduled: false,
        },
      ],
      assigned: {},
      openingCarry: {},
      contacts: [],
      expectedPayments: [],
      targets: [],
      moved: [],
      shifts: [],
    };
    expect(() =>
      runInTransaction(db, (tx) =>
        writeImport(tx, {
          runId: 'usd-import-run',
          target,
          keys: new Map([['source-row', 'source-key']]),
          previous: { accounts: { 'source-usd': 'usd-import-target' }, categories: {} },
          deleteMissing: false,
          actor: 'tester',
          today: '2026-02-28',
        }),
      ),
    ).toThrow(/EUR.*account/i);
    expect(() =>
      runInTransaction(db, (tx) =>
        writeImport(tx, {
          runId: 'usd-import-run',
          target: {
            ...target,
            accounts: target.accounts.map((item) => ({ ...item, openingBalanceCents: 10_000 })),
            bookings: [],
          },
          keys: new Map(),
          previous: { accounts: { 'source-usd': 'usd-import-target' }, categories: {} },
          deleteMissing: false,
          actor: 'tester',
          today: '2026-02-28',
        }),
      ),
    ).toThrow(/EUR.*account/i);
    expect(liveBookings()).toBe(0);
    expect(db.select().from(account).all()).toHaveLength(1);
    expect(
      db
        .select({
          openingDate: account.openingDate,
          openingBalanceCents: account.openingBalanceCents,
        })
        .from(account)
        .where(eq(account.id, 'usd-import-target'))
        .get(),
    ).toEqual({ openingDate: '2023-10-01', openingBalanceCents: 0 });
    expect(db.select().from(auditLog).all()).toHaveLength(auditCount);
  });

  it('stages both files, refuses uploads without step-up, broken files with the line', async () => {
    stepUpFresh = false;
    expect((await upload()).status).toBe(403);
    stepUpFresh = true;
    const { status, body } = await upload();
    expect(status).toBe(201);
    expect(body['run'].status).toBe('staged');
    expect(body['run'].summary.counts.register).toBeGreaterThan(1000);
    expect(body['overview'].accounts.length).toBeGreaterThanOrEqual(10);
    expect(body['overview'].categories[0]).toHaveProperty('years');
    const staged = db.select().from(ynabRegisterRow).all().length;
    expect(staged).toBe(body['run'].summary.counts.register);

    let n = 0;
    const broken = edit(files.register, (l) => (++n === 5 ? l.replace(`\t${EURO}`, '\t$') : l));
    const bad = await upload(broken);
    expect(bad.status).toBe(422);
    expect(bad.body).toMatchObject({ error: 'parse', file: 'register', line: 6 });
    expect(JSON.stringify(bad.body)).not.toMatch(/\$/);

    const deleted = await call('DELETE', `/${body['run'].id}`);
    expect(deleted.body['deleted']).toBe('run');
    expect(db.select().from(ynabRegisterRow).all()).toHaveLength(0);
  }, 60_000);

  it('dry run writes nothing; commit reproduces the export; revert takes it back', async () => {
    const { body: up } = await upload();
    const id = up['run'].id as string;
    const mapping = await call('GET', `/${id}/mapping`);
    expect(mapping.body['proposed']).toBe(true);
    expect(mapping.body['mapping'].startMonth).toBe('2023-10');

    const dry = await call('POST', `/${id}/dry-run`);
    expect(dry.status).toBe(200);
    expect(dry.body['problems'].filter((p: any) => p.severity === 'error')).toEqual([]);
    expect(dry.body['reconciliation'].differences).toEqual([]);
    expect(dry.body['ledger']).toEqual([]);
    expect(dry.body['change'].bookings.added).toBeGreaterThan(1000);
    expect(liveBookings()).toBe(0);

    stepUpFresh = false;
    expect((await call('POST', `/${id}/commit`, {})).status).toBe(403);
    stepUpFresh = true;
    const commit = await call('POST', `/${id}/commit`, {});
    expect(commit.status).toBe(200);
    expect(commit.body['run'].status).toBe('committed');
    expect(commit.body['ledger']).toEqual([]);
    expect(liveBookings()).toBe(dry.body['change'].bookings.added);
    const sources = db.select({ source: booking.source }).from(booking).all();
    expect(new Set(sources.map((s) => s.source))).toEqual(new Set(['migration']));
    // Scheduled rows are expected payments with planned occurrences, not bookings.
    expect(commit.body['change'].expected).toEqual({ created: 2, reused: 0 });
    expect(liveExpected().map((p) => [p.name, p.rhythm, p.dueDay, p.startDate])).toEqual([
      ['Vermieter', 'monthly', 1, '2026-10-01'],
      ['Kindergarten', 'monthly', 5, '2026-10-05'],
    ]);
    expect(liveOccurrences()).toBeGreaterThan(12);

    const report = await call('GET', `/${id}/report`);
    expect(report.body['ledger']).toEqual([]);
    expect(report.body['reconciliation'].differences).toEqual([]);

    // The same export again: nothing to add, nothing missing, nothing written.
    const { body: again } = await upload();
    expect(again['sameExportAs']).toEqual([id]);
    const second = again['run'].id as string;
    const dry2 = await call('POST', `/${second}/dry-run`);
    expect(dry2.body['change'].bookings).toMatchObject({ added: 0, updated: 0, missing: [] });
    expect(dry2.body['change'].assigned.changed).toBe(0);
    expect(dry2.body['change'].expected).toEqual({ created: 0, reused: 2 });
    expect((await call('POST', `/${second}/commit`, {})).status).toBe(200);
    expect(liveBookings()).toBe(dry.body['change'].bookings.added);

    // Only the newest run can be reverted; then the first one, as a whole.
    expect((await call('POST', `/${id}/revert`, {})).body['error']).toBe('newer_run');
    expect((await call('POST', `/${second}/revert`, {})).status).toBe(200);
    const reverted = await call('POST', `/${id}/revert`, {});
    expect(reverted.body['run'].status).toBe('reverted');
    expect(liveBookings()).toBe(0);
    expect(db.select().from(envelopeMonth).where(isNull(envelopeMonth.deletedAt)).all()).toEqual(
      [],
    );
    expect([liveExpected().length, liveOccurrences()]).toEqual([0, 0]);

    // After the revert the export can be committed again.
    const { body: third } = await upload();
    await call('POST', `/${third['run'].id}/dry-run`);
    const recommit = await call('POST', `/${third['run'].id}/commit`, {});
    expect(recommit.body['change'].bookings.added).toBe(dry.body['change'].bookings.added);
    expect(recommit.body['change'].expected).toEqual({ created: 2, reused: 0 });
  }, 60_000);

  it('a newer export updates status, adds new rows and deletes missing ones on request', async () => {
    const { body: up } = await upload();
    await call('POST', `/${up['run'].id}/dry-run`);
    await call('POST', `/${up['run'].id}/commit`, {});
    const before = liveBookings();

    // One uncleared row got cleared, one plain row (no split, no transfer) is gone.
    let cleared = false;
    let dropped = false;
    const newer = edit(files.register, (l) => {
      const plain = !l.includes('Split (') && !l.includes('Transfer : ');
      if (!cleared && plain && l.endsWith('"Uncleared"')) {
        cleared = true;
        return l.replace(/"Uncleared"$/, '"Cleared"');
      }
      if (!dropped && plain && l.includes('.2026"') && l.endsWith('"Cleared"')) {
        dropped = true;
        return null;
      }
      return l;
    });
    expect(cleared && dropped).toBe(true);
    const { body: next } = await upload(newer);
    const id = next['run'].id as string;
    const dry = await call('POST', `/${id}/dry-run`);
    expect(dry.body['change'].bookings).toMatchObject({ added: 0, updated: 1 });
    expect(dry.body['change'].bookings.missing).toHaveLength(1);
    const commit = await call('POST', `/${id}/commit`, { deleteMissing: true });
    expect(commit.body['change'].bookings.deleted).toBe(1);
    expect(liveBookings()).toBe(before - 1);
  }, 60_000);

  it('a contact share outside advance is a dry-run error, not a failed write', async () => {
    const { body: up } = await upload();
    const id = up['run'].id as string;
    const { body } = await call('GET', `/${id}/mapping`);
    const mapping = body['mapping'];
    mapping.rulesFrom = '2026-01';
    mapping.rules = [{ id: 'share', match: { payee: 'Rundfunkbeitrag' }, set: { contact: 'K' } }];
    await call('PUT', `/${id}/mapping`, mapping);
    const dry = await call('POST', `/${id}/dry-run`);
    expect(dry.status).toBe(200);
    expect(dry.body['problems'].map((p: any) => p.code)).toEqual(['mapping.contact_category']);
    expect((await call('POST', `/${id}/commit`, {})).body['error']).toBe('import_problems');
    expect(liveBookings()).toBe(0);
  }, 60_000);

  it('commits a run once under concurrent requests; an undone run still offers its mapping', async () => {
    const { body: up } = await upload();
    const id = up['run'].id as string;
    const { body } = await call('GET', `/${id}/mapping`);
    const mapping = body['mapping'];
    mapping.names = { stripNotes: true, stripEmoji: true };
    await call('PUT', `/${id}/mapping`, mapping);
    const both = await Promise.all([
      call('POST', `/${id}/commit`, {}),
      call('POST', `/${id}/commit`, {}),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    const added = both.find((r) => r.status === 200)?.body['change'].bookings.added as number;
    expect(liveBookings()).toBe(added);

    expect((await call('POST', `/${id}/revert`, {})).status).toBe(200);
    const { body: again } = await upload();
    const offered = await call('GET', `/${again['run'].id}/mapping`);
    expect(offered.body['mapping'].names).toEqual({ stripNotes: true, stripEmoji: true });
  }, 60_000);

  it('refuses to undo a run whose accounts or categories got later bookings', async () => {
    const { body: up } = await upload();
    const id = up['run'].id as string;
    expect((await call('POST', `/${id}/commit`, {})).status).toBe(200);
    const acc = db.select().from(account).where(isNull(account.deletedAt)).get();
    const cat = db.select().from(category).where(eq(category.kind, 'variable')).get();
    const later = createBooking(
      db,
      {
        accountId: acc?.id as string,
        date: '2026-09-30',
        amountCents: -1234,
        splits: [{ categoryId: cat?.id as string, amountCents: -1234 }],
      },
      { actor: 'owner' },
    );
    for (const force of [false, true]) {
      const refused = await call('POST', `/${id}/revert`, { force });
      expect([refused.status, refused.body['error']]).toEqual([409, 'in_use']);
    }
    deleteBooking(db, later, { actor: 'owner' });
    expect((await call('POST', `/${id}/revert`, {})).status).toBe(200);
    expect(db.select().from(account).where(isNull(account.deletedAt)).all()).toEqual([]);
  }, 60_000);

  it('keeps negative assigned amounts and refuses a mapping error before any write', async () => {
    // YNAB allows taking money back: a negative Assigned in one month (owner decision: accepted).
    // The edit keeps the row consistent: Available falls by twice the amount.
    const cents = (v: string) =>
      (v.startsWith('-') ? -1 : 1) *
      Math.round(Number(v.replace('-', '').replace(EURO, '').replace(',', '.')) * 100);
    const money = (c: number) =>
      `${c < 0 ? '-' : ''}${EURO}${(Math.abs(c) / 100).toFixed(2).replace('.', ',')}`;
    let done = false;
    const plan = edit(files.plan, (l) => {
      if (done || !l.startsWith('"Jan 2025"') || !new RegExp(`\t${EURO}[1-9]`).test(l)) return l;
      done = true;
      const f = l.split('\t');
      const assigned = cents(f[4] as string);
      f[4] = money(-assigned);
      f[6] = money(cents(f[6] as string) - 2 * assigned);
      return f.join('\t');
    });
    const { body: up } = await upload(files.register, plan);
    const id = up['run'].id as string;
    const { body } = await call('GET', `/${id}/mapping`);
    const mapping = body['mapping'];
    const loan = Object.values(mapping.accounts).find((a: any) => a.type === 'loan') as any;
    loan.onBudget = true;
    expect((await call('PUT', `/${id}/mapping`, mapping)).body['version']).toBe(1);
    const dry = await call('POST', `/${id}/dry-run`);
    expect(dry.body['problems'].map((p: any) => p.code)).toContain('mapping.tracking_only');
    expect((await call('POST', `/${id}/commit`, {})).body['error']).toBe('import_problems');
    expect(liveBookings()).toBe(0);

    loan.onBudget = false;
    await call('PUT', `/${id}/mapping`, mapping);
    expect((await call('POST', `/${id}/commit`, {})).status).toBe(200);
    const negative = db
      .select()
      .from(envelopeMonth)
      .where(and(isNull(envelopeMonth.deletedAt), eq(envelopeMonth.month, '2025-01')))
      .all()
      .filter((r) => r.assignedCents < 0);
    expect(negative).toHaveLength(1);
    expect(db.select().from(importRun).where(eq(importRun.id, id)).get()?.status).toBe('committed');
  }, 60_000);
});
