import { parseAmount, projectFreedom, type FreedomProjection } from '@budget/domain';
import type { FreedomView } from './freedom-api';
import { percentText } from './portfolio-format';

export const percent = (bp: number) => percentText(bp).replace(/ %$/, '');
export const monthText = (month: string) =>
  new Intl.DateTimeFormat('de-AT', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

/** Explicit ephemeral scenario, using the one shared projection. No inferred saving rate. */
export function freedomScenario(
  view: FreedomView,
  saving: string,
  returnBp: number,
): { projection: FreedomProjection | null; error: string } {
  if (!saving.trim()) return { projection: null, error: '' };
  const parsed = parseAmount(saving);
  if (!parsed.ok || !Number.isSafeInteger(parsed.cents) || parsed.cents < 0) {
    return { projection: null, error: 'Bitte einen Betrag ab 0 eingeben. Rechnen ist erlaubt.' };
  }
  if (
    view.investedCents === null ||
    view.targetCents === null ||
    view.targetCents <= 0 ||
    !view.months.length
  ) {
    return { projection: null, error: '' };
  }
  try {
    return {
      projection: projectFreedom({
        investedCents: view.investedCents,
        targetCents: view.targetCents,
        monthlySavingCents: parsed.cents,
        realReturnBp: returnBp,
        startMonth: view.asOf.slice(0, 7),
      }),
      error: '',
    };
  } catch {
    return {
      projection: null,
      error:
        'Diese Annahmen überschreiten den sicheren Rechenbereich. Bitte einen kleineren Betrag eingeben.',
    };
  }
}
