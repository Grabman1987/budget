import { useAmountPrivacy, DimensionChain } from '@budget/ui';
import { cents } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/http';
import { eur, eurParts, longDay } from '../ledger/format';
import { STATUS_LABEL } from '../ledger/labels';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import {
  contactOverviewQuery,
  contactReportQuery,
  type ContactReportStatement,
} from './contact-api';
import { ContactBalanceChart } from './contact-chart';
import './contact-report.css';

const META = {
  title: 'Kontakte-Abrechnung',
  area: 'reports' as const,
  register: 'ueberblick',
  fills: 'P6 Reports und Umstellung',
  spec: '5.4 Saldenlinie und Kontoblatt',
};
const balanceLabel = (amount: number) =>
  amount > 0 ? 'Kontakt schuldet dir' : amount < 0 ? 'Du schuldest dem Kontakt' : 'Ausgeglichen';
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
export function ContactReportPage() {
  useAmountPrivacy();
  const overview = useQuery(contactOverviewQuery());
  const baseView = overview.isSuccess ? overview.data : undefined;
  const search = useSearch({ strict: false }) as { kontakt?: string };
  const [history, setHistory] = useState(false);
  const visible =
    baseView?.contacts.filter((contact) => history || contact.balanceCents !== 0) ?? [];
  const selected = search.kontakt ?? visible[0]?.id ?? '';
  const statement = useQuery(contactReportQuery(selected, baseView?.asOf ?? '', !!baseView));
  const detailKey = JSON.stringify([selected, baseView?.asOf]);
  const currentUnsupported =
    statement.isError && statement.error instanceof ApiError && statement.error.status === 422;
  const [blockedDetail, setBlockedDetail] = useState<{ key: string; error: ApiError } | null>(null);
  if (
    currentUnsupported &&
    statement.error instanceof ApiError &&
    (blockedDetail?.key !== detailKey || blockedDetail.error !== statement.error)
  ) {
    setBlockedDetail({ key: detailKey, error: statement.error });
  } else if (statement.isSuccess && blockedDetail !== null) {
    setBlockedDetail(null);
  }
  // A retry clears Query's error before its response arrives; keep the known gap hidden.
  const unsupportedDetail =
    currentUnsupported || (blockedDetail?.key === detailKey && !statement.isSuccess);
  const detailError = currentUnsupported ? statement.error : blockedDetail?.error;
  const view = unsupportedDetail ? undefined : baseView;
  const heading = useRef<HTMLHeadingElement>(null);
  const person = view && statement.isSuccess ? statement.data : undefined;
  const personId = person?.contact.id;
  useEffect(() => {
    if (personId && search.kontakt) heading.current?.focus();
  }, [personId, search.kontakt]);
  const parts = view ? eurParts(view.totals.balanceCents) : undefined;
  return (
    <PageFrame
      meta={META}
      title="Kontakte-Abrechnung"
      subtitle="Wer schuldet wem wie viel?"
      reportDataBasis={
        view
          ? `Gesamte Historie bis ${longDay(view.asOf)}`
          : overview.isError || unsupportedDetail
            ? 'nicht verfügbar'
            : 'wird geladen'
      }
      extraFields={[{ label: 'Zeichnung', value: '5.4' }]}
    >
      <div className="rview contact-report">
        <div className="contact-report-back">
          <AppLink to="/reports/gruppe/ueberblick">← Überblick</AppLink>
        </div>
        <p className="vnote">
          Alle erfassten Kontaktbuchungen{view ? ` bis ${longDay(view.asOf)}` : ''} · EUR.
          Unbestätigte Buchungen sind enthalten; wiederkehrende Zahlungen erst nach ihrer Buchung.
        </p>
        {overview.isPending && <LoadingNote what="Kontaktabrechnung" />}
        {(overview.isError || unsupportedDetail) && (
          <>
            <ReportError
              what="Kontaktabrechnung"
              error={unsupportedDetail ? detailError : overview.error}
              retry={() => {
                void overview.refetch();
                if (unsupportedDetail) void statement.refetch();
              }}
            />
            <p>Der Report ist nicht verfügbar. Es wird kein Teilsaldo gezeigt.</p>
          </>
        )}
        {view && (
          <>
            <section className="rs rs-wide" aria-labelledby="contact-open-title">
              <div className="tbd-head">
                <h2 id="contact-open-title">Offen</h2>
                <span className="tbd-state">
                  {view.contacts.filter((c) => c.balanceCents !== 0).length} offene Kontakte · Stand{' '}
                  {longDay(view.asOf)}
                </span>
              </div>
              <div className="tbd-fig" data-testid="contact-report-balance">
                {parts!.whole}
                <span className="cents">,{parts!.fraction} €</span>
              </div>
              <DimensionChain
                precision="cent"
                label="Maßkette Kontakte"
                terms={[
                  { label: 'Forderungen', value: cents(view.totals.receivableCents) },
                  { label: 'Verbindlichkeiten', op: '-', value: cents(view.totals.payableCents) },
                  { label: 'Saldo', op: '=', value: cents(view.totals.balanceCents), result: true },
                ]}
              />
              <label className="contact-report-history">
                <input
                  type="checkbox"
                  checked={history}
                  onChange={(event) => setHistory(event.target.checked)}
                />
                Auch ausgeglichene Kontakte
              </label>
              {visible.length ? (
                <ul className="kt-jump">
                  {visible.map((contact) => (
                    <li key={contact.id}>
                      <AppLink
                        to="/reports/kontakte"
                        search={{ kontakt: contact.id }}
                        onClick={() => {
                          if (contact.id === personId)
                            requestAnimationFrame(() => heading.current?.focus());
                        }}
                        aria-current={selected === contact.id ? 'true' : undefined}
                      >
                        <span className="avatar kt-av" aria-hidden="true">
                          {initials(contact.name)}
                        </span>
                        <span>
                          <strong>{contact.name}</strong>
                          <small>
                            {eur(contact.balanceCents)} · {balanceLabel(contact.balanceCents)}
                          </small>
                        </span>
                      </AppLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyNote>
                  Keine offenen Kontaktbeträge. Ausgeglichene Kontakte bleiben im Verlauf erhalten.
                </EmptyNote>
              )}
            </section>
            {selected && (
              <>
                {statement.isPending && <LoadingNote what="Kontoblatt" />}
                {statement.isError && (
                  <ReportError
                    what="Kontoblatt"
                    error={statement.error}
                    retry={() => void statement.refetch()}
                  />
                )}
                {person && (
                  <section className="rs rs-wide kt-sheet" aria-labelledby="contact-sheet-title">
                    <div className="tbd-head">
                      <h2 id="contact-sheet-title" tabIndex={-1} ref={heading}>
                        <span className="avatar kt-av" aria-hidden="true">
                          {initials(person.contact.name)}
                        </span>
                        Kontoblatt {person.contact.name}
                      </h2>
                      <strong className="kt-sum">
                        {eur(person.balanceCents)} · {balanceLabel(person.balanceCents)}
                      </strong>
                    </div>
                    {person.contact.note && <p className="vnote">{person.contact.note}</p>}
                    <p className="vnote">
                      Alle {person.movements.length} Bewegungen bis {longDay(person.asOf)}. Guthaben
                      des Kontakts: {eur(person.creditCents)}.
                    </p>
                    <AppLink
                      className="contact-source-link"
                      to="/konten/kontakte"
                      search={{ kontakt: person.contact.id }}
                    >
                      Kontakt in Konten öffnen
                    </AppLink>
                    {person.movements.length ? (
                      <div className="kt-grid">
                        <Ledger statement={person} />
                        <ContactBalanceChart statement={person} />
                      </div>
                    ) : (
                      <EmptyNote>
                        Noch keine Kontaktbuchungen. Der Saldo ist ausgeglichen.
                      </EmptyNote>
                    )}
                  </section>
                )}
              </>
            )}
          </>
        )}
        <p className="vnote">
          Plus = der Kontakt schuldet dir; Minus = Guthaben des Kontakts. Kontaktbeträge gehen nicht
          zusätzlich ins Nettovermögen ein. Rückzahlungen sind keine Einnahmen. Fremdwährungen sind
          in dieser Abrechnung noch nicht unterstützt.
        </p>
      </div>
    </PageFrame>
  );
}
function ReportError({ what, error, retry }: { what: string; error: unknown; retry: () => void }) {
  useAmountPrivacy();
  const unsupported = error instanceof ApiError && error.status === 422;
  return (
    <>
      <ErrorNote what={what} error={unsupported ? undefined : error} onRetry={retry} />
      {unsupported && (
        <p role="status">
          Diese Abrechnung unterstützt nur EUR. Kontaktbewegungen in anderen Währungen können noch
          nicht gemeinsam abgerechnet werden.
        </p>
      )}
    </>
  );
}
function Ledger({ statement }: { statement: ContactReportStatement }) {
  useAmountPrivacy();
  return (
    <div className="rscroll">
      <table className="rtable">
        <caption className="sr-only">
          Kontaktbewegungen und fortlaufender Saldo mit {statement.contact.name}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="tech">
              Datum
            </th>
            <th scope="col" className="tech">
              Vorgang
            </th>
            <th scope="col" className="tech n">
              Kontaktbetrag
            </th>
            <th scope="col" className="tech n">
              Saldo
            </th>
          </tr>
        </thead>
        <tbody>
          {statement.movements.map((movement) => {
            const receipt = statement.receipts.find((r) => r.receiptSplitId === movement.splitId);
            const outlay = statement.outlays.find((o) => o.splitId === movement.splitId);
            return (
              <tr key={movement.splitId}>
                <td>{longDay(movement.date)}</td>
                <td>
                  <AppLink to="/konten/buchungen" search={{ buchung: movement.bookingId }}>
                    {movement.amountCents < 0
                      ? 'Auslage'
                      : movement.amountCents > 0
                        ? 'Rückzahlung'
                        : 'Kontaktbuchung'}{' '}
                    öffnen
                  </AppLink>
                  <small>
                    {STATUS_LABEL[movement.status]} · {movement.currency}
                  </small>
                  {movement.memo && <small>{movement.memo}</small>}
                  {outlay && <small>Am Stand noch offen: {eur(outlay.remainingCents)}</small>}
                  {receipt && (
                    <small>
                      Zuordnung:{' '}
                      {receipt.allocations.length
                        ? receipt.allocations
                            .map(
                              (a) =>
                                `${longDay(statement.outlays.find((o) => o.splitId === a.outlaySplitId)!.date)}: ${eur(a.amountCents)}`,
                            )
                            .join(' · ')
                        : 'keine offenen Auslagen'}
                      {receipt.creditCents > 0 &&
                        ` · damaliges Guthaben ${eur(receipt.creditCents)}`}
                    </small>
                  )}
                </td>
                <td className="n">{eur(movement.contactDeltaCents, { sign: true })}</td>
                <td className="n">
                  <strong>{eur(movement.balanceCents)}</strong>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="vnote">
        Kontaktbetrag zeigt die Änderung der Schuld. Die Kontobuchung hat das umgekehrte Vorzeichen.
      </p>
    </div>
  );
}
