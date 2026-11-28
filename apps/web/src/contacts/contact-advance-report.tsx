import { useQuery } from '@tanstack/react-query';
import { maskMoneyText } from '@budget/ui';
import type { contactAdvanceReport } from '@budget/db';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { eur } from '../ledger/format';

type Report = ReturnType<typeof contactAdvanceReport>;

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('de-AT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

/** Read-only report "Vorgestreckt pro Monat": what was paid for the contact, repaid, open. */
export function ContactAdvanceReport({ contactId, asOf }: { contactId: string; asOf: string }) {
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'contact-advance-report', contactId, asOf],
    retry: false,
    queryFn: () =>
      request<Report>(
        'GET',
        `/api/contacts/${encodeURIComponent(contactId)}/advance-report?asOf=${encodeURIComponent(asOf)}`,
      ),
  });
  const data = query.data;
  if (!data || !Array.isArray(data.months)) return null;
  if (!data.months.some((m) => m.advancedCents > 0 || m.openCents > 0) && data.peakOpenCents === 0)
    return null;
  const purpose = (id: string | null) => (id ? (data.purposeNames[id] ?? 'Zweck') : 'ohne Zweck');
  // Months without any movement and nothing open say nothing: leave them out.
  const rows = data.months.filter(
    (m) => m.advancedCents || m.repaidCents || m.waivedCents || m.openCents,
  );
  const amount = (cents: number) => (cents ? maskMoneyText(eur(cents)) : '–');
  return (
    <section aria-labelledby="contacts-advance-report" className="contacts-advance-report">
      <h3 id="contacts-advance-report">Vorgestreckt pro Monat</h3>
      <table className="contacts-table">
        <thead>
          <tr>
            <th scope="col">Monat</th>
            <th scope="col" className="num">
              Vorgestreckt
            </th>
            <th scope="col" className="advance-purpose">
              Wofür
            </th>
            <th scope="col" className="num">
              Zurückgezahlt
            </th>
            <th scope="col" className="num">
              Offen am Monatsende
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.month}>
              <th scope="row">{monthLabel(m.month)}</th>
              <td className="num">{amount(m.advancedCents)}</td>
              {(() => {
                const text = maskMoneyText(
                  m.byPurpose
                    .map((p) => `${purpose(p.purposeCategoryId)} ${eur(p.cents)}`)
                    .join(' · '),
                );
                return (
                  <td className="advance-purpose" title={text || undefined}>
                    {text}
                  </td>
                );
              })()}
              <td className="num">
                {amount(m.repaidCents)}
                {m.waivedCents > 0 && (
                  <small>{maskMoneyText(`übernommen ${eur(m.waivedCents)}`)}</small>
                )}
              </td>
              <td className="num">{maskMoneyText(eur(m.openCents))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="contacts-meta" data-testid="advance-stats">
        {[
          data.averageDaysToSettle === null
            ? null
            : `Ø ${data.averageDaysToSettle} ${data.averageDaysToSettle === 1 ? 'Tag' : 'Tage'} bis Ausgleich`,
          maskMoneyText(`Höchststand offen ${eur(data.peakOpenCents)}`),
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </section>
  );
}
