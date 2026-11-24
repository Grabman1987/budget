import { useNavigate, useSearch } from '@tanstack/react-router';
import { contactBalanceLine } from '../contacts/contact-balance';
import { Button, useAmountPrivacy } from '@budget/ui';
import { cents } from '@budget/domain';
import { useRef, useState, type MouseEvent, type RefObject } from 'react';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { ApiError } from '../api/http';
import { ContactWriteOffDialog } from '../contacts/contacts-page';
import { eur, longDay } from '../ledger/format';
import { EmptyNote, LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import { ReportFrame } from './report-frame';
import { ReportViewControl } from './report-view-control';
import { ContactReportRows } from './contact-report-rows';
import {
  contactReportQuery,
  type ContactOverview,
  type ContactReportStatement,
} from './contact-api';
import { ContactReportError } from './contact-report';
import './contact-report-redesign.css';

export function contactCalculation(view: ContactOverview) {
  return {
    label: 'Maßkette Kontakte',
    signed: false,
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
      Kontakt ausgleichen
    </Button>
  );
}
export function ContactReportRedesign({
  overview,
  statement,
  view: currentView,
  selected,
  history,
  heading,
  unsupported,
  detailError,
}: {
  overview: UseQueryResult<ContactOverview>;
  statement: UseQueryResult<ContactReportStatement>;
  view: ContactOverview | undefined;
  selected: string;
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
  // A failed refresh keeps the last confirmed sheets (and an open source dialog) on screen, marked
  // as not confirmed; the overview figures stay hidden.
  const [previousView, setPreviousView] = useState<ContactOverview>();
  if (currentView && currentView !== previousView) setPreviousView(currentView);
  const baseView = currentView ?? previousView;
  const closeForgiveness = () => {
    setForgiving(undefined);
    requestAnimationFrame(() =>
      (opener.current?.isConnected ? opener.current : (heading.current ?? root.current))?.focus({
        preventScroll: true,
      }),
    );
  };
  const ready = Boolean(currentView && !overview.isFetching && !overview.isError && !unsupported);
  const hasOpenAmount = (contact: { balanceCents: number; creditCents: number }) =>
    contact.balanceCents !== 0 || contact.creditCents > 0;
  const openContacts = baseView?.contacts.filter(hasOpenAmount) ?? [];
  const settledContacts = baseView?.contacts.filter((contact) => !hasOpenAmount(contact)) ?? [];
  const sheetIds = [
    ...new Set([...(selected ? [selected] : []), ...openContacts.map((contact) => contact.id)]),
  ];
  const asOf = baseView?.asOf ?? '';
  const results = useQueries({
    queries: sheetIds.map((id) => contactReportQuery(id, asOf, ready && !!asOf)),
  });
  const queries = new Map(sheetIds.map((id, index) => [id, results[index]!]));
  // Mixed currencies: one statement that cannot be computed in EUR hides EVERY figure and ledger.
  // A retry clears Query's error before the response arrives, so the gap stays known per contact.
  const [blockedSheets, setBlockedSheets] = useState<Record<string, ApiError>>({});
  const nextBlocked = { ...blockedSheets };
  for (const [id, result] of queries) {
    const error: unknown = result.isError ? result.error : undefined;
    if (error instanceof ApiError && error.status === 422) nextBlocked[id] = error;
    else if (result.isSuccess) delete nextBlocked[id];
  }
  const blockedIds = Object.keys(nextBlocked);
  if (
    blockedIds.length !== Object.keys(blockedSheets).length ||
    blockedIds.some((id) => blockedSheets[id] !== nextBlocked[id])
  )
    setBlockedSheets(nextBlocked);
  const sheetBlocked = blockedIds.length > 0;
  const view = sheetBlocked ? undefined : currentView;
  const retained = !view && !unsupported && !sheetBlocked ? baseView : undefined;
  const sheetView = view ?? retained;
  const blockedError = unsupported ? detailError : nextBlocked[blockedIds[0]!];
  const current = view?.contacts.find((contact) => contact.id === forgiving?.id);
  const visible = view?.contacts.filter(hasOpenAmount) ?? [];
  const settledMenu = history ? (view?.contacts.filter((c) => !hasOpenAmount(c)) ?? []) : [];
  const sheet = (id: string) => (
    <ContactSheetCard
      key={id}
      contactId={id}
      query={queries.get(id)!}
      ready={ready}
      selected={selected === id}
      heading={heading}
      relation={relation}
      onForgive={(contact, button) => {
        opener.current = button;
        setForgiving(contact);
        if (!search.kontakt)
          void navigate({
            to: '.',
            replace: true,
            search: ((previous: Record<string, unknown>) => ({
              ...previous,
              kontakt: contact.id,
            })) as never,
          });
        void overview.refetch();
      }}
    />
  );
  const relation = (balance: number, credit = 0) =>
    credit > 0
      ? 'Guthaben des Kontakts'
      : balance > 0
        ? 'schuldet dir'
        : balance < 0
          ? 'Du schuldest dem Kontakt'
          : 'ausgeglichen';
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
          : overview.isError || unsupported || sheetBlocked
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
        {(overview.isError || unsupported || sheetBlocked) && (
          <div>
            <ContactReportError
              what="Kontaktabrechnung"
              error={unsupported || sheetBlocked ? blockedError : overview.error}
              retry={() => {
                void overview.refetch();
                if (unsupported) void statement.refetch();
                for (const id of blockedIds) void queries.get(id)?.refetch();
              }}
            />
            <p>Der Report ist nicht verfügbar. Es wird kein Teilsaldo gezeigt.</p>
          </div>
        )}
        {(view || retained) && (
          <>
            {!ready && sheetView && (
              <p role="status">
                Letzter verfügbarer Stand {longDay(sheetView.asOf)} · Salden werden geprüft.
                Schulden können erst nach einer aktuellen Prüfung ausgeglichen werden.
              </p>
            )}
            <div className="r4-contact-columns">
              {view && (
                <section className="r4-contact-list" aria-labelledby="r4-contact-list-title">
                  <div className="r4-contact-heading">
                    <h2 id="r4-contact-list-title">
                      {mode === 'salden' ? 'Kontaktsalden' : 'Offene Kontakte'}
                    </h2>
                    <span>{view.contacts.filter(hasOpenAmount).length} offen</span>
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
                            <small>{relation(contact.balanceCents, contact.creditCents)}</small>
                          </span>
                          <span className="r4-contact-amounts">
                            <span>
                              Offen:{' '}
                              <b>
                                {eur(contact.receivableCents ?? Math.max(0, contact.balanceCents))}
                              </b>
                            </span>
                            <span>
                              Guthaben: <b>{eur(contact.creditCents)}</b>
                            </span>
                          </span>
                        </AppLink>
                      </li>
                    ))}
                  </ul>
                  {settledMenu.length > 0 && (
                    <>
                      <h3 className="r4-contact-subhead">Ausgeglichen</h3>
                      <ul>
                        {settledMenu.map((contact) => (
                          <li key={contact.id}>
                            <AppLink
                              to="/reports/kontakte"
                              search={{
                                kontakt: contact.id,
                                kontakteansicht: search.kontakteansicht,
                                verlauf: 1,
                              }}
                              aria-current={selected === contact.id ? 'true' : undefined}
                            >
                              <span>
                                <strong>{contact.name}</strong>
                              </span>
                            </AppLink>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
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
                {selected && !sheetView?.contacts.some((contact) => contact.id === selected)
                  ? sheet(selected)
                  : null}
                {(sheetView ? openContacts : []).map((contact) => sheet(contact.id))}
                {sheetView &&
                  settledContacts.some((contact) => contact.id === selected) &&
                  sheet(selected!)}
              </div>
            </div>
            {view && (
              <p className="r4-source">
                Offen: Kontakt schuldet dir · Guthaben: du schuldest dem Kontakt. Kontaktbeträge
                zählen nicht zusätzlich zum Nettovermögen. Rückzahlungen werden bei der normalen
                Buchung zugeordnet und sind keine Einnahmen. Erfasste unbestätigte Buchungen sind
                enthalten.
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

/** One contact's account sheet. The parent runs the statement queries so one failure can block every sheet. */
function ContactSheetCard({
  contactId,
  query,
  ready,
  selected,
  heading,
  relation,
  onForgive,
}: {
  contactId: string;
  query: UseQueryResult<ContactReportStatement>;
  ready: boolean;
  selected: boolean;
  heading: RefObject<HTMLHeadingElement | null>;
  relation: (balance: number, credit?: number) => string;
  onForgive: (
    contact: { id: string; name: string; balanceCents: number },
    button: HTMLButtonElement,
  ) => void;
}) {
  useAmountPrivacy();
  const person = query.isSuccess ? query.data : undefined;
  const detailReady = ready && query.isSuccess && !query.isFetching && !query.isError;
  return (
    <section
      id={`kontakt-${contactId}`}
      className="r4-contact-sheet contacts-statement"
      aria-label={
        selected
          ? 'Kontaktkontoauszug'
          : person
            ? `Kontoauszug ${person.contact.name}`
            : 'Kontoauszug wird geladen'
      }
      aria-current={selected ? 'true' : undefined}
    >
      {query.isPending && <LoadingNote what="Kontoblatt" />}
      {query.isError && (
        <ContactReportError
          what="Kontoblatt"
          error={query.error}
          retry={() => void query.refetch()}
        />
      )}
      {person && (
        <>
          <div className="r4-contact-heading">
            <h2
              id={`contact-sheet-title-${contactId}`}
              tabIndex={-1}
              ref={selected ? heading : undefined}
            >
              Kontoblatt {person.contact.name}
            </h2>
            <strong className="contacts-balance">
              {person.creditCents > 0
                ? `Guthaben · ${eur(person.creditCents)}`
                : person.balanceCents === 0
                  ? `Ausgeglichen · ${eur(person.balanceCents)}`
                  : contactBalanceLine(person.balanceCents)}
            </strong>
          </div>
          <p className="r4-contact-summary">
            Offen {eur(person.outlays.reduce((sum, o) => sum + o.remainingCents, 0))} · Guthaben{' '}
            {eur(person.creditCents)}
          </p>
          <p className="r4-source">
            {person.movements.length} Bewegungen ·{' '}
            {relation(person.balanceCents, person.creditCents)} · Stand {longDay(person.asOf)}
          </p>
          <ContactForgivenessAction
            balance={person.balanceCents}
            ready={detailReady}
            onOpen={(event) =>
              onForgive(
                { ...person.contact, balanceCents: person.balanceCents },
                event.currentTarget,
              )
            }
          />
          {!detailReady && (
            <p role="status">Kontoblatt derzeit nicht bestätigt. Die Eingaben bleiben erhalten.</p>
          )}
          <ContactReportRows statement={person} ready={detailReady} />
          {!person.movements.length && (
            <EmptyNote>Noch keine Kontaktbuchungen. Der Saldo ist ausgeglichen.</EmptyNote>
          )}
        </>
      )}
    </section>
  );
}
