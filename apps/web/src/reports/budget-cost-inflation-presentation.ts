import { cents } from '@budget/domain';
import type {
  BankCostsReport,
  BudgetAdherenceReport,
  ContractsReport,
  InflationReport,
  PlanningAccuracyReport,
} from '@budget/db';
import type { ReportCalculation } from './report-frame';
import { monthShort } from './spending-shared';
const exactPercent = (bp: number) =>
  `${bp < 0 ? '−' : bp > 0 ? '+' : ''}${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(Math.abs(bp) / 100)} %`;

export function adherenceCalculation(data: BudgetAdherenceReport): ReportCalculation {
  return {
    label: 'Berechnung Plan gegen Ist',
    signed: true,
    terms:
      data.status === 'ok'
        ? [
            { label: 'Monatsplan', value: cents(data.planCents) },
            { op: '-', label: data.live ? 'Ist bis heute' : 'Ist', value: cents(data.istCents) },
          ]
        : [],
    result: {
      label:
        data.live && data.restCents < 0 ? 'Über Plan · Handlungsbedarf' : 'Rest zum Monatsplan',
      value: data.status === 'ok' ? data.restCents : null,
      unit: 'money',
    },
  };
}

/** Display-only grouping of the reader's exact category rows, including negative assignments. */
export function adherenceGroups(data: Pick<BudgetAdherenceReport, 'groups' | 'items'>) {
  return data.groups.map((name) => {
    const items = data.items.filter((item) => item.groupName === name);
    return {
      name,
      planCents: items.reduce((sum, item) => sum + item.planCents, 0),
      istCents: items.reduce((sum, item) => sum + item.istCents, 0),
    };
  });
}

export function contractsCalculation(data: ContractsReport): ReportCalculation {
  return {
    label: 'Berechnung Jahresäquivalent der Verträge',
    terms: [
      {
        label: 'Fix je Jahr · Monatsbasis × 12',
        value: cents(data.yearlyCents - data.periodicAnnualCents),
      },
      {
        op: '+',
        label: 'Periodisch je Jahr',
        value: cents(data.periodicAnnualCents),
      },
    ],
    result: {
      label: `Jahresäquivalent · ${data.items.length} Verträge`,
      value: data.yearlyCents,
      unit: 'money',
    },
  };
}

export function bankCostsCalculation(data: BankCostsReport): ReportCalculation {
  const estimated = data.rows.find((row) => row.key === 'modeledInterest')?.cents ?? 0;
  return {
    label: 'Berechnung bekannte Bank- und Zinskosten',
    terms: [
      { label: 'Gebucht', value: cents(data.totalCents - estimated) },
      { op: '+', label: 'Geschätzte Zinsen', value: cents(estimated) },
    ],
    result: {
      label: 'Bekannte Kosten · gebucht und geschätzt',
      value: data.months.length ? data.totalCents : null,
      unit: 'money',
    },
  };
}

export function accuracyCalculation(data: PlanningAccuracyReport): ReportCalculation {
  return {
    label: 'Basis Prognosegenauigkeit',
    terms: [],
    displayTerms: [
      { label: 'Ø |Prognose − Ist| ÷ Ist', text: `${data.summary.count} auswertbare Monate` },
    ],
    result: {
      label:
        data.summary.count < 2
          ? 'Unter 2 auswertbaren Monaten · noch nicht belastbar'
          : 'Mittlere absolute Prognoseabweichung · 6 Monate',
      value: data.summary.count >= 2 ? data.summary.meanAbsoluteBp : null,
      unit: 'percent',
    },
  };
}

export function inflationCalculation(data: InflationReport): ReportCalculation {
  const comparison = data.latestComparison;
  return comparison
    ? {
        label: 'Inflationsvergleich im gleichen Vorjahresfenster',
        terms: [],
        displayTerms: [
          { label: 'Eigene Teuerung', text: exactPercent(comparison.ownBp) },
          { op: '−', label: 'VPI', text: exactPercent(comparison.referenceBp) },
        ],
        signed: true,
        pointsLabel: 'Pp',
        result: {
          label: `Differenz zum VPI · ${monthShort(comparison.month)}`,
          value: comparison.differenceBp / 100,
          unit: 'points',
        },
      }
    : {
        label: 'Warenkorbindex im Vorjahresfenster',
        terms: [],
        displayTerms:
          data.indexFrom !== null && data.indexTo !== null && data.fromMonth && data.toMonth
            ? [
                {
                  label: monthShort(data.fromMonth),
                  text: String(data.indexFrom).replace('.', ','),
                },
                {
                  op: '→',
                  label: monthShort(data.toMonth),
                  text: String(data.indexTo).replace('.', ','),
                },
              ]
            : [],
        result: {
          label: 'Eigene Teuerung · ohne gemeinsamen VPI-Vergleich',
          value: data.inflationBp,
          unit: 'percent',
        },
      };
}
