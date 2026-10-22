import type { ReactNode } from 'react';
import { addDays } from '@budget/domain';
import { maskMoneyText } from '@budget/ui';
import type { HeuteSectionData } from '../heute/api';
import type { ApiRead } from '../api/http';
import { eur } from '../ledger/format';
import { saveReadSnapshot } from './read-snapshot-store';

const SECTIONS = ['overview', 'pace', 'wealth', 'tasks', 'upcoming', 'bookings', 'pinned', 'accuracy'] as const;
type Section = (typeof SECTIONS)[number];
type SavedPart = {
  [S in Section]: { section: S; data: HeuteSectionData[S]; source: string; fetchedAt: number }
}[Section];
export interface TodaySectionSnapshot {
  kind: 'today-sections-v1';
  sections: Partial<Record<Section, SavedPart>>;
}
interface SavedResponse { source: string; payload: unknown }
const LABELS: Record<Section, string> = {
  overview: 'Monatskennzahlen', pace: 'Monat im Blick', wealth: 'Nettovermögen',
  tasks: 'Zu tun', upcoming: 'Fällig 14 Tage', bookings: 'Letzte Buchungen',
  pinned: 'Fixierte Kategorien', accuracy: 'Planungsgenauigkeit',
};
const timestamp = new Intl.DateTimeFormat('de-AT', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Vienna',
});
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export function isTodaySections(value: unknown): value is TodaySectionSnapshot {
  return record(value) && value.kind === 'today-sections-v1' && record(value.sections);
}

/** A section success is its own copy; no aggregate request or complete Heute object is created. */
export function captureTodaySection(read: ApiRead): boolean {
  const url = new URL(read.path, window.location.origin);
  const match = /^\/api\/heute\/sections\/([a-z]+)$/.exec(url.pathname);
  if (!match || !SECTIONS.includes(match[1] as Section)) return false;
  const section = match[1] as Section;
  // A malformed response never displaces the last successful copy of this section.
  const data = read.data;
  if (!record(data) || !record(data.stand) ||
      typeof data.stand.today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.stand.today) ||
      typeof data.stand.month !== 'string' || !/^\d{4}-\d{2}$/.test(data.stand.month) ||
      (section !== 'accuracy' && data.stand.period !== 'month' && data.stand.period !== 'payday')) return true;
  const requestedMonth = url.searchParams.get('month');
  if (requestedMonth && requestedMonth !== data.stand.month) return true;
  const part = { section, data: structuredClone(data), source: read.path, fetchedAt: read.fetchedAt } as SavedPart;
  const next: TodaySectionSnapshot = { kind: 'today-sections-v1', sections: { [section]: part } };
  void read.token.then((token) => saveReadSnapshot<SavedResponse>(token, {
    view: 'today', params: '', fetchedAt: read.fetchedAt,
    data: { source: '/api/heute/sections', payload: next },
  }, (previous) => {
    const old = previous && isTodaySections(previous.data.payload) ? previous.data.payload : undefined;
    const existing = old?.sections[section];
    if (existing && existing.fetchedAt >= part.fetchedAt) return;
    return {
      view: 'today', params: '', fetchedAt: Math.max(previous?.fetchedAt ?? 0, read.fetchedAt),
      data: { source: '/api/heute/sections', payload: {
        kind: 'today-sections-v1', sections: { ...old?.sections, [section]: part },
      } satisfies TodaySectionSnapshot },
    };
  })).catch(() => undefined);
  return true;
}

