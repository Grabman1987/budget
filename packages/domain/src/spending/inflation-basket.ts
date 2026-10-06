import { z } from 'zod';
import { COICOP_CLASSES } from './coicop';

const method = z.enum(['cpi']).nullable();
const coicop = z
  .array(
    z
      .object({
        code: z.string().refine((code) => COICOP_CLASSES.some((c) => c.code === code)),
        shareBp: z.number().int().min(1).max(10000),
      })
      .strict(),
  )
  .max(2)
  .refine(
    (rows) =>
      !rows.length ||
      (rows.reduce((sum, r) => sum + r.shareBp, 0) === 10000 &&
        new Set(rows.map((r) => r.code)).size === rows.length),
    'Die Anteile müssen zusammen 100 % ergeben und unterschiedliche Klassen verwenden.',
  );

const id = z.string().min(1).max(64);
export const inflationBasketSetting = z
  .object({
    inclusion: z.enum(['always', 'never']).nullable().default(null),
    excludedPayeeIds: z.array(id.nullable()).max(500).default([]),
    method: method.default(null),
    coicop: coicop.default([]),
  })
  .strict();
export type InflationBasketSetting = z.infer<typeof inflationBasketSetting>;

export const inflationBasketChanges = z
  .object({
    changes: z
      .array(
        z
          .object({
            categoryId: id,
            inclusion: z.enum(['always', 'never']).nullable().optional(),
            excludedPayeeIds: z.array(id.nullable()).max(500).optional(),
            trailingMean: z.boolean().nullable().optional(),
            method: method.optional(),
            coicop: coicop.optional(),
          })
          .strict()
          .refine(
            (c) => c.method !== 'cpi' || c.coicop === undefined || c.coicop.length > 0,
            'Bitte eine COICOP-Klasse wählen.',
          )
          .refine(
            (c) =>
              c.inclusion !== undefined ||
              c.excludedPayeeIds !== undefined ||
              c.trailingMean !== undefined ||
              c.method !== undefined ||
              c.coicop !== undefined,
          ),
      )
      .min(1)
      .max(500),
  })
  .strict();

/** Automatic basket membership requires a need-class fixed/periodic obligation. */
export function inflationCategoryIncluded(
  category: { class: string | null; kind?: string | null },
  inclusion: InflationBasketSetting['inclusion'] = null,
): boolean {
  return (
    inclusion === 'always' ||
    (inclusion !== 'never' &&
      category.class === 'need' &&
      (category.kind === 'fixed' || category.kind === 'periodic'))
  );
}
