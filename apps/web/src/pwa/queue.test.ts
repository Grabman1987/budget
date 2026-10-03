// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import { emptyDraft } from '../ledger/booking-model';
import type { QueuedBooking } from './queue-store';
import { queueReason, sendQueue, submitCapture } from './queue';

const memory = vi.hoisted(() => ({ rows: [] as QueuedBooking[], failWrite: false }));
const post = vi.hoisted(() => vi.fn());
vi.mock('../ledger/api', () => ({ createBooking: post }));
vi.mock('./queue-store', () => ({
  listQueue: async () => structuredClone(memory.rows),
  putQueued: async (row: QueuedBooking) => {
    if (memory.failWrite) throw new Error('Gerätespeicher nicht verfügbar.');
    memory.rows = [...memory.rows.filter((x) => x.id !== row.id), structuredClone(row)].sort(
      (a, b) => a.createdAt - b.createdAt,
    );
  },
  deleteQueued: async (id: string) => {
    memory.rows = memory.rows.filter((x) => x.id !== id);
  },
  withQueueLock: <T>(fn: () => Promise<T>) => fn(),
}));

const input = {
  type: 'booking' as const,
  accountId: 'a',
  date: '2026-10-02',
  amountCents: -1250,
  splits: [{ categoryId: 'c', amountCents: -1250 }],
};
const draft = { ...emptyDraft('a', input.date), amount: '12,50', categoryId: 'c' };
const result = { bookings: [{ id: 'booked' }], groupId: 'audit' };
const online = (value: boolean) =>
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });

beforeEach(() => {
  memory.rows = [];
  memory.failWrite = false;
  post.mockReset();
  online(true);
});
describe('durable booking delivery', () => {
  it('does not claim a local save or send when device storage rejects the write', async () => {
    memory.failWrite = true;
    await expect(submitCapture(input, draft)).rejects.toThrow('Gerätespeicher');
    expect(memory.rows).toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });
  it('keeps integer cents and fields offline without calling the API', async () => {
    online(false);
    expect(await submitCapture(input, draft)).toBeNull();
    expect(memory.rows).toHaveLength(1);
    expect(memory.rows[0]).toMatchObject({ input, draft, uncertain: false });
    expect(post).not.toHaveBeenCalled();
  });
  it('writes before POST and uses the identical key/body after a lost response', async () => {
    post
      .mockImplementationOnce(async (_input, key) => {
        expect(memory.rows[0]).toMatchObject({ id: key, uncertain: true });
        throw new ApiError(0, 'network');
      })
      .mockResolvedValue(result);
    expect(await submitCapture(input, draft)).toBeNull();
    const original = memory.rows[0]!;
    expect(original.uncertain).toBe(true);
    const sent = vi.fn();
    await sendQueue(sent);
    expect(post.mock.calls[1]).toEqual([original.input, original.id]);
    expect(memory.rows).toEqual([]);
    expect(sent).toHaveBeenCalledWith(result);
  });
  it('retains an expired session and retries after login in FIFO order', async () => {
    online(false);
    await submitCapture(input, draft);
    await submitCapture(
      { ...input, amountCents: -200, splits: [{ categoryId: 'c', amountCents: -200 }] },
      { ...draft, amount: '2' },
    );
    const ids = memory.rows.map((x) => x.id);
    online(true);
    post.mockRejectedValueOnce(new ApiError(401, 'unauthorized'));
    await sendQueue(vi.fn());
    expect(memory.rows[0]?.reason).toContain('erneut anmelden');
    expect(memory.rows).toHaveLength(2);
    post.mockResolvedValue(result);
    await sendQueue(vi.fn());
    expect(post.mock.calls.slice(1).map((x) => x[1])).toEqual(ids);
    expect(memory.rows).toEqual([]);
  });
  it.each(['account_closed', 'category_deleted', 'month_locked'])(
    'stops at %s and leaves later items untouched',
    async (code) => {
      online(false);
      await submitCapture(input, draft);
      await submitCapture(input, draft);
      online(true);
      post.mockRejectedValue(new ApiError(409, code, 'Auswahl nicht verfügbar.'));
      await sendQueue(vi.fn());
      expect(post).toHaveBeenCalledTimes(1);
      expect(memory.rows).toHaveLength(2);
      expect(memory.rows[0]?.uncertain).toBe(false);
      expect(memory.rows[0]?.reason).toBeTruthy();
    },
  );
  it('does not overtake an earlier waiting item on a new online capture', async () => {
    online(false);
    await submitCapture(input, draft);
    online(true);
    expect(await submitCapture(input, draft)).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
  it('holds FIFO delivery while the owner edits the first item', async () => {
    online(false);
    await submitCapture(input, draft);
    online(true);
    await sendQueue(vi.fn(), () => memory.rows[0]?.id);
    expect(post).not.toHaveBeenCalled();
    expect(memory.rows).toHaveLength(1);
  });
  it('explains server failure without retaining technical response content', () => {
    expect(queueReason(new ApiError(500, 'server_error', 'sensitive internals'))).not.toContain(
      'sensitive',
    );
  });
});
