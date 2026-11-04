import { useNavigate, useSearch } from '@tanstack/react-router';
import { contactBalanceLine } from '../contacts/contact-balance';
import { Button, useAmountPrivacy } from '@budget/ui';
import { cents } from '@budget/domain';
import { useRef, useState, type MouseEvent, type RefObject } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { ContactBody, ContactWriteOffDialog } from '../contacts/contacts-page';
import { eur, longDay } from '../ledger/format';
import { EmptyNote, LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import { ReportFrame } from './report-frame';
import { ReportViewControl } from './report-view-control';
import { ReportBodyDisclosure } from './report-body-disclosure';
import { ContactBalanceChart } from './contact-chart';
import type { ContactOverview, ContactReportStatement } from './contact-api';
import { ContactReportError } from './contact-report';
import './contact-report-redesign.css';

export function contactCalculation(view: ContactOverview) {
  return {
    label: 'Maßkette Kontakte',
    signed: true,
    terms: [
      { label: 'Wir bekommen', value: cents(view.totals.receivableCents) },
      { label: 'Wir schulden', value: cents(view.totals.payableCents), op: '-' as const },
    ],
    result: {
      label: 'Offener Kontaktsaldo',
      value: view.totals.balanceCents,
      unit: 'money' as const,
    },
  };
}
export function contactDebtAction(balance: number | undefined, ready: boolean) {
  return ready && balance !== undefined && balance > 0;
}
export function ContactForgivenessAction({
  balance,
  ready,
  onOpen,
}: {
  balance: number | undefined;
  ready: boolean;
  onOpen: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  if (balance === undefined || balance <= 0) return null;
  return (
    <Button data-r4-forgive disabled={!contactDebtAction(balance, ready)} onClick={onOpen}>
      Schulden erlassen
    </Button>
  );
}
export function ContactReportRedesign({
  overview,
  statement,
  view,
  selected,
  person,
  history,
  heading,
  unsupported,
  detailError,
}: {
  overview: UseQueryResult<ContactOverview>;
  statement: UseQueryResult<ContactReportStatement>;
  view: ContactOverview | undefined;
  selected: string;
  person: ContactReportStatement | undefined;
  history: boolean;
  heading: RefObject<HTMLHeadingElement | null>;
  unsupported: boolean;
  detailError: unknown;
}) {
  useAmountPrivacy();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { kontakteansicht?: 'offen'; kontakt?: string };
  const mode = search.kontakteansicht ?? 'salden';
  const setMode = (value: string) =>
    void navigate({
      to: '.',
      search: ((previous: Record<string, unknown>) => ({
        ...previous,
        kontakteansicht: value === 'offen' ? 'offen' : undefined,
      })) as never,
    });
  const [forgiving, setForgiving] = useState<{ id: string; name: string; balanceCents: number }>();
  const opener = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [previousPerson, setPreviousPerson] = useState<ContactReportStatement>();
  if (person && person !== previousPerson) setPreviousPerson(person);
  const retainedPerson =
    person ?? (previousPerson?.contact.id === selected ? previousPerson : undefined);
  const closeForgiveness = () => {
    setForgiving(undefined);
    requestAnimationFrame(() =>
      (opener.current?.isConnected ? opener.current : (heading.current ?? root.current))?.focus({
        preventScroll: true,
      }),
    );
  };
  const ready = Boolean(view && !overview.isFetching && !overview.isError && !unsupported);
  const detailReady = ready && statement.isSuccess && !statement.isFetching && !statement.isError;
  const current = view?.contacts.find((contact) => contact.id === forgiving?.id);
  const visible = view?.contacts.filter((contact) => history || contact.balanceCents !== 0) ?? [];
  const relation = (balance: number) =>
    balance > 0 ? 'schuldet dir' : balance < 0 ? 'Du schuldest dem Kontakt' : 'ausgeglichen';
  return (
    <ReportFrame
      meta={{
        title: 'Kontakte',
        area: 'reports',
        register: 'ueberblick',
        fills: 'Kontakte',
        spec: '5.4',
      }}
      title="Kontakte"
      subtitle="Wer schuldet wem wie viel?"
      sourceDate={ready ? view?.asOf : undefined}
      reportDataBasis={
        view
          ? `Gesamte Historie bis ${longDay(view.asOf)} · EUR`
          : overview.isError || unsupported
            ? 'nicht verfügbar'
            : 'wird geladen'
      }
      calculation={ready && view ? contactCalculation(view) : undefined}
      reportControls={
        <ReportViewControl
          label="Darstellung der Kontakte"
          options={[
            { value: 'salden', label: 'Salden' },
            { value: 'offen', label: 'Offene Posten' },
          ]}
          value={mode}
          onChange={setMode}
        />
      }
      extraFields={[{ label: 'Zeitraum', value: <span>Alle erfassten Bewegungen</span> }]}
    >
      <div className="r4-contact-report" ref={root} tabIndex={-1}>
        {overview.isPending && <LoadingNote what="Kontaktabrechnung" />}
        {(overview.isError || unsupported) && (
          <div>
            <ContactReportError
              what="Kontaktabrechnung"
              error={unsupported ? detailError : overview.error}
              retry={() => {
                void overview.refetch();
                if (unsupported) void statement.refetch();
              }}
            />
            <p>Der Report ist nicht verfügbar. Es wird kein Teilsaldo gezeigt.</p>
          </div>
        )}
        {(view || retainedPerson) && (
          <>
            {!ready && view && (
              <p role="status">
                Letzter verfügbarer Stand {longDay(view.asOf)} · Salden werden geprüft. Schulden
                können erst nach einer aktuellen Prüfung erlassen werden.
              </p>
            )}
            <div className="r4-contact-columns">
              {view && (
                <section className="r4-contact-list" aria-labelledby="r4-contact-list-title">
                  <div className="r4-contact-heading">
                    <h2 id="r4-contact-list-title">
                      {mode === 'salden' ? 'Kontaktsalden' : 'Offene Kontakte'}
                    </h2>
                    <span>{view.contacts.filter((c) => c.balanceCents !== 0).length} offen</span>
                  </div>
                  <ul>
                    {visible.map((contact) => (
                      <li key={contact.id}>
                        <AppLink
                          to="/reports/kontakte"
                          search={{
                            kontakt: contact.id,
                            kontakteansicht: search.kontakteansicht,
                            ...(history ? { verlauf: 1 } : {}),
                          }}
                          aria-current={selected === contact.id ? 'true' : undefined}
                        >
                          <span>
                            <strong>{contact.name}</strong>
                            <small>{relation(contact.balanceCents)}</small>
                          </span>
                          <b>{eur(contact.balanceCents, { sign: true })}</b>
                        </AppLink>
                      </li>
                    ))}
                  </ul>
                  {!visible.length && (
                    <EmptyNote>
                      Keine offenen Kontaktbeträge. Ausgeglichene Kontakte bleiben im Verlauf
                      erhalten.
                    </EmptyNote>
                  )}
                  <label className="r4-contact-history">
                    <input
                      type="checkbox"
                      checked={history}
                      onChange={(event) => {
                        const show = event.currentTarget.checked;
                        void navigate({
                          to: '.',
                          search: ((previous: Record<string, unknown>) => ({
                            ...previous,
                            verlauf: show ? 1 : undefined,
                          })) as never,
                        });
                      }}
                    />
                    Auch ausgeglichene Kontakte
                  </label>
                  <AppLink className="r4-contact-settings" to="/einstellungen/kontakte">
                    Stammdaten: Einstellungen › Kontakte
                  </AppLink>
                </section>
              )}
              <div className="r4-contact-detail">
                {selected && statement.isPending && <LoadingNote what="Kontoblatt" />}
                {selected && statement.isError && (
                  <ContactReportError
                    what="Kontoblatt"
                    error={statement.error}
                    retry={() => void statement.refetch()}
                  />
                )}
                {retainedPerson && (
                  <section
                    className="r4-contact-sheet contacts-statement"
                    aria-label="Kontaktkontoauszug"
                  >
                    {person && (
                      <>
                        <div className="r4-contact-heading">
                          <h2 id="contact-sheet-title" tabIndex={-1} ref={heading}>
                            Kontoblatt {person.contact.name}
                          </h2>
                          <strong className="contacts-balance">
                            {person.balanceCents === 0
                              ? `Ausgeglichen · ${eur(person.balanceCents)}`
                              : contactBalanceLine(person.balanceCents)}
                          </strong>
                        </div>
                        {person.contact.note && <p>{person.contact.note}</p>}
                        <p className="r4-source">
                          {person.movements.length} Bewegungen · {relation(person.balanceCents)} ·
                          Stand {longDay(person.asOf)}
                        </p>
                        <ContactForgivenessAction
                          balance={person.balanceCents}
                          ready={detailReady}
                          onOpen={(event) => {
                            opener.current = event.currentTarget;
                            setForgiving({ ...person.contact, balanceCents: person.balanceCents });
                            if (!search.kontakt)
                              void navigate({
                                to: '.',
                                replace: true,
                                search: ((previous: Record<string, unknown>) => ({
                                  ...previous,
                                  kontakt: person.contact.id,
                                })) as never,
                              });
                            void overview.refetch();
                          }}
                        />
                        {mode === 'salden' && person.movements.length > 0 && (
                          <ContactBalanceChart statement={person} height={160} />
                        )}
                        {mode === 'offen' && (
                          <section className="r4-open-items" aria-labelledby="r4-open-items-title">
                            <h3 id="r4-open-items-title">Offene Posten</h3>
                            <ul>
                              {person.outlays
                                .filter((outlay) => outlay.remainingCents > 0)
                                .map((outlay) => (
                                  <li key={outlay.splitId}>
                                    <AppLink
                                      to="/konten/buchungen"
                                      search={{ buchung: outlay.bookingId }}
                                    >
                                      <span>{longDay(outlay.date)} · Auslage öffnen</span>
                                      <b>{eur(outlay.remainingCents)}</b>
                                    </AppLink>
                                  </li>
                                ))}
                            </ul>
                            {!person.outlays.some((outlay) => outlay.remainingCents > 0) && (
                              <p>Keine offenen Auslagen.</p>
                            )}
                            <p>Guthaben des Kontakts: {eur(person.creditCents)}</p>
                          </section>
                        )}
                      </>
                    )}
                    {!detailReady && (
                      <p role="status">
                        Kontoblatt derzeit nicht bestätigt. Die Eingaben bleiben erhalten.
                      </p>
                    )}
                    <ReportBodyDisclosure
                      id="contact-history"
                      label="Alle Bewegungen und Zuordnungen"
                      defaultOpen={false}
                    >
                      <ContactBody
                        key={retainedPerson.contact.id}
                        statement={retainedPerson}
                        ready={detailReady && !!person}
                        reportReader
                      />
                    </ReportBodyDisclosure>
                    {person && !person.movements.length && (
                      <EmptyNote>
                        Noch keine Kontaktbuchungen. Der Saldo ist ausgeglichen.
                      </EmptyNote>
                    )}
                  </section>
                )}
              </div>
            </div>
            {view && (
              <p className="r4-source">
                Plus: Kontakt schuldet dir · Minus: du schuldest dem Kontakt. Kontaktbeträge zählen
                nicht zusätzlich zum Nettovermögen. Rückzahlungen werden bei der normalen Buchung
                zugeordnet und sind keine Einnahmen. Erfasste unbestätigte Buchungen sind enthalten.
              </p>
            )}
          </>
        )}
        {forgiving && (
          <ContactWriteOffDialog
            key={forgiving.id}
            contact={current ?? forgiving}
            ready={ready && !!current && current.balanceCents > 0}
            forgivenessOnly
            onRecheck={() => void overview.refetch()}
            onClose={closeForgiveness}
          />
        )}
      </div>
    </ReportFrame>
  );
}
