import { targetTiersFromStarts } from './target-policy';

export const WEALTH_STAGE_ROLES = [
  ['world', 'Weltaktien'],
  ['leveraged', 'Aktien mit Hebel 2×'],
  ['managed', 'Managed Futures'],
  ['reserve', 'Liquidität / kurzlaufende EUR-Anlagen'],
] as const;
export type WealthStageRole = (typeof WEALTH_STAGE_ROLES)[number][0];

/** Generic editable owner-requested scenario, not a product recommendation or trading order. */
export function wealthStageTemplate(classes: Record<WealthStageRole, string>) {
  const ids = WEALTH_STAGE_ROLES.map(([role]) => classes[role]);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
    throw new RangeError('Bitte vier unterschiedliche Anlageklassen zuordnen.');
  const stages = [
    { fromCents: 0, label: 'Start', weights: [8500, 1500, 0, 0], condition: '' },
    {
      fromCents: 1_000_000,
      label: 'Diversifikation',
      weights: [7500, 500, 2000, 0],
      condition: 'Managed-Futures-Produkt prüfen und freigeben. Neue Einzahlungen bevorzugen.',
    },
    {
      fromCents: 5_000_000,
      label: 'Risikoprüfung',
      weights: [7500, 500, 2000, 0],
      condition:
        'Managed Futures freigeben; Volatilität, Drawdown, Extremverluste und Währungsrisiken prüfen.',
    },
    {
      fromCents: 10_000_000,
      label: 'Strategieprüfung',
      weights: [7500, 500, 2000, 0],
      condition:
        'Managed Futures freigeben. Erweiterungen nur nach Kosten-, Steuer- und Risikoprüfung.',
    },
    {
      fromCents: 50_000_000,
      label: 'Vermögensarchitektur',
      weights: [6500, 500, 2000, 1000],
      condition:
        'Managed Futures freigeben; Reserve nur bei bestätigtem Liquiditätsbedarf vorsehen.',
    },
    {
      fromCents: 100_000_000,
      label: 'Vermögen erhalten',
      weights: [6000, 500, 2000, 1500],
      condition:
        'Managed Futures freigeben; Liquiditätspuffer anhand der tatsächlichen Entnahmeplanung bestätigen.',
    },
    {
      fromCents: 200_000_000,
      label: 'Vermögen weiterentwickeln',
      weights: [6000, 500, 2000, 1500],
      condition: 'Managed Futures freigeben; Risikotragfähigkeit und Entnahmebedarf erneut prüfen.',
    },
  ];
  return targetTiersFromStarts(
    stages.map((s) => ({
      fromCents: s.fromCents,
      label: s.label,
      condition: s.condition,
      enabled: !s.condition,
      targets: ids.map((assetClassId, i) => ({ assetClassId, targetShareBp: s.weights[i]! })),
    })),
  );
}
