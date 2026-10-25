import { createHash } from 'node:crypto';
import {
  accountBalances,
  accounts,
  createTestDatabase,
  createTransfer,
  getBooking,
  schema,
  undo,
  type OpenedDatabase,
} from '@budget/db';
import { balanceOn } from '@budget/domain';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bookingRoutes } from './bookings';
import { errorResponse } from './http';
import { createBody, transferCreate } from './schemas';

const day = '2026-10-20';
const legacyJson =
  '{"type":"transfer","fromAccountId":"cash585","toAccountId":"bank585","date":"2026-10-20","amountCents":12345,"status":"confirmed"}';
const explicitJson =
  '{"type":"transfer","fromAccountId":"cash585","toAccountId":"bank585","date":"2026-10-20","amountCents":12345,"status":"confirmed","bankStatus":"confirmed"}';
const legacyHash = '9e3be6da8706ee2e32044fab633caf9114fd285e6f773233f0eace5344217907';
const explicitHash = 'b6a18ea1c8cdaacb32c62c5f8ebea5cf1741ce001436db8f29df3cb304c072cd';
const base = {
  type: 'transfer',
  fromAccountId: 'cash585',
  toAccountId: 'bank585',
  date: day,
  amountCents: 12345,
};
type AccountType = (typeof schema.account.$inferInsert)['type'];
interface TransferAnswer {
  transferId: string;
  fromBookingId: string;
  toBookingId: string;
  groupId: string;
}
let opened: OpenedDatabase;
let app: Hono;

