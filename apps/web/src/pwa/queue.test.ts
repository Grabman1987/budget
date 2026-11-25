// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import { emptyDraft } from '../ledger/booking-model';
import type { QueuedBooking } from './queue-store';
import { discardRejectedChange, queueReason, sendQueue, submitCapture } from './queue';

const memory = vi.hoisted(() => ({ rows: [] as QueuedBooking[], failWrite: false }));
const post = vi.hoisted(() => vi.fn());
const check = vi.hoisted(() => vi.fn());
const patch = vi.hoisted(() => vi.fn());
vi.mock('../ledger/api', () => ({
  createBooking: post,
  patchBooking: patch,
  readBookingDelivery: check,
}));
vi.mock('./queue-store', () => ({
  listQueue: async () => structuredClone(memory.rows),
  putQueued: async (row: QueuedBooking) => {
    if (memory.failWrite) throw new Error('Gerätespeicher nicht verfügbar.');
    memory.rows = [...memory.rows.filter((x) => x.id !== row.id), structuredClone(row)].sort(
      (a, b) => a.createdAt - b.createdAt,
    );
  },
  completeQueued: async ({ id }: { id: string }) => {
    memory.rows = memory.rows.filter((x) => x.id !== id);
  },
  deleteQueued: async (id: string) => {
    memory.rows = memory.rows.filter((x) => x.id !== id);
  },
  setQueuedSending: vi.fn(),
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
  patch.mockReset();
  check.mockReset().mockResolvedValue({ result: null });
  online(true);
});
describe('durable booking delivery', () => {
  it('discards only the explicitly refused edit and releases later captures', async () => {
    const refused: QueuedBooking = {
      id: 'refused',
      createdAt: 1,
      input,
      draft,
      uncertain: false,
      reason: 'Abgelehnt',
      change: { bookingId: 'older', patch: { memo: 'Entwurf' } },
    };
    memory.rows = [refused];
    await discardRejectedChange('unrelated');
    expect(memory.rows).toEqual([refused]);
    await discardRejectedChange('older');
    expect(memory.rows).toEqual([]);
    post.mockResolvedValue(result);
    expect(await submitCapture(input, draft)).toEqual(result);
  });
  it.each(['uncertain', 'sending', 'local'] as const)(
    'does not discard an edit that is %s',
    async (status) => {
      const held: QueuedBooking = {
        id: 'held',
        createdAt: 1,
        input,
        draft,
        uncertain: status === 'uncertain',
        sending: status === 'sending',
        ...(status !== 'local' ? { reason: 'Wartet' } : {}),
        change: { bookingId: 'older', patch: { memo: 'Entwurf' } },
      };
      memory.rows = [held];
      await discardRejectedChange('older');
      expect(memory.rows).toEqual([held]);
    },
  );
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
  it('checks a committed result first and never POSTs it again', async () => {
    post.mockRejectedValueOnce(new ApiError(0, 'network'));
    await submitCapture(input, draft);
    const original = memory.rows[0]!;
    check.mockResolvedValueOnce({ result });
    const sent = vi.fn();
    await sendQueue(sent);
    expect(check).toHaveBeenCalledExactlyOnceWith(original.id, { type: 'create', input });
    expect(post).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledWith(result);
    expect(memory.rows).toEqual([]);
  });
  it('retains uncertain intent without POST when the server check fails', async () => {
    post.mockRejectedValueOnce(new ApiError(0, 'network'));
    await submitCapture(input, draft);
    const original = memory.rows[0]!;
    check.mockRejectedValueOnce(new ApiError(401, 'unauthorized'));
    await sendQueue(vi.fn());
    expect(post).toHaveBeenCalledTimes(1);
    expect(memory.rows[0]).toMatchObject({ id: original.id, input, uncertain: true });
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
  it('drops a queued confirmation whose booking is no longer pending', async () => {
    const confirm: QueuedBooking = {
      id: 'confirm',
      createdAt: 1,
      input: { type: 'change', bookingId: 'b1' },
      draft,
      uncertain: false,
      change: { bookingId: 'b1', patch: { status: 'confirmed', acceptInReview: true } },
    };
    memory.rows = [confirm];
    patch.mockRejectedValue(new ApiError(409, 'booking_not_pending', 'Nicht mehr vorgemerkt.'));
    const sent = vi.fn();
    expect(await sendQueue(sent)).toBe(1);
    expect(memory.rows).toEqual([]);
    expect(sent).not.toHaveBeenCalled();
  });
  it('keeps other refusals of a queued confirmation as rejected', async () => {
    memory.rows = [
      {
        id: 'confirm',
        createdAt: 1,
        input: { type: 'change', bookingId: 'b1' },
        draft,
        uncertain: false,
        change: { bookingId: 'b1', patch: { status: 'confirmed', acceptInReview: true } },
      },
    ];
    patch.mockRejectedValue(new ApiError(409, 'invalid_review_acceptance', 'Abgelehnt.'));
    expect(await sendQueue(vi.fn())).toBe(0);
    expect(memory.rows[0]).toMatchObject({ rejected: true });
  });
  it.each(['account_closed', 'category_deleted', 'month_locked'])(
    'parks %s as rejected and continues with later items',
    async (code) => {
      online(false);
      await submitCapture(input, draft);
      await submitCapture(input, draft);
      online(true);
      post
        .mockRejectedValueOnce(new ApiError(409, code, 'Auswahl nicht verfügbar.'))
        .mockResolvedValueOnce(result);
      await sendQueue(vi.fn());
      expect(post).toHaveBeenCalledTimes(2);
      expect(memory.rows).toHaveLength(1);
      expect(memory.rows[0]).toMatchObject({ uncertain: false, rejected: true });
      expect(memory.rows[0]?.reason).toBeTruthy();
    },
  );
  it('parks an HTTP 500 as rejected with its error id; the other two of three still arrive', async () => {
    online(false);
    for (const cents of [-100, -200, -300])
      await submitCapture(
        { ...input, amountCents: cents, splits: [{ categoryId: 'c', amountCents: cents }] },
        { ...draft, amount: String(-cents / 100) },
      );
    const ids = memory.rows.map((x) => x.id);
    online(true);
    post
      .mockResolvedValueOnce(result)
      .mockRejectedValueOnce(new ApiError(500, 'server_error', 'intern', [], [], 'abc123def456'))
      .mockResolvedValueOnce(result);
    const sent = vi.fn();
    await sendQueue(sent);
    expect(sent).toHaveBeenCalledTimes(2);
    expect(post.mock.calls.map((call) => call[1])).toEqual(ids);
    expect(memory.rows).toHaveLength(1);
    expect(memory.rows[0]).toMatchObject({
      id: ids[1],
      rejected: true,
      uncertain: true,
      errorId: 'abc123def456',
    });
    expect(memory.rows[0]?.reason).not.toContain('intern');
    expect(memory.rows[0]?.reason).toBe('Der Server konnte diese Buchung nicht verarbeiten.');
    // The rejected draft is not retried automatically.
    await sendQueue(vi.fn());
    expect(post).toHaveBeenCalledTimes(3);
  });
  it('a parked 500 is checked before it can be edited: not delivered unlocks it, delivered completes it', async () => {
    const parked = (id: string): QueuedBooking => ({
      id,
      createdAt: 1,
      input,
      draft,
      uncertain: true,
      reason: 'x',
      rejected: true,
      errorId: 'abc123def456',
    });
    memory.rows = [parked('a')];
    await sendQueue(vi.fn(), () => undefined, true);
    expect(check).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
    expect(memory.rows[0]).toMatchObject({ id: 'a', rejected: true, uncertain: false });
    memory.rows = [parked('b')];
    check.mockResolvedValueOnce({ result });
    const sent = vi.fn();
    await sendQueue(sent, () => undefined, true);
    expect(sent).toHaveBeenCalledWith(result);
    expect(memory.rows).toEqual([]);
  });
  it('keeps 502-504 and network loss in the queue and blocks later items', async () => {
    online(false);
    await submitCapture(input, draft);
    await submitCapture(input, draft);
    online(true);
    post.mockRejectedValue(new ApiError(503, 'unavailable'));
    await sendQueue(vi.fn());
    expect(post).toHaveBeenCalledTimes(1);
    expect(memory.rows.map((x) => x.rejected)).toEqual([undefined, undefined]);
    expect(memory.rows[0]?.reason).toContain('nicht verfügbar');
  });
  it('recovers a committed HTTP 500 through its original receipt without a duplicate POST', async () => {
    post.mockRejectedValueOnce(
      new ApiError(500, 'server_error', undefined, [], [], 'abc123def456'),
    );
    expect(await submitCapture(input, draft)).toBeNull();
    const original = memory.rows[0]!;
    expect(original).toMatchObject({ rejected: true, uncertain: true });
    check.mockResolvedValueOnce({ result });
    const sent = vi.fn();
    await sendQueue(sent, () => undefined, true);
    expect(check).toHaveBeenCalledExactlyOnceWith(original.id, { type: 'create', input });
    expect(post).toHaveBeenCalledExactlyOnceWith(input, original.id);
    expect(sent).toHaveBeenCalledExactlyOnceWith(result);
    expect(memory.rows).toEqual([]);
  });
  it('keeps the original key when an HTTP 500 is confirmed undelivered and explicitly retried', async () => {
    post.mockRejectedValueOnce(new ApiError(500, 'server_error'));
    await submitCapture(input, draft);
    const original = memory.rows[0]!;
    const sent = vi.fn();
    await sendQueue(sent, () => undefined, true);
    expect(check).toHaveBeenCalledExactlyOnceWith(original.id, { type: 'create', input });
    expect(post).toHaveBeenCalledTimes(1);
    expect(memory.rows[0]).toMatchObject({
      id: original.id,
      input: { amountCents: -1250, splits: [{ categoryId: 'c', amountCents: -1250 }] },
      rejected: true,
      uncertain: false,
    });
    post.mockResolvedValueOnce(result);
    await sendQueue(sent, () => undefined, true);
    expect(post.mock.calls).toEqual([
      [input, original.id],
      [input, original.id],
    ]);
    expect(check).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledExactlyOnceWith(result);
    expect(memory.rows).toEqual([]);
  });
  it('parks validation errors as correctable drafts while later bookings arrive', async () => {
    online(false);
    await submitCapture(input, draft);
    await submitCapture(input, draft);
    await submitCapture(input, draft);
    const ids = memory.rows.map((row) => row.id);
    online(true);
    post
      .mockResolvedValueOnce(result)
      .mockRejectedValueOnce(new ApiError(422, 'invalid_booking', 'Bitte das Datum prüfen.'))
      .mockResolvedValueOnce(result);
    const sent = vi.fn();
    await sendQueue(sent);
    expect(post.mock.calls.map((call) => call[1])).toEqual(ids);
    expect(sent).toHaveBeenCalledTimes(2);
    expect(check).not.toHaveBeenCalled();
    expect(memory.rows).toHaveLength(1);
    expect(memory.rows[0]).toMatchObject({
      id: ids[1],
      input: { amountCents: -1250, date: '2026-10-02' },
      draft: { amount: '12,50' },
      reason: 'Bitte das Datum prüfen.',
      rejected: true,
      uncertain: false,
      sending: false,
    });
    memory.rows[0]!.input = { ...input, date: '2026-10-03' };
    memory.rows[0]!.draft = { ...draft, date: '2026-10-03' };
    post.mockResolvedValueOnce(result);
    await sendQueue(sent, () => undefined, true);
    expect(post.mock.calls[3]).toEqual([{ ...input, date: '2026-10-03' }, ids[1]]);
    expect(memory.rows).toEqual([]);
  });
  it('pauses the whole queue on connection loss and resumes in the original order', async () => {
    online(false);
    await submitCapture(input, draft);
    await submitCapture(input, draft);
    await submitCapture(input, draft);
    const ids = memory.rows.map((row) => row.id);
    online(true);
    post.mockRejectedValueOnce(new ApiError(0, 'network'));
    const sent = vi.fn();
    await sendQueue(sent);
    expect(post.mock.calls).toEqual([[input, ids[0]]]);
    expect(sent).not.toHaveBeenCalled();
    expect(memory.rows.map((row) => row.id)).toEqual(ids);
    expect(memory.rows[0]).toMatchObject({ uncertain: true, sending: false });
    expect(memory.rows.every((row) => !row.rejected)).toBe(true);
    post.mockResolvedValue(result);
    await sendQueue(sent);
    expect(check).toHaveBeenCalledExactlyOnceWith(ids[0], { type: 'create', input });
    expect(post.mock.calls.slice(1).map((call) => call[1])).toEqual(ids);
    expect(sent).toHaveBeenCalledTimes(3);
    expect(memory.rows).toEqual([]);
  });
  it('checks a persisted in-flight booking after reload before sending later entries', async () => {
    memory.rows = [
      { id: 'in-flight', createdAt: 1, input, draft, uncertain: true, sending: true },
      { id: 'later', createdAt: 2, input, draft, uncertain: false },
    ];
    const order: string[] = [];
    check.mockImplementationOnce(async () => {
      order.push('receipt:in-flight');
      return { result };
    });
    post.mockImplementationOnce(async (_input, key) => {
      order.push(`post:${key}`);
      return result;
    });
    const sent = vi.fn();
    await sendQueue(sent);
    expect(order).toEqual(['receipt:in-flight', 'post:later']);
    expect(check).toHaveBeenCalledExactlyOnceWith('in-flight', { type: 'create', input });
    expect(post).toHaveBeenCalledExactlyOnceWith(input, 'later');
    expect(sent).toHaveBeenCalledTimes(2);
    expect(memory.rows).toEqual([]);
  });
  it('a new capture is sent although a rejected draft sits at the head', async () => {
    memory.rows = [
      { id: 'draft', createdAt: 1, input, draft, uncertain: false, reason: 'x', rejected: true },
    ];
    post.mockResolvedValueOnce(result);
    expect(await submitCapture(input, draft)).toEqual(result);
  });
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
    expect(
      queueReason(
        new ApiError(500, 'server_error', 'Die Anfrage konnte nicht verarbeitet werden.'),
      ),
    ).toBe('Die Anfrage konnte nicht verarbeitet werden.');
  });
});
