import { z } from 'zod';
import { addMonths, lastDayOfMonth } from './date';

export const closeDecisionSchema = z.strictObject({
  step: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  id: z.string().min(1).max(150),
  fingerprint: z.string().min(1).max(100),
  reason: z.string().trim().min(1).max(500),
});
export const monthCloseStateSchema = z.strictObject({
  currentStep: z.int().min(1).max(5).default(1),
  decisions: z.array(closeDecisionSchema).max(1000).default([]),
});
export type CloseDecision = z.infer<typeof closeDecisionSchema>;
export type MonthCloseState = z.infer<typeof monthCloseStateSchema>;
export type CloseWork = Pick<CloseDecision, 'step' | 'id' | 'fingerprint'>;
export const CLOSE_TITLES = [
  'Posteingang leeren',
  'Konten abgleichen',
  'Überzogenes ausgleichen',
  'Nächsten Monat planen',
  'Monatsabschluss prüfen',
] as const;
export function closeSteps(work: CloseWork[], decisions: CloseDecision[]) {
  return CLOSE_TITLES.map((title, i) => {
    const step = i + 1;
    const items = work.filter((w) => w.step === step);
    const accepted = items.flatMap((w) =>
      decisions.filter(
        (d) => d.step === w.step && d.id === w.id && d.fingerprint === w.fingerprint,
      ),
    );
    const openCount = items.length - accepted.length;
    return {
      step,
      title,
      openCount,
      reasons: [...new Set(accepted.map((d) => d.reason))],
      status:
        step > 3
          ? ('following' as const)
          : openCount > 0
            ? ('open' as const)
            : accepted.length > 0
              ? ('skipped' as const)
              : ('done' as const),
    };
  });
}
export type CloseStep = ReturnType<typeof closeSteps>[number];
/** First five days close the previous month; last five days prepare the current one. */
export function closeEntryMonth(today: string): string | null {
  const month = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  return day <= 5
    ? addMonths(month, -1)
    : day >= Number(lastDayOfMonth(month).slice(8, 10)) - 4
      ? month
      : null;
}
