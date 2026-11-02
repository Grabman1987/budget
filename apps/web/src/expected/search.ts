export type PaymentView = 'next' | 'contracts' | 'all' | 'kalender';
export function validateExpectedSearch(search: Record<string, unknown>) {
  return {
    ansicht: ['next', 'contracts', 'all', 'kalender'].includes(String(search['ansicht']))
      ? (search['ansicht'] as PaymentView)
      : undefined,
    art: search['art'] === 'inflow' || search['art'] === 'outflow' ? search['art'] : 'all',
    tage: search['tage'] === 90 || search['tage'] === '90' ? 90 : 35,
  };
}
