export type PlanYearMetric = 'assignedCents' | 'activityCents' | 'availableCents';

/** URL state of the year worksheet. Event IDs keep the existing bounded contract. */
export function validatePlanYearSearch(search: Record<string, unknown>) {
  return {
    ereignis:
      typeof search['ereignis'] === 'string' && search['ereignis'].length <= 64
        ? search['ereignis']
        : undefined,
    kennzahl: ['assignedCents', 'activityCents', 'availableCents'].includes(
      String(search['kennzahl']),
    )
      ? (search['kennzahl'] as PlanYearMetric)
      : undefined,
  };
}
