/** Stable owner-facing ECOICOP codes; OGD now backcasts COICOP 2018 on base 2020. */
export const COICOP_CLASSES = [
  { code: '01.1', name: 'Nahrungsmittel', sourceCode: '011' },
  { code: '12.1.3', name: 'Körperpflegeartikel', sourceCode: '1312' },
  { code: '11.1', name: 'Bewirtungsdienstleistungen', sourceCode: '111' },
  { code: '07.2.2', name: 'Kraft- und Schmierstoffe', sourceCode: '0722' },
  { code: '12.5', name: 'Versicherungsdienstleistungen', sourceCode: '121' },
] as const;
export interface CoicopShare {
  code: string;
  shareBp: number;
}
export const coicopLabel = (mapping: ReadonlyArray<CoicopShare>) =>
  mapping
    .map(
      (m) =>
        `${m.code} ${COICOP_CLASSES.find((c) => c.code === m.code)?.name ?? m.code}${mapping.length > 1 ? ` (${(m.shareBp / 100).toLocaleString('de-AT')} %)` : ''}`,
    )
    .join(' / ');

/** Price relatives only: each class is rebased on the same first fully observed month. */
export function cpiPriceLevels(
  months: ReadonlyArray<string>,
  mapping: ReadonlyArray<CoicopShare>,
  series: Readonly<Record<string, Readonly<Record<string, number>>>>,
): Record<string, number | null> {
  const base = months.find(
    (m) => mapping.length > 0 && mapping.every((c) => (series[c.code]?.[m] ?? 0) > 0),
  );
  return Object.fromEntries(
    months.map((m) => [
      m,
      base && m >= base && mapping.every((c) => (series[c.code]?.[m] ?? 0) > 0)
        ? Math.round(
            mapping.reduce(
              (sum, c) => sum + (c.shareBp * series[c.code]![m]!) / series[c.code]![base]!,
              0,
            ),
          )
        : null,
    ]),
  );
}
