import { Button, SectionHead } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { Printer } from 'lucide-react';
import { eur, longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { monthLabel } from '../nav/month';
import { IMPORT_REPORT } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { exportDate, fetchMapping, fetchReport, type Check, type Difference } from './api';

const CHECKS: Record<Check, { title: string; what: string }> = {
  balance: { title: 'Kontostände', what: 'Konto' },
  activity: { title: 'Aktivität je Kategorie', what: 'Kategorie' },
  available: { title: 'Verfügbar je Kategorie', what: 'Kategorie' },
  to_be_assigned: { title: 'Zu verteilen', what: '' },
  total: { title: 'Summe Verfügbar und Zu verteilen', what: '' },
};

/**
 * Gate 2: every difference of the reconciliation by account or category and month (all must be
 * 0,00 €), plus the app's own budget against the import after a commit. Printable: only the sheet
 * reaches the paper.
 */
export function ImportReportPage() {
  const { lauf } = useSearch({ strict: false }) as { lauf?: string };
  const report = useQuery({
    queryKey: ['imports', lauf, 'report'],
    queryFn: () => fetchReport(lauf as string),
    enabled: Boolean(lauf),
  });
  const mapping = useQuery({
    queryKey: ['imports', lauf, 'mapping'],
    queryFn: () => fetchMapping(lauf as string),
    enabled: Boolean(lauf),
  });
  const print = () => {
    document.documentElement.dataset['print'] = 'gate2';
    window.addEventListener('afterprint', () => delete document.documentElement.dataset['print'], {
      once: true,
    });
    window.print();
  };
  if (!lauf)
    return (
      <PageFrame meta={IMPORT_REPORT}>
        <p className="text-muted">Kein Importlauf gewählt.</p>
      </PageFrame>
    );
  const failed = report.error ?? mapping.error;
  return (
    <PageFrame meta={IMPORT_REPORT}>
      {(report.isPending || mapping.isPending) && <LoadingNote what="Abgleichsdaten" />}
      {failed && (
        <ErrorNote what="Abgleichsdaten" error={failed} onRetry={() => void report.refetch()} />
      )}
      {report.data && mapping.data && (
        <div className="imp gate2-sheet">
          <div className="imp-bar">
            <AppLink className="btn btn-ghost btn-sm" to="/einstellungen/datenquellen">
              Alle Importläufe
            </AppLink>
            <span className="text-muted">
              Export vom {exportDate(report.data.run.fileName)} · Start{' '}
              {monthLabel(report.data.startMonth)}
            </span>
            <span className="spacer" />
            <Button variant="ghost" size="sm" onClick={print}>
              <Printer className="icon" size={16} strokeWidth={1.75} aria-hidden="true" />
              Drucken
            </Button>
          </div>
          <Sections
            differences={report.data.reconciliation.differences}
            checked={report.data.reconciliation.checked}
            name={(d) => {
              const m = mapping.data.mapping;
              if (d.account) {
                const a = Object.values(m.accounts).find((x) => x !== 'skip' && x.id === d.account);
                return a && a !== 'skip' ? a.name : d.account;
              }
              return d.category ? (m.targets[d.category]?.name ?? d.category) : 'Zu verteilen';
            }}
          />
          <section aria-labelledby="gate2-ledger">
            <SectionHead id="gate2-ledger" title="Budget der App gegen den Import" />
            {report.data.ledger.length === 0 ? (
              <p className="imp-ok">
                {report.data.run.status === 'committed'
                  ? 'Keine Differenz: das Budget der App rechnet jeden Monat wie der Import.'
                  : 'Wird nach dem Übernehmen geprüft.'}
              </p>
            ) : (
              <p className="field-error">
                {report.data.ledger.length} Differenzen zwischen App und Import (seit dem Import
                geänderte Daten zählen mit).
              </p>
            )}
          </section>
          {report.data.reconciliation.moved.length > 0 && (
            <section aria-labelledby="gate2-moved">
              <SectionHead id="gate2-moved" title="Durch Regeln verschoben" />
              <table className="ktable imp-table">
                <caption className="sr-only">Verschobene Beträge je Regel und Monat</caption>
                <thead>
                  <tr>
                    <th className="tech" scope="col">
                      Monat
                    </th>
                    <th className="tech" scope="col">
                      Von → nach
                    </th>
                    <th className="tech kc-num" scope="col">
                      Betrag
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.reconciliation.moved.map((m, i) => {
                    const t = mapping.data.mapping.targets;
                    const n = (id: string | null) =>
                      id === null ? 'Zu verteilen' : (t[id]?.name ?? id);
                    return (
                      <tr key={i}>
                        <td>{monthLabel(m.month)}</td>
                        <td data-label="Von → nach">
                          {n(m.fromCategory)} → {n(m.toCategory)}
                        </td>
                        <td className="kc-num" data-label="Betrag">
                          {eur(m.cents)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}
    </PageFrame>
  );
}

function Sections({
  differences,
  checked,
  name,
}: {
  differences: Difference[];
  checked: Record<Check, number>;
  name: (d: Difference) => string;
}) {
  return (
    <>
      <section aria-labelledby="gate2-sum">
        <SectionHead
          id="gate2-sum"
          title="Abgleich mit YNAB"
          aside={differences.length === 0 ? 'ohne Differenz' : `${differences.length} Differenzen`}
        />
        <dl className="imp-facts">
          {(Object.keys(CHECKS) as Check[]).map((c) => (
            <div key={c}>
              <dt className="tech">{CHECKS[c].title}</dt>
              <dd>
                {checked[c]} geprüft · {differences.filter((d) => d.check === c).length || 'keine'}{' '}
                Differenzen
              </dd>
            </div>
          ))}
        </dl>
      </section>
      {(Object.keys(CHECKS) as Check[]).map((c) => {
        const rows = differences.filter((d) => d.check === c);
        if (rows.length === 0) return null;
        return (
          <section key={c} aria-labelledby={`gate2-${c}`}>
            <SectionHead id={`gate2-${c}`} title={CHECKS[c].title} aside={`${rows.length}`} />
            <table className="ktable imp-table">
              <caption className="sr-only">Differenzen: {CHECKS[c].title}</caption>
              <thead>
                <tr>
                  <th className="tech" scope="col">
                    {CHECKS[c].what || 'Monat'}
                  </th>
                  {CHECKS[c].what && (
                    <th className="tech" scope="col">
                      Monat
                    </th>
                  )}
                  <th className="tech kc-num" scope="col">
                    YNAB
                  </th>
                  <th className="tech kc-num" scope="col">
                    App
                  </th>
                  <th className="tech kc-num" scope="col">
                    Differenz
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d, i) => (
                  <tr key={i}>
                    {CHECKS[c].what && <td>{name(d)}</td>}
                    <td data-label="Monat">{d.day ? longDay(d.day) : monthLabel(d.month)}</td>
                    <td className="kc-num" data-label="YNAB">
                      {eur(d.expectedCents)}
                    </td>
                    <td className="kc-num" data-label="App">
                      {eur(d.actualCents)}
                    </td>
                    <td className="kc-num" data-label="Differenz">
                      {eur(d.actualCents - d.expectedCents, { sign: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}
