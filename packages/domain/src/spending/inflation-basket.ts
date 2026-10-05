import { z } from 'zod';

const id = z.string().min(1).max(64);
export const inflationBasketSetting = z
  .object({
    inclusion: z.enum(['always', 'never']).nullable().default(null),
    excludedPayeeIds: z.array(id.nullable()).max(500).default([]),
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
          })
          .strict()
          .refine(
            (c) =>
              c.inclusion !== undefined ||
              c.excludedPayeeIds !== undefined ||
              c.trailingMean !== undefined,
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
