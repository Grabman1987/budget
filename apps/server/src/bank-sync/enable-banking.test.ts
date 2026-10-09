import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { bankJwt, enableBanking } from './enable-banking';
import { bankSecretBox } from './secrets';
import type { BankError } from './provider';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const now = new Date('2026-10-01T00:00:00Z');
const row = {
  status: 'BOOK',
  transaction_id: 'unstable-a',
  entry_reference: 'entry-a',
  booking_date: '2026-09-30',
  credit_debit_indicator: 'DBIT',
  transaction_amount: { amount: '12.01', currency: 'EUR' },
  creditor: { name: 'Shop A' },
};
function adapter(responses: unknown[], extraInstitutions: string[] = []) {
  const http = vi.fn<typeof fetch>().mockImplementation(async () => {
    const data = responses.shift();
    if (data instanceof Response) return data;
    return Response.json(data);
  });
  return {
    provider: enableBanking({
      appId: 'synthetic-app',
      privateKey,
      fetch: http,
      now: () => now,
      extraInstitutions,
    }),
    http,
  };
}
describe('bank adapter with synthetic HTTP only', () => {
  it('fetches both BOOK and PDNG without the BOOK-only filter, rejecting other statuses', async () => {
    const { provider, http } = adapter([
      {
        transactions: [
          row,
          { ...row, status: 'PDNG', entry_reference: 'pending-a' },
          { ...row, status: 'CNCL' },
        ],
      },
    ]);
    const result = await provider.transactions('uid', '2026-09-01', '2026-10-01');
    expect(result.rows.map((r) => r.bankStatus)).toEqual(['booked', 'pending']);
    expect(new URL(String(http.mock.calls[0]![0])).searchParams.has('transaction_status')).toBe(
      false,
    );
  });
  it('signs a five-minute RS256 JWT with documented claims', () => {
    const jwt = bankJwt('synthetic-app', keys.privateKey, now);
    const [header, payload, signature] = jwt.split('.') as [string, string, string];
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      typ: 'JWT',
      alg: 'RS256',
      kid: 'synthetic-app',
    });
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    expect(claims).toEqual({
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
      iat: 1790812800,
      exp: 1790813100,
    });
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(header + '.' + payload),
        keys.publicKey,
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });
  it('encrypts at rest and refuses modified ciphertext or a different row context', () => {
    const box = bankSecretBox('ab'.repeat(32));
    const encrypted = box.seal('synthetic-session', 'row-a');
    expect(encrypted).not.toContain('synthetic-session');
    expect(box.open(encrypted, 'row-a')).toBe('synthetic-session');
    expect(() => box.open(encrypted, 'row-b')).toThrow();
    const changed = Buffer.from(encrypted.split(':')[1]!, 'base64');
    changed[28] = changed[28]! ^ 1;
    expect(() => box.open('v1:' + changed.toString('base64'), 'row-a')).toThrow();
  });
  it('reads legacy and previous-version ciphertexts during rotation, writes only the new version', () => {
    const old = bankSecretBox('ab'.repeat(32));
    const encrypted = old.seal('synthetic-session', 'row-a');
    expect(encrypted).toMatch(/^v1:/);
    const rotated = bankSecretBox('cd'.repeat(32), '2', { '1': 'ab'.repeat(32) });
    expect(rotated.open(encrypted, 'row-a')).toBe('synthetic-session');
    expect(rotated.open(encrypted.split(':')[1]!, 'row-a')).toBe('synthetic-session');
    const next = rotated.seal('synthetic-session', 'row-a');
    expect(next).toMatch(/^v2:/);
    expect(rotated.open(next, 'row-a')).toBe('synthetic-session');
    expect(() => rotated.open(next.replace('v2:', 'v1:'), 'row-a')).toThrow();
    expect(() => old.open(next, 'row-a')).toThrow();
    expect(() => bankSecretBox('bad')).toThrow();
    expect(() => bankSecretBox('ab'.repeat(32), 'unknown')).toThrow();
  });
  it('uses date fallback order and counts malformed, negative and out-of-window rows', async () => {
    const { provider } = adapter([
      {
        transactions: [
          { ...row, value_date: '2026-09-29', transaction_date: '2026-09-28' },
          { ...row, booking_date: null, value_date: '2026-09-29', transaction_date: '2026-09-28' },
          { ...row, booking_date: undefined, transaction_date: '2026-09-28' },
          { ...row, booking_date: undefined },
          { ...row, booking_date: '2026-08-31' },
          { ...row, booking_date: '2026-10-02' },
          { ...row, transaction_amount: { amount: '-1.01', currency: 'EUR' } },
          { ...row, transaction_amount: { amount: 'NaN', currency: 'EUR' } },
          { private_field: 'synthetic-redacted-row' },
        ],
      },
    ]);
    const result = await provider.transactions('uid', '2026-09-01', '2026-10-01');
    expect(result.rows.map((r) => r.date)).toEqual(['2026-09-30', '2026-09-29', '2026-09-28']);
    expect(result).toMatchObject({ skippedInvalid: 4, skippedOutOfWindow: 2 });
    expect(JSON.stringify(result)).not.toContain('synthetic-redacted-row');
  });
  it('caps transaction paging at three requests without publishing partial rows', async () => {
    const { provider, http } = adapter([
      { transactions: [row], continuation_key: 'page-2' },
      { transactions: [row], continuation_key: 'page-3' },
      { transactions: [row], continuation_key: 'page-4' },
    ]);
    const reserve = vi.fn();
    await expect(
      provider.transactions('uid', '2026-09-01', '2026-10-01', reserve),
    ).rejects.toMatchObject({ code: 'request_limit' });
    expect(http).toHaveBeenCalledTimes(3);
    expect(reserve).toHaveBeenCalledTimes(3);
  });
  it('returns an undated booked balance without substituting an available balance', async () => {
    const { provider } = adapter([
      {
        balances: [
          { balance_type: 'ITBD', balance_amount: { amount: '12.01', currency: 'EUR' } },
          {
            balance_type: 'CLAV',
            balance_amount: { amount: '15.01', currency: 'EUR' },
            reference_date: '2026-10-01',
          },
        ],
      },
    ]);
    expect(await provider.balance('uid')).toEqual({
      amountCents: 1201,
      currency: 'EUR',
      date: null,
    });
  });
  it.each([
    [401, 'EXPIRED_SESSION', 'auth_failed'],
    [403, 'EXPIRED_SESSION', 'consent_expired'],
    [403, 'ACCESS_DENIED', 'auth_failed'],
    [400, 'WRONG_TRANSACTIONS_PERIOD', 'history_unavailable'],
    [422, 'WRONG_TRANSACTIONS_PERIOD', 'history_unavailable'],
    [400, 'WRONG_REQUEST_PARAMETERS', 'unavailable'],
  ])('classifies HTTP %s / %s without leaking details', async (status, error, expected) => {
    const { provider } = adapter([
      Response.json({ error, message: 'synthetic-sensitive-detail' }, { status }),
    ]);
    await expect(provider.transactions('uid', '2026-09-01', '2026-10-01')).rejects.toMatchObject({
      code: expected,
      message: expected,
    });
  });
  it('includes extra institutions only from the owner allowlist, using exact names', async () => {
    const { provider } = adapter(
      [
        {
          aspsps: [
            { name: 'Bank A', country: 'AT' },
            { name: 'Bank B', country: 'DE' },
            { name: 'Bank B Extra', country: 'DE' },
          ],
        },
      ],
      ['bank b'],
    );
    expect((await provider.institutions()).map((i) => i.name)).toEqual(['Bank A', 'Bank B']);
  });
  it('pages booked and pending transactions and never uses unstable detail ids', async () => {
    const { provider, http } = adapter([
      { transactions: [row, { ...row, status: 'PDNG' }], continuation_key: 'page-next' },
      {
        transactions: [{ ...row, transaction_id: 'unstable-b', entry_reference: null }],
        continuation_key: null,
      },
    ]);
    expect(await provider.transactions('synthetic-uid', '2026-09-01', '2026-10-01')).toEqual({
      rows: [
        {
          bankStatus: 'booked',
          reference: 'entry-a',
          date: '2026-09-30',
          amountCents: -1201,
          currency: 'EUR',
          rawPayee: 'Shop A',
          memo: 'Shop A',
        },
        {
          bankStatus: 'pending',
          reference: 'entry-a',
          date: '2026-09-30',
          amountCents: -1201,
          currency: 'EUR',
          rawPayee: 'Shop A',
          memo: 'Shop A',
        },
        {
          bankStatus: 'booked',
          reference: null,
          date: '2026-09-30',
          amountCents: -1201,
          currency: 'EUR',
          rawPayee: 'Shop A',
          memo: 'Shop A',
        },
      ],
      skippedInvalid: 0,
      skippedOutOfWindow: 0,
    });
    expect(String(http.mock.calls[1]![0])).toContain('continuation_key=page-next');
    expect(String(http.mock.calls[0]![0])).not.toContain('transaction_status=BOOK');
    expect(http.mock.calls[0]![1]).toMatchObject({ redirect: 'error' });
  });
  it('preserves separate creditor and debtor names beside the original bank memo', async () => {
    const { provider } = adapter([
      {
        transactions: [
          { ...row, remittance_information: ['Ref: SYN-31'] },
          {
            ...row,
            entry_reference: 'entry-b',
            credit_debit_indicator: 'CRDT',
            debtor: { name: 'Shop B' },
            remittance_information: ['Ref: SYN-32'],
          },
        ],
      },
    ]);
    expect(
      (await provider.transactions('synthetic-uid', '2026-09-01', '2026-10-01')).rows.map(
        ({ rawPayee, memo, amountCents }) => ({ rawPayee, memo, amountCents }),
      ),
    ).toEqual([
      { rawPayee: 'Shop A', memo: 'Shop A · Ref: SYN-31', amountCents: -1201 },
      { rawPayee: 'Shop B', memo: 'Shop B · Ref: SYN-32', amountCents: 1201 },
    ]);
  });
  it('refuses paging cycles but skips malformed money with a redacted count', async () => {
    const cycle = adapter([
      { transactions: [row], continuation_key: 'same' },
      { transactions: [], continuation_key: 'same' },
    ]);
    await expect(
      cycle.provider.transactions('uid', '2026-09-01', '2026-10-01'),
    ).rejects.toMatchObject({ code: 'invalid_response' });
    const malformed = adapter([
      { transactions: [{ ...row, transaction_amount: { amount: '1.001', currency: 'EUR' } }] },
    ]);
    expect(await malformed.provider.transactions('uid', '2026-09-01', '2026-10-01')).toEqual({
      rows: [],
      skippedInvalid: 1,
      skippedOutOfWindow: 0,
    });
  });
  it('takes booked balances only and retains statement date', async () => {
    const { provider } = adapter([
      {
        balances: [
          {
            balance_type: 'CLAV',
            balance_amount: { amount: '900', currency: 'EUR' },
            reference_date: '2026-10-01',
          },
          {
            balance_type: 'CLBD',
            balance_amount: { amount: '12.01', currency: 'EUR' },
            reference_date: '2026-09-30',
          },
          {
            balance_type: 'ITBD',
            balance_amount: { amount: '-13.02', currency: 'EUR' },
            reference_date: '2026-10-01',
          },
        ],
      },
    ]);
    expect(await provider.balance('uid')).toEqual({
      amountCents: -1302,
      currency: 'EUR',
      date: '2026-10-01',
    });
    await expect(adapter([{ balances: [] }]).provider.balance('uid')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
  it('picks the balance of the requested currency on a multi-currency account', async () => {
    const balances = [
      { balance_type: 'CLBD', balance_amount: { amount: '5.00', currency: 'USD' } },
      { balance_type: 'CLBD', balance_amount: { amount: '12.01', currency: 'EUR' } },
    ];
    expect(await adapter([{ balances }]).provider.balance('uid', undefined, 'EUR')).toEqual({
      amountCents: 1201,
      currency: 'EUR',
      date: null,
    });
    expect(
      await adapter([{ balances: [balances[0]] }]).provider.balance('uid', undefined, 'EUR'),
    ).toBeNull();
  });
  it('returns a redacted retry delay, never provider bodies', async () => {
    const { provider, http } = adapter([
      new Response('sensitive-provider-error', { status: 429, headers: { 'retry-after': '3600' } }),
    ]);
    await expect(provider.institutions()).rejects.toMatchObject({
      code: 'rate_limited',
      retrySeconds: 3600,
      message: 'rate_limited',
    });
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('filters institutes and bounds consent by institution capability; rejects foreign redirect origins', async () => {
    const { provider, http } = adapter([
      {
        aspsps: [
          { name: 'Bank A', country: 'AT', maximum_consent_validity: 86400 },
          { name: 'Bank B', country: 'DE' },
        ],
      },
      { url: 'https://auth.enablebanking.com/ais/start?sessionid=synthetic' },
    ]);
    const institutions = await provider.institutions();
    expect(institutions).toEqual([{ name: 'Bank A', country: 'AT', maximumConsentSeconds: 86400 }]);
    await provider.authorize(
      institutions[0]!,
      'synthetic-state',
      'https://budget.example/einstellungen/datenquellen',
    );
    expect(JSON.parse(String(http.mock.calls[1]![1]?.body))).toMatchObject({
      access: { valid_until: '2026-10-02T00:00:00.000Z' },
      psu_type: 'personal',
    });
    await expect(
      adapter([
        { url: 'https://tilisy.enablebanking.com/welcome?sessionid=synthetic' },
      ]).provider.authorize(institutions[0]!, 'state', 'https://budget.example'),
    ).resolves.toBe('https://tilisy.enablebanking.com/welcome?sessionid=synthetic');
    await expect(
      adapter([{ url: 'https://untrusted.example/' }]).provider.authorize(
        institutions[0]!,
        'state',
        'https://budget.example',
      ),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('accepts real session shapes: null names, microsecond validity, IBAN-tail label', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { provider } = adapter([
      {
        session_id: 'synthetic-session',
        access: { valid_until: '2027-03-31T00:00:00.123456+00:00' },
        accounts: [
          {
            uid: 'acc-1',
            name: null,
            product: null,
            account_id: { iban: 'AT000000000000001234' },
            currency: 'EUR',
          },
          { uid: 'acc-2', name: 'Girokonto', currency: 'EUR' },
          { uid: 'acc-3', currency: 'EUR' },
        ],
      },
    ]);
    await expect(provider.session('synthetic-code')).resolves.toEqual({
      id: 'synthetic-session',
      validUntil: '2027-03-31T00:00:00.123Z',
      accounts: [
        { uid: 'acc-1', label: 'Konto …1234', currency: 'EUR' },
        { uid: 'acc-2', label: 'Girokonto', currency: 'EUR' },
        { uid: 'acc-3', label: 'Bankkonto 3', currency: 'EUR' },
      ],
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it('treats empty strings as missing labels', async () => {
    const { provider } = adapter([
      {
        session_id: 'synthetic-session',
        access: { valid_until: '2027-03-31T00:00:00+00:00' },
        accounts: [
          { uid: 'acc-1', name: '', product: '', account_id: { iban: '' }, currency: 'EUR' },
          { uid: 'acc-2', name: '', product: 'Sparen', account_id: null, currency: 'EUR' },
        ],
      },
    ]);
    await expect(provider.session('synthetic-code')).resolves.toMatchObject({
      accounts: [
        { uid: 'acc-1', label: 'Bankkonto 1' },
        { uid: 'acc-2', label: 'Sparen' },
      ],
    });
  });
  it('skips unusable accounts but keeps the valid ones, logging counts without values', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { provider } = adapter([
      {
        session_id: 'synthetic-session',
        access: { valid_until: '2027-03-31T00:00:00+00:00' },
        accounts: [
          { name: 'secret-no-uid', currency: 'EUR' },
          { uid: 'acc-2', name: 'Girokonto', currency: 'EUR' },
          { uid: 'secret-no-currency' },
          'secret-not-an-object',
        ],
      },
    ]);
    await expect(provider.session('synthetic-code')).resolves.toEqual({
      id: 'synthetic-session',
      validUntil: '2027-03-31T00:00:00.000Z',
      accounts: [{ uid: 'acc-2', label: 'Girokonto', currency: 'EUR' }],
    });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('3');
    expect(logged).not.toContain('secret');
    warn.mockRestore();
  });
  it('names the failing field when no account is usable, without any values', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { provider } = adapter([
      {
        session_id: 'secret-session-value',
        access: { valid_until: '2027-03-31T00:00:00+00:00' },
        accounts: [{ uid: '', name: 'secret-name', currency: 'EUR' }, { name: 'secret-name' }],
      },
    ]);
    const error = await provider.session('synthetic-code').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'invalid_response' });
    const detail = (error as BankError).detail!;
    expect(detail).toBe('too_small@accounts.0.uid, invalid_type@accounts.1.uid');
    expect(detail + JSON.stringify(warn.mock.calls) + String(error)).not.toContain('secret');
    warn.mockRestore();
  });
  it('reports the failing path for a malformed top-level response and for no accounts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      adapter([
        { session_id: 'secret-session-value', access: { valid_until: 'never' }, accounts: [] },
      ]).provider.session('synthetic-code'),
    ).rejects.toMatchObject({ detail: 'invalid_format@access.valid_until' });
    await expect(
      adapter([
        {
          session_id: 'synthetic-session',
          access: { valid_until: '2027-03-31T00:00:00Z' },
          accounts: [],
        },
      ]).provider.session('synthetic-code'),
    ).rejects.toMatchObject({ code: 'invalid_response', detail: 'too_small@accounts' });
    warn.mockRestore();
  });
  it('passes a validity longer than requested through for the caller to cap', async () => {
    const { provider } = adapter([
      {
        session_id: 'synthetic-session',
        access: { valid_until: '2031-01-01T00:00:00Z' },
        accounts: [{ uid: 'acc-1', currency: 'EUR' }],
      },
    ]);
    await expect(provider.session('synthetic-code')).resolves.toMatchObject({
      validUntil: '2031-01-01T00:00:00.000Z',
    });
  });
  it('logs only field paths of a rejected response, never values', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { provider } = adapter([
      { session_id: 'secret-session-value', access: { valid_until: 'never' }, accounts: [] },
    ]);
    await expect(provider.session('synthetic-code')).rejects.toMatchObject({
      code: 'invalid_response',
    });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('access.valid_until');
    expect(logged).not.toContain('secret-session-value');
    expect(logged).not.toContain('never');
    warn.mockRestore();
  });
});
