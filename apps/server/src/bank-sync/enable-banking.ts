import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bankCents, type BankTransaction } from '@budget/domain';
import { z } from 'zod';
import { BankError, type BankInstitution, type BankProvider } from './provider';

const string = z.string().min(1).max(4096);
const day = z.iso.date();
const amount = z.object({ amount: string, currency: z.string().regex(/^[A-Z]{3}$/) });
const transaction = z.object({
  status: string,
  entry_reference: string.nullish(),
  booking_date: day.nullish(),
  value_date: day.nullish(),
  transaction_date: day.nullish(),
  transaction_amount: amount,
  credit_debit_indicator: z.enum(['CRDT', 'DBIT']),
  creditor: z.object({ name: string.optional() }).nullish(),
  debtor: z.object({ name: string.optional() }).nullish(),
  remittance_information: z.array(z.string().max(4096)).max(100).optional(),
});
export function bankJwt(appId: string, key: KeyObject, now = new Date()): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const iat = Math.floor(now.getTime() / 1000);
  const body =
    encode({ typ: 'JWT', alg: 'RS256', kid: appId }) +
    '.' +
    encode({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 300 });
  return body + '.' + sign('RSA-SHA256', Buffer.from(body), key).toString('base64url');
}

/** Fixed origin, no redirects, bounded requests, no provider response text in errors or logs. */
export function enableBanking(options: {
  appId: string;
  privateKey: string;
  fetch?: typeof fetch;
  now?: () => Date;
  extraInstitutions?: readonly string[];
}): BankProvider {
  const key = createPrivateKey(options.privateKey);
  if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)
    throw new BankError('not_configured');
  const now = options.now ?? (() => new Date());
  const http = options.fetch ?? fetch;
  async function readJson(response: Response): Promise<unknown> {
    // Bound the decoded body too, not only a possibly missing Content-Length.
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 4_000_000) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  }
  async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await http('https://api.enablebanking.com' + path, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: 'Bearer ' + bankJwt(options.appId, key, now()),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new BankError('unavailable');
    }
    if (!response.ok) {
      const retry = response.headers.get('retry-after');
      const seconds =
        retry && /^\d+$/.test(retry)
          ? Number(retry)
          : retry
            ? Math.ceil((Date.parse(retry) - now().getTime()) / 1000)
            : 900;
      let providerCode: string | undefined;
      try {
        providerCode = z.object({ error: z.string() }).parse(await readJson(response)).error;
      } catch {
        // Error bodies are untrusted; retain only an allowlisted classification.
      }
      throw new BankError(
        response.status === 429
          ? 'rate_limited'
          : response.status === 401
            ? 'auth_failed'
            : ['EXPIRED_SESSION', 'CLOSED_SESSION', 'REVOKED_SESSION'].includes(providerCode ?? '')
              ? 'consent_expired'
              : path.includes('/transactions?') && providerCode === 'WRONG_TRANSACTIONS_PERIOD'
                ? 'history_unavailable'
                : response.status === 403
                  ? 'auth_failed'
                  : 'unavailable',
        Number.isFinite(seconds) ? Math.max(60, Math.min(seconds, 86400)) : 900,
      );
    }
    try {
      return schema.parse(await readJson(response));
    } catch {
      throw new BankError('invalid_response');
    }
  }
  return {
    async institutions() {
      const data = await request(
        '/aspsps?service=AIS&psu_type=personal',
        z.object({
          aspsps: z
            .array(
              z.object({
                name: string,
                country: z.string().length(2),
                maximum_consent_validity: z.number().int().positive().optional(),
              }),
            )
            .max(10000),
        }),
      );
      return data.aspsps
        .filter(
          (a) =>
            a.country === 'AT' ||
            options.extraInstitutions?.some(
              (name) => name.toLocaleLowerCase() === a.name.toLocaleLowerCase(),
            ),
        )
        .map((a) => ({
          name: a.name,
          country: a.country,
          maximumConsentSeconds: Math.min(a.maximum_consent_validity ?? 15552000, 15552000),
        }));
    },
    async authorize(institution: BankInstitution, state: string, redirect: string) {
      const data = await request('/auth', z.object({ url: z.url() }), {
        access: {
          valid_until: new Date(
            now().getTime() + institution.maximumConsentSeconds * 1000,
          ).toISOString(),
        },
        aspsp: { name: institution.name, country: institution.country },
        state,
        redirect_url: redirect,
        psu_type: 'personal',
        language: 'de',
      });
      const url = new URL(data.url);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'auth.enablebanking.com' ||
        url.username ||
        url.password
      )
        throw new BankError('invalid_response');
      return url.href;
    },
    async session(code) {
      const data = await request(
        '/sessions',
        z.object({
          session_id: string,
          access: z.object({ valid_until: z.iso.datetime({ offset: true }) }),
          accounts: z
            .array(
              z.object({ uid: string, name: string.optional(), currency: z.string().length(3) }),
            )
            .min(1)
            .max(100),
        }),
        { code },
      );
      return {
        id: data.session_id,
        validUntil: new Date(data.access.valid_until).toISOString(),
        accounts: data.accounts.map((a, i) => ({
          uid: a.uid,
          label: a.name ?? 'Bankkonto ' + (i + 1),
          currency: a.currency,
        })),
      };
    },
    async transactions(uid, from, to, beforeRequest) {
      const rows: BankTransaction[] = [];
      let skippedInvalid = 0;
      let skippedOutOfWindow = 0;
      let pages = 0;
      const seen = new Set<string>();
      let continuation: string | null | undefined;
      do {
        const params = new URLSearchParams({
          date_from: from,
          date_to: to,
          transaction_status: 'BOOK',
        });
        if (continuation) params.set('continuation_key', continuation);
        if (++pages > 3) throw new BankError('request_limit', 86400);
        beforeRequest?.();
        const data = await request(
          '/accounts/' + encodeURIComponent(uid) + '/transactions?' + params,
          z.object({
            transactions: z.array(z.unknown()).max(10000),
            continuation_key: string.nullish(),
          }),
        );
        for (const raw of data.transactions) {
          const parsed = transaction.safeParse(raw);
          if (!parsed.success) {
            skippedInvalid++;
            continue;
          }
          const row = parsed.data;
          if (row.status !== 'BOOK') continue;
          const date = row.booking_date ?? row.value_date ?? row.transaction_date;
          if (!date) {
            skippedInvalid++;
            continue;
          }
          if (date < from || date > to) {
            skippedOutOfWindow++;
            continue;
          }
          let cents: number;
          try {
            cents = bankCents(row.transaction_amount.amount);
            if (cents < 0) throw new RangeError();
          } catch {
            skippedInvalid++;
            continue;
          }
          rows.push({
            reference: row.entry_reference ?? null,
            date,
            amountCents: row.credit_debit_indicator === 'DBIT' ? -cents : cents,
            currency: row.transaction_amount.currency,
            rawPayee:
              (row.credit_debit_indicator === 'DBIT' ? row.creditor?.name : row.debtor?.name) ??
              null,
            memo: [
              row.credit_debit_indicator === 'DBIT' ? row.creditor?.name : row.debtor?.name,
              ...(row.remittance_information ?? []),
            ]
              .filter(Boolean)
              .join(' · ')
              .slice(0, 4096),
          });
        }
        continuation = data.continuation_key;
        if (continuation && (seen.has(continuation) || seen.size >= 100 || rows.length > 100000))
          throw new BankError('invalid_response');
        if (continuation) seen.add(continuation);
      } while (continuation);
      return { rows, skippedInvalid, skippedOutOfWindow };
    },
    async balance(uid, beforeRequest) {
      beforeRequest?.();
      const data = await request(
        '/accounts/' + encodeURIComponent(uid) + '/balances',
        z.object({
          balances: z
            .array(
              z.object({
                balance_type: string,
                balance_amount: amount,
                reference_date: day.nullish(),
              }),
            )
            .max(100),
        }),
      );
      const booked = data.balances
        .filter((b) => ['ITBD', 'CLBD'].includes(b.balance_type))
        .sort(
          (a, b) =>
            (b.reference_date ?? '').localeCompare(a.reference_date ?? '') ||
            (a.balance_type === 'ITBD' ? -1 : 1),
        )[0];
      if (!booked) throw new BankError('invalid_response');
      return {
        amountCents: bankCents(booked.balance_amount.amount),
        currency: booked.balance_amount.currency,
        date: booked.reference_date ?? null,
      };
    },
  };
}

export function bankProviderFromEnv(): BankProvider | null {
  const appId = process.env['ENABLE_BANKING_APP_ID'];
  if (!appId) return null;
  const key =
    process.env['ENABLE_BANKING_PRIVATE_KEY'] ??
    (process.env['ENABLE_BANKING_PRIVATE_KEY_PATH']
      ? readFileSync(process.env['ENABLE_BANKING_PRIVATE_KEY_PATH'], 'utf8')
      : '');
  return enableBanking({
    appId,
    privateKey: key.replace(/\\n/g, '\n'),
    extraInstitutions: (process.env['BANK_SYNC_EXTRA_INSTITUTIONS'] ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  });
}
