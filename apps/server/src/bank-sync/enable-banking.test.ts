import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { bankJwt, enableBanking } from './enable-banking';
import { bankSecretBox } from './secrets';

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
  it('pages booked transactions, drops pending, and never uses unstable detail ids', async () => {
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
          reference: 'entry-a',
          date: '2026-09-30',
          amountCents: -1201,
          currency: 'EUR',
          memo: 'Shop A',
        },
        {
          reference: null,
          date: '2026-09-30',
          amountCents: -1201,
          currency: 'EUR',
          memo: 'Shop A',
        },
      ],
      skippedInvalid: 0,
      skippedOutOfWindow: 0,
    });
    expect(String(http.mock.calls[1]![0])).toContain('continuation_key=page-next');
    expect(String(http.mock.calls[0]![0])).toContain('transaction_status=BOOK');
    expect(http.mock.calls[0]![1]).toMatchObject({ redirect: 'error' });
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
      adapter([{ url: 'https://untrusted.example/' }]).provider.authorize(
        institutions[0]!,
        'state',
        'https://budget.example',
      ),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
