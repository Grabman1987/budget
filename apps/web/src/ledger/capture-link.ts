import { cents, formatDecimal, parseAmount } from '@budget/domain';
import { z } from 'zod';
import type { BookingDraft } from './booking-model';

const text = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (value) =>
      !Array.from(value).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ),
  );
const id = text.max(64).regex(/^[a-zA-Z0-9_-]+$/);
const amount = z
  .union([z.string(), z.number().finite()])
  .transform(String)
  .refine((v) => /^[+-]?\d{1,10}(?:[.,]\d{1,2})?$/.test(v))
  .transform((v) => v.replace('.', ','));

/** Optional, bounded query parameters. Invalid entries are ignored independently. */
export function validateCaptureSearch(search: Record<string, unknown>) {
  const read = <T>(schema: z.ZodType<T>, key: string) => {
    const result = schema.safeParse(search[key]);
    return result.success ? result.data : undefined;
  };
  return {
    betrag: read(amount, 'betrag'),
    empfaenger: read(text, 'empfaenger'),
    kategorie: read(id, 'kategorie'),
    konto: read(id, 'konto'),
  };
}
export type CaptureSearch = ReturnType<typeof validateCaptureSearch>;

export function capturePrefill(
  search: CaptureSearch,
  accountIds: readonly string[],
  categoryIds: readonly string[],
): Partial<BookingDraft> {
  const parsed = search.betrag === undefined ? undefined : parseAmount(search.betrag);
  return {
    ...(parsed?.ok
      ? {
          amount: formatDecimal(cents(Math.abs(parsed.cents))),
          kind: search.betrag?.startsWith('+') ? ('income' as const) : ('expense' as const),
        }
      : {}),
    ...(search.empfaenger ? { payee: search.empfaenger } : {}),
    ...(search.konto && accountIds.includes(search.konto) ? { accountId: search.konto } : {}),
    ...(search.kategorie && categoryIds.includes(search.kategorie)
      ? { categoryId: search.kategorie }
      : {}),
  };
}

/** Login continuation is restricted to the capture route, never an external URL. */
export function captureContinuation(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 1500) return undefined;
  let url: URL;
  try {
    url = new URL(value, 'https://budget.invalid');
  } catch {
    return undefined;
  }
  if (url.origin !== 'https://budget.invalid' || url.pathname !== '/erfassen') return undefined;
  const valid = validateCaptureSearch(Object.fromEntries(url.searchParams));
  const query = new URLSearchParams(
    Object.entries(valid).filter((p): p is [string, string] => p[1] !== undefined),
  );
  return `/erfassen${query.size ? `?${query}` : ''}`;
}
