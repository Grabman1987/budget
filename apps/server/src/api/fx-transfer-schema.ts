import { z } from 'zod';
import { cents, day } from './schemas';

const id = z.string().min(1).max(64);
const provenance = z.string().trim().min(1).max(500);
/** Facts only; no source, bank reference, inferred rate or embedded-fee variant. */
export const fxTransferBody = z.strictObject({
  fromAccountId: id, toAccountId: id,
  fromCurrency: z.enum(['EUR', 'USD']), toCurrency: z.enum(['EUR', 'USD']),
  date: day,
  fromAmountCents: cents.positive(), toAmountCents: cents.positive(),
  quotedRate: z.string().trim().min(1).max(40).regex(/^\d+(?:[.,]\d+)?$/),
  orientation: z.literal('destination/source'), provenance,
  principalAmountsConfirmed: z.literal(true),
  feeTreatment: z.enum(['none', 'separate']),
  categoryId: id.nullable().optional(),
  fee: z.strictObject({ accountId: id, amountCents: cents.positive(), date: day,
    categoryId: id, provenance }).optional(),
});