/** Different section dates/periods remain visible; no one timestamp claims a complete snapshot. */
export function SavedTodaySections({ bundle }: { bundle: TodaySectionSnapshot }) {
  return <>
    <p>Unabhängig gespeicherte Abschnitte · Nur lesbar. Die Abschnitte können aus verschiedenen
      Ansichten und Zeitpunkten stammen. Fehlende Abschnitte werden nicht ergänzt.</p>
    {SECTIONS.map((section) => {
      const part = bundle.sections[section];
      if (!part || part.section !== section) return <section key={section}>
        <h4>{LABELS[section]}</h4><p>Kein gespeicherter Stand für diesen Abschnitt.</p>
      </section>;
      const stand = part.data.stand;
      return <section key={section} aria-label={LABELS[section]}>
        <h4>{LABELS[section]}</h4>
        <p className="offline-stand" role="status">Stand vom {timestamp.format(part.fetchedAt)} ·
          Ansicht {stand.month} · Datenstand {stand.today}
          {'period' in stand && <> · {stand.period === 'payday' ? 'Bis Gehalt' : 'Monat'}</>}
        </p>
        <PartBody part={part} />
      </section>;
    })}
  </>;
}
function Facts({ rows }: { rows: Array<[string, number | null | undefined]> }) {
  return <dl className="offline-facts">{rows.map(([label, amount]) => <div key={label}>
    <dt>{label}</dt><dd>{amount === undefined || amount === null ? 'Nicht verfügbar' : eur(amount)}</dd>
  </div>)}</dl>;
}
function PartBody({ part }: { part: SavedPart }): ReactNode {
  switch (part.section) {
    case 'overview': {
      const d = part.data;
      return <>
        <p>{d.stand.from} bis {d.stand.to}</p>
        <Facts rows={[
          ['Budgetkonten', d.stand.budgetBalanceCents], ['Bedarf', d.lead.needCents],
          ['Wunsch', d.lead.wantCents], ['Offen', d.lead.openCents], ['Frei', d.lead.freeCents],
          ['Ausgegeben', d.budgetAnswer.spentCents], ['Geplant', d.budgetAnswer.plannedCents],
          ['Verbleibend', d.budgetAnswer.remainingCents], ['Tagesbudget', d.dailyBudget.perDayCents],
          ['Eingenommen', d.monthResult.earnedCents], ['Konsum', d.monthResult.consumptionCents],
          ['Gespart', d.monthResult.savedCents], ['Tiefpunkt der Prognose', d.balance.low?.cents],
        ]} />
      </>;
    }
    case 'pace': {
      const f = part.data.pace.figures;
      return <Facts rows={[
        ['Ausgegeben', f.spentCents], ['Plan bis zum Datenstand', f.planToDateCents],
        ['Erwartet bis zum Datenstand', f.expectedToDateCents], ['Abweichung', f.deltaCents],
        ['Monatsprognose', f.forecastAvailable ? f.forecastEndCents : null], ['Plan', f.limitCents],
      ]} />;
    }
    case 'wealth': {
      const net = part.data.netWorth;
      return 'unavailable' in net ? <p>Nicht verfügbar · {maskMoneyText(net.unavailable.message)}</p> : <Facts rows={[
        ['Vermögen', net.totalCents], ['Veränderung zum Vormonat', net.deltaCents],
        ['Liquid', net.liquidCents], ['Anlagen', net.investedCents], ['Schulden', net.debtCents],
      ]} />;
    }
    case 'tasks': {
      const d = part.data;
      const check = d.financeCheck;
      return <>
        <p>Posteingang: {d.attention.inboxCount} · Vorgemerkte Buchungen: {d.attention.pendingCount}</p>
        {d.nextSteps.items.map((item, index) => <p key={index}>
          {item.categoryName ?? (item.kind === 'uncategorized' ? 'Ohne Kategorie' : 'Plan prüfen')}
          {' · '}{item.count} · {eur(item.cents)}
        </p>)}
        {d.accountReminders.map((item) => <p key={item.accountId}>{item.accountName} ·
          {item.action === 'reconcile' ? 'Abgleich' : 'Bewertung'} prüfen</p>)}
        {d.contactReminders?.map((item) => <p key={item.contactId}>{maskMoneyText(item.name)} ·
          {item.status === 'overdue' ? `Ausgleich prüfen · offen seit ${item.oldestOpenDate}` : 'Ausgleich derzeit nicht bewertbar'}</p>)}
        {d.attention.monthCloseTasks?.tasks.map((task) => <p key={task.id}>{task.month} ·
          {task.kind === 'close-changed' ? 'Monatsabschluss geändert · prüfen' : 'Monat abschließen'}</p>)}
        {d.attention.monthCloseTasks?.unavailable.map((item, index) =>
          <p key={index}>{item.month ?? 'Monatsabschluss'} · Nicht verfügbar</p>)}
        {'unavailable' in check ? <p>Finanz-Check nicht verfügbar.</p> : <>
          <p>{check.counts.ok} erfüllt · {check.counts.warn} Warnungen · {check.counts.bad} verletzt ·
            {check.counts.notEvaluated} nicht bewertet</p>
          {check.keyRules.map((item) => <p key={item.code}>{item.name} · {maskMoneyText(item.valueText)}</p>)}
        </>}
      </>;
    }
    case 'upcoming': return <>
      {part.data.upcoming14.map((item) => <p key={`${item.paymentId}-${item.dueDate}`}>
        {item.dueDate} · {item.name} · {eur(item.amountCents)}
      </p>)}
      {part.data.upcomingEvents.filter((item) => item.date <= addDays(part.data.stand.today, 14)).map((item) => <p key={`${item.eventId}-${item.date}`}>
        {item.date} · {item.name} · {eur(item.amountCents)}
      </p>)}
    </>;
    case 'bookings': return <ol className="offline-records">{part.data.lastBookings.map((item) =>
      <li key={item.id}><span>{item.date} · {item.payeeName ?? item.memo ?? 'Buchung'} · {item.accountName}</span>
        <strong>{eur(item.amountCents)}</strong></li>)}</ol>;
    case 'pinned': return <>{part.data.pinned.map((item) => <p key={item.id}>
      {item.name} · Verfügbar {eur(item.availableCents)}
    </p>)}</>;
    case 'accuracy': return <p>{part.data.summary.hits} von {part.data.summary.count} Monaten im Planungsbereich.</p>;
  }
}