function account(id: string, type: AccountType, openingBalanceCents = 0) {
  const onBudget = ['cash', 'checking', 'savings', 'credit_card'].includes(type);
  accounts.create(
    opened.db,
    {
      id,
      name: id,
      type,
      onBudget,
      role:
        type === 'savings'
          ? 'reserve'
          : onBudget
            ? 'budget'
            : type === 'loan'
              ? 'debt'
              : 'investment',
      openingBalanceCents,
      openingDate: '2026-01-01',
    },
    { actor: 'fixture585' },
  );
}
beforeEach(() => {
  opened = createTestDatabase();
  account('cash585', 'cash', 50000);
  account('bank585', 'checking', 100000);
  app = new Hono().route(
    '/bookings',
    bookingRoutes(opened.db, () => day),
  );
  app.onError(errorResponse);
});
afterEach(() => opened.close());
const post = (body: unknown, key = 'synthetic-cash-bank-585') =>
  app.request('/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
const snapshot = () => ({
  bookings: opened.db.select().from(schema.booking).all(),
  splits: opened.db.select().from(schema.bookingSplit).all(),
  transfers: opened.db.select().from(schema.transfer).all(),
  audit: opened.db.select().from(schema.auditLog).all(),
  delivery: opened.db.select().from(schema.bookingDelivery).all(),
});
const balances = () =>
  Object.fromEntries(
    accountBalances(opened.db, day).map((row) => [row.accountId, row.balanceCents]),
  );
function confirmedBalance(id: string) {
  const row = opened.db.select().from(schema.account).where(eq(schema.account.id, id)).get()!;
  const bookings = opened.db
    .select()
    .from(schema.booking)
    .all()
    .filter((b) => b.deletedAt === null && b.status !== 'pending');
  return balanceOn(row, bookings, day);
}
function pair(result: TransferAnswer) {
  return [
    getBooking(opened.db, result.fromBookingId)!,
    getBooking(opened.db, result.toBookingId)!,
  ] as const;
}

describe('manual cash/bank transfer status intent #585', () => {
  it.each([
    ['checking', false, undefined, 'pending', 37655, 112345, 37655, 100000],
    ['checking', true, undefined, 'pending', 62345, 87655, 62345, 100000],
    ['savings', false, undefined, 'pending', 37655, 112345, 37655, 100000],
    ['savings', true, undefined, 'pending', 62345, 87655, 62345, 100000],
    ['checking', false, 'pending', 'pending', 37655, 112345, 37655, 100000],
    ['checking', true, 'pending', 'pending', 62345, 87655, 62345, 100000],
    ['checking', false, 'confirmed', 'confirmed', 37655, 112345, 37655, 112345],
    ['checking', true, 'confirmed', 'confirmed', 62345, 87655, 62345, 87655],
    ['savings', false, 'pending', 'pending', 37655, 112345, 37655, 100000],
    ['savings', true, 'pending', 'pending', 62345, 87655, 62345, 100000],
    ['savings', false, 'confirmed', 'confirmed', 37655, 112345, 37655, 112345],
    ['savings', true, 'confirmed', 'confirmed', 62345, 87655, 62345, 87655],
  ] as const)(
    '%s reverse=%s bankStatus=%s preserves literal balances and atomic undo/redo',
    async (
      bankType,
      reverse,
      bankStatus,
      expectedBankStatus,
      cashFull,
      bankFull,
      cashConfirmed,
      bankConfirmed,
    ) => {
      if (bankType === 'savings')
        opened.db
          .update(schema.account)
          .set({ type: 'savings', role: 'reserve' })
          .where(eq(schema.account.id, 'bank585'))
          .run();
      const request = {
        ...base,
        ...(reverse ? { fromAccountId: 'bank585', toAccountId: 'cash585' } : {}),
        ...(bankStatus === undefined ? {} : { bankStatus }),
      };
      const response = await post(request);
      expect(response.status).toBe(201);
      const result = (await response.json()) as TransferAnswer;
      const [from, to] = pair(result);
      expect(from).toMatchObject({
        accountId: request.fromAccountId,
        amountCents: -12345,
        status: reverse ? expectedBankStatus : 'confirmed',
        transferId: result.transferId,
      });
      expect(to).toMatchObject({
        accountId: request.toAccountId,
        amountCents: 12345,
        status: reverse ? 'confirmed' : expectedBankStatus,
        transferId: result.transferId,
      });
      expect(from.splits).toMatchObject([{ amountCents: -12345, categoryId: null }]);
      expect(to.splits).toMatchObject([{ amountCents: 12345, categoryId: null }]);
      expect(balances()).toEqual({ cash585: cashFull, bank585: bankFull });
      expect(cashFull + bankFull).toBe(150000);
      expect(confirmedBalance('cash585')).toBe(cashConfirmed);
      expect(confirmedBalance('bank585')).toBe(bankConfirmed);
      const action = opened.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.groupId, result.groupId))
        .all();
      expect(action).toHaveLength(4);
      expect(new Set(action.map((row) => row.groupId))).toEqual(new Set([result.groupId]));
      const beforeReplay = snapshot();
      expect(await (await post(request)).json()).toEqual(result);
      expect(snapshot()).toEqual(beforeReplay);
      const undone = undo(opened.db, { groupId: result.groupId }, { actor: 'fixture585' });
      expect(getBooking(opened.db, result.fromBookingId)).toBeUndefined();
      expect(getBooking(opened.db, result.toBookingId)).toBeUndefined();
      expect(opened.db.select().from(schema.bookingSplit).all()).toHaveLength(0);
      expect(balances()).toEqual({ cash585: 50000, bank585: 100000 });
      // Structural transfer identity is intentionally unaudited and may survive undo.
      expect(opened.db.select().from(schema.transfer).all()).toHaveLength(1);
      const undoneState = snapshot();
      expect(await (await post(request)).json()).toEqual(result);
      expect(snapshot()).toEqual(undoneState);
      undo(opened.db, { groupId: undone.groupId }, { actor: 'fixture585' });
      expect(
        pair(result).map((row) => ({
          id: row.id,
          accountId: row.accountId,
          amountCents: row.amountCents,
          status: row.status,
          transferId: row.transferId,
          splits: row.splits.map((split) => ({
            id: split.id,
            categoryId: split.categoryId,
            amountCents: split.amountCents,
          })),
        })),
      ).toEqual(
        [from, to].map((row) => ({
          id: row.id,
          accountId: row.accountId,
          amountCents: row.amountCents,
          status: row.status,
          transferId: row.transferId,
          splits: row.splits.map((split) => ({
            id: split.id,
            categoryId: split.categoryId,
            amountCents: split.amountCents,
          })),
        })),
      );
      expect(balances()).toEqual({ cash585: cashFull, bank585: bankFull });
    },
  );

  it.each(['pending', 'confirmed'] as const)(
    'shared %s is not an implicit bank confirmation',
    async (status) => {
      const response = await post({ ...base, status });
      expect(response.status).toBe(201);
      const result = (await response.json()) as TransferAnswer;
      expect(pair(result).map((row) => row.status)).toEqual(['confirmed', 'pending']);
    },
  );

  it('keeps absent and explicit common-confirmed legacy canonical bytes identical', () => {
    for (const input of [base, { ...base, status: 'confirmed' }]) {
      const parsed = createBody.parse(input);
      expect(JSON.stringify(parsed)).toBe(legacyJson);
      expect(parsed).not.toHaveProperty('bankStatus');
      expect(Object.keys(parsed)).toEqual([
        'type',
        'fromAccountId',
        'toAccountId',
        'date',
        'amountCents',
        'status',
      ]);
      expect(createHash('sha256').update(JSON.stringify(parsed)).digest('hex')).toBe(legacyHash);
    }
    const legacyFull = {
      projectId: null,
      status: 'confirmed',
      memo: 'Legacy memo',
      payeeId: null,
      categoryId: null,
      ...base,
    };
    const fullJson =
      '{"type":"transfer","fromAccountId":"cash585","toAccountId":"bank585","date":"2026-10-20","amountCents":12345,"categoryId":null,"payeeId":null,"memo":"Legacy memo","status":"confirmed","projectId":null}';
    for (const raw of [legacyFull, Object.fromEntries(Object.entries(legacyFull).reverse())]) {
      const parsed = createBody.parse(raw);
      expect(JSON.stringify(parsed)).toBe(fullJson);
      expect(parsed).not.toHaveProperty('bankStatus');
      expect(Object.keys(parsed)).toEqual([
        'type',
        'fromAccountId',
        'toAccountId',
        'date',
        'amountCents',
        'categoryId',
        'payeeId',
        'memo',
        'status',
        'projectId',
      ]);
      expect(createHash('sha256').update(JSON.stringify(parsed)).digest('hex')).toBe(
        createHash('sha256').update(fullJson).digest('hex'),
      );
    }
    const full = transferCreate.parse({
      bankStatus: 'confirmed',
      projectId: null,
      status: 'confirmed',
      memo: 'Legacy memo',
      payeeId: null,
      categoryId: null,
      ...base,
    });
    expect(JSON.stringify(full)).toBe(
      '{"type":"transfer","fromAccountId":"cash585","toAccountId":"bank585","date":"2026-10-20","amountCents":12345,"categoryId":null,"payeeId":null,"memo":"Legacy memo","status":"confirmed","projectId":null,"bankStatus":"confirmed"}',
    );
  });

  it('keeps the fresh absent/default-confirmed H0 receipt distinct from common pending despite equal new statuses', async () => {
    const response = await post(base, 'synthetic-fresh-h0-585');
    expect(response.status).toBe(201);
    const result = (await response.json()) as TransferAnswer;
    expect(pair(result).map((row) => row.status)).toEqual(['confirmed', 'pending']);
    expect(opened.db.select().from(schema.bookingDelivery).get()?.requestHash).toBe(legacyHash);
    const before = snapshot();
    const equivalent = await post({ ...base, status: 'confirmed' }, 'synthetic-fresh-h0-585');
    expect(equivalent.status).toBe(201);
    expect(await equivalent.json()).toEqual(result);
    const changed = await post({ ...base, status: 'pending' }, 'synthetic-fresh-h0-585');
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({ error: 'idempotency_conflict' });
    expect(snapshot()).toEqual(before);
  });

  it('hashes explicit bank confirmation as a distinct appended intent and rejects changed-key intent without writes', async () => {
    expect(JSON.stringify(createBody.parse({ ...base, bankStatus: 'confirmed' }))).toBe(
      explicitJson,
    );
    const response = await post({ ...base, bankStatus: 'confirmed' });
    expect(response.status).toBe(201);
    const result = await response.json();
    const stored = opened.db.select().from(schema.bookingDelivery).get()!;
    expect(createHash('sha256').update(explicitJson).digest('hex')).toBe(explicitHash);
    expect(stored.requestHash).toBe(explicitHash);
    const before = snapshot();
    expect(await (await post({ ...base, bankStatus: 'confirmed' })).json()).toEqual(result);
    for (const input of [base, { ...base, bankStatus: 'pending' }]) {
      const conflict = await post(input);
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({ error: 'idempotency_conflict' });
      expect(snapshot()).toEqual(before);
    }
  });

  it.each(['closed', 'retyped'] as const)(
    'replays saved legacy H0 before %s eligibility, retaining both old confirmations',
    async (changed) => {
      const legacy = createTransfer(
        opened.db,
        {
          fromAccountId: 'cash585',
          toAccountId: 'bank585',
          date: day,
          amountCents: 12345,
          status: 'confirmed',
        },
        { actor: 'fixture585', groupId: 'legacy-585-group' },
      );
      expect([
        getBooking(opened.db, legacy.fromBookingId)?.status,
        getBooking(opened.db, legacy.toBookingId)?.status,
      ]).toEqual(['confirmed', 'confirmed']);
      const saved = {
        ...legacy,
        groupId: 'legacy-585-group',
        bookings: [
          {
            id: legacy.fromBookingId,
            accountId: 'cash585',
            amountCents: -12345,
            status: 'confirmed',
          },
          { id: legacy.toBookingId, accountId: 'bank585', amountCents: 12345, status: 'confirmed' },
        ],
      };
      const responseJson = JSON.stringify(saved);
      opened.db
        .insert(schema.bookingDelivery)
        .values({ key: 'synthetic-legacy-585', requestHash: legacyHash, responseJson })
        .run();
      opened.db
        .update(schema.account)
        .set(changed === 'closed' ? { closedAt: day } : { type: 'credit_card' })
        .where(eq(schema.account.id, 'bank585'))
        .run();
      const before = snapshot();
      for (const input of [base, { ...base, status: 'confirmed' }]) {
        const replay = await post(input, 'synthetic-legacy-585');
        expect(replay.status).toBe(201);
        expect(await replay.text()).toBe(responseJson);
        expect(snapshot()).toEqual(before);
      }
      const conflict = await post({ ...base, bankStatus: 'confirmed' }, 'synthetic-legacy-585');
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({ error: 'idempotency_conflict' });
      expect(snapshot()).toEqual(before);
    },
  );

  it.each([
    'cash',
    'checking',
    'savings',
    'credit_card',
    'brokerage',
    'loan',
    'other_asset',
  ] as const)(
    'rejects supplied bank intent on noneligible cash/%s or bank/bank pair before any writes',
    async (type) => {
      account('other585', type);
      const request = {
        ...base,
        fromAccountId: type === 'checking' || type === 'savings' ? 'bank585' : 'cash585',
        toAccountId: 'other585',
      };
      // Existing noneligible transfers remain valid when no new bank-specific intent is supplied.
      const control = await post(request, 'synthetic-noneligible-control');
      expect(control.status).toBe(201);
      const before = snapshot();
      for (const bankStatus of ['pending', 'confirmed']) {
        const rejected = await post(
          { ...request, bankStatus },
          `synthetic-noneligible-${bankStatus}`,
        );
        expect(rejected.status).toBe(422);
        expect(await rejected.json()).toMatchObject({ error: 'invariant' });
        expect(snapshot()).toEqual(before);
      }
    },
  );

  it.each([null, 'reconciled', 'unexpected'])(
    'rejects invalid bankStatus=%s without writes',
    async (bankStatus) => {
      const before = snapshot();
      const response = await post({ ...base, bankStatus });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'invalid' });
      expect(snapshot()).toEqual(before);
    },
  );

  it('rolls back a real second-leg failure including audit and delivery, then accepts the same delivery key', async () => {
    let sawFirstLeg = false;
    opened.sqlite.function(
      'observe_first_leg_585',
      (count: number, amount: number, status: string) => {
        sawFirstLeg = count === 1 && amount === -12345 && status === 'confirmed';
        return 1;
      },
    );
    opened.sqlite.exec(`CREATE TRIGGER reject_second_leg_585 BEFORE INSERT ON booking
      WHEN NEW.account_id = 'bank585' BEGIN
      SELECT observe_first_leg_585(
        (SELECT COUNT(*) FROM booking WHERE account_id = 'cash585' AND deleted_at IS NULL),
        (SELECT amount_cents FROM booking WHERE account_id = 'cash585' AND deleted_at IS NULL),
        (SELECT status FROM booking WHERE account_id = 'cash585' AND deleted_at IS NULL));
      SELECT RAISE(ABORT, 'synthetic second-leg rejection'); END;`);
    const before = snapshot();
    const failed = await post(base, 'synthetic-rollback-585');
    expect(failed.status).toBe(422);
    expect(await failed.json()).toMatchObject({ error: 'constraint' });
    expect(sawFirstLeg).toBe(true);
    expect(snapshot()).toEqual(before);
    expect(balances()).toEqual({ cash585: 50000, bank585: 100000 });
    opened.sqlite.exec('DROP TRIGGER reject_second_leg_585');
    const retry = await post(base, 'synthetic-rollback-585');
    expect(retry.status).toBe(201);
    const result = (await retry.json()) as TransferAnswer;
    expect(pair(result).map((row) => row.status)).toEqual(['confirmed', 'pending']);
    expect(opened.db.select().from(schema.bookingDelivery).all()).toHaveLength(1);
  });
});
