import type { Heute } from './api';

/**
 * Wording and horizon of the Heute lead. Period "Bis Gehalt" leads with "Frei bis Gehalt", period
 * "Monat" with "Frei bis Monatsende" (same definition, other boundary). Saved responses without
 * `leadBoundary` always carry the payday lead.
 */
export interface LeadView {
  kind: 'payday' | 'monthEnd';
  /** Boundary day shown to the user (payday, or last day of the month). */
  day: string;
  days: number;
  /** "Frei bis Gehalt" / "Frei bis Monatsende" */
  title: string;
  /** "Gehalt" / "Monatsende" */
  end: string;
  /** "bis Gehalt" / "bis Monatsende" */
  until: string;
  /** "bis zum Gehalt" / "bis zum Monatsende" */
  untilThe: string;
}

export function leadView(data: Pick<Heute, 'leadBoundary' | 'stand'>): LeadView {
  const b = data.leadBoundary;
  const kind = b?.kind ?? 'payday';
  const end = kind === 'monthEnd' ? 'Monatsende' : 'Gehalt';
  return {
    kind,
    day: b?.day ?? data.stand.payday.day,
    days: b?.daysToBoundary ?? data.stand.payday.daysToPayday,
    title: `Frei bis ${end}`,
    end,
    until: `bis ${end}`,
    untilThe: `bis zum ${end}`,
  };
}
