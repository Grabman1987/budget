export type PaymentView = 'next' | 'contracts' | 'all' | 'kalender';
export function validateExpectedSearch(search: Record<string, unknown>): {
  ansicht: PaymentView | undefined;
  art: 'all' | 'inflow' | 'outflow' | undefined;
  tage: 35 | 90 | undefined;
} {
  return {
    ansicht: ['next', 'contracts', 'all', 'kalender'].includes(String(search['ansicht']))
      ? (search['ansicht'] as PaymentView)
      : undefined,
    art: ['all', 'inflow', 'outflow'].includes(String(search['art']))
      ? (search['art'] as 'all' | 'inflow' | 'outflow')
      : undefined,
    tage:
      search['tage'] === 90 || search['tage'] === '90'
        ? 90
        : search['tage'] === 35 || search['tage'] === '35'
          ? 35
          : undefined,
  };
}
