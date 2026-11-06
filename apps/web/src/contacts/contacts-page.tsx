import { budgetQuery } from '../budget/budget-api';
import {
  useAmountPrivacy,
  AmountInput,
  Button,
  FormDialog,
  Field,
  maskMoneyText,
  Segmented,
  Select,
  TextInput,
  useToast,
} from '@budget/ui';
import {
  allocateContactReceipt,
  cents,
  formatDecimal,
  parseAmount,
  todayInVienna,
  type ContactAllocation,
  type ContactMovement,
  type OpenContactOutlay,
} from '@budget/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker, useLocation, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState } from 'react';
import { Info, Pencil } from 'lucide-react';
import { request } from '../api/http';
import { AccountOptions } from '../ledger/account-options';
import { undoGroup } from '../ledger/api';
import { eur, longDay } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { accountsQuery, lookupsQuery, LEDGER_KEY } from '../ledger/queries';
import type { ListedBooking } from '../ledger/types';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { PAGES } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { contactBalanceLine, contactBalanceWords } from './contact-balance';
import { ContactActionsMenu } from './contact-menu';
import {
  ContactBookingSource,
  ContactMovementTable,
  type ContactSourceOpening,
} from './contact-movement-table';
import './contacts.css';
import '../ledger/ledger.css';
interface ContactRow {
  id: string;
  name: string;
  balanceCents: number;
  creditCents: number;
}
export interface Statement {
  contact: { id: string; name: string };
  asOf: string;
  balanceCents: number;
  creditCents: number;
  movements: ContactMovement[];
  outlays: OpenContactOutlay[];
  receipts: {
    receiptSplitId: string;
    allocations: ContactAllocation[];
    creditCents: number;
    recorded: boolean;
  }[];
  closedThroughSplitId: string | null;
}
const META = PAGES.find((p) => p.path === '/konten/kontakte')!;
const contactUrl = (id: string) => `/api/contacts/${encodeURIComponent(id)}`;
const decimal = (value: number) => formatDecimal(cents(value));

function useContactWrite() {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => qc.invalidateQueries();
  const failed = (error: unknown) => toast.show({ message: errorText(error) });
  const undo = (groupId: string) =>
    void undoGroup(groupId).then(async (result) => {
      await refresh();
      toast.show({
        message: 'Rückgängig gemacht.',
        actionLabel: 'Wiederholen',
        onAction: () => void undoGroup(result.groupId).then(refresh, failed),
      });
    }, failed);
  return async (run: () => Promise<{ groupId: string }>, message: string) => {
    try {
      const result = await run();
      await refresh();
      toast.show({ message, actionLabel: 'Rückgängig', onAction: () => undo(result.groupId) });
      return true;
    } catch (error) {
      failed(error);
      return false;
    }
  };
}

export function ContactsPage() {
  useAmountPrivacy();
  const location = useLocation();
  const historyParam = new URLSearchParams(location.searchStr).get('verlauf');
  const history = historyParam === '1' || historyParam === '"1"';
  const search = useSearch({ strict: false }) as { kontakt?: string };
  const navigate = useNavigate();
  const setHistory = (visible: boolean) =>
    void navigate({
      to: '/konten/kontakte',
      search: { verlauf: visible ? 1 : undefined } as never,
      replace: true,
    });
  useEffect(() => {
    if (search.kontakt)
      void navigate({
        to: '/konten/kontakte/$id',
        params: { id: search.kontakt },
        search: { verlauf: history ? 1 : undefined },
        replace: true,
      });
  }, [search.kontakt, history, navigate]);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [writeOff, setWriteOff] = useState<ContactRow | null>(null);
  const contacts = useQuery({
    queryKey: [...LEDGER_KEY, 'contacts', history],
    queryFn: () =>
      request<{ contacts: ContactRow[] }>('GET', `/api/contacts?history=${history ? '1' : '0'}`),
  });
  const currentWriteOff = contacts.data?.contacts.find((contact) => contact.id === writeOff?.id);
  return (
    <PageFrame meta={META}>
      <div className="contacts-page">
        <p>Kontoblätter und Rückzahlungen werden derzeit in EUR geführt.</p>
        <div className="ptoolbar">
          <Segmented
            label="Kontakte anzeigen"
            options={[
              { value: 'open', label: 'Offen' },
              { value: 'all', label: 'Alle', description: 'Auch ausgeglichene Kontakte' },
            ]}
            value={history ? 'all' : 'open'}
            onChange={(value) => setHistory(value === 'all')}
          />
          <span className="spacer" />
          <Button size="sm" onClick={() => setCreating(true)}>
            Neuer Kontakt
          </Button>
        </div>
        {(contacts.isPending || contacts.isFetching) && <LoadingNote what="Kontakte" />}
        {contacts.isError && (
          <ErrorNote
            what="Kontakte"
            error={contacts.error}
            onRetry={() => void contacts.refetch()}
          />
        )}
        {contacts.data &&
          !contacts.isFetching &&
          !contacts.isError &&
          (contacts.data.contacts.length === 0 ? (
            <EmptyNote>
              Keine offenen Kontaktbeträge. Ausgeglichene Kontakte bleiben mit ihrem Verlauf
              erhalten.
            </EmptyNote>
          ) : (
            <table className="contacts-table">
              <caption className="sr-only">Kontaktübersicht</caption>
              <thead>
                <tr>
                  <th scope="col">Kontakt</th>
                  <th scope="col">Saldo</th>
                  <th scope="col">
                    <span className="sr-only">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {contacts.data.contacts.map((c) => {
                  const balance = contactBalanceWords(c.balanceCents);
                  return (
                    <tr key={c.id}>
                      <td>
                        <AppLink
                          className="btn btn-ghost"
                          to={`/konten/kontakte/${encodeURIComponent(c.id)}`}
                          search={history ? { verlauf: 1 } : {}}
                        >
                          {c.name}
                        </AppLink>
                        <ContactRename contact={c} onOpen={() => setRenaming(c)} />
                      </td>
                      <td className="num">
                        <AppLink
                          className={`contact-balance-link is-${balance.tone}`}
                          aria-label={maskMoneyText(
                            `${contactBalanceLine(c.balanceCents)}, Saldo ${c.name}`,
                          )}
                          to={`/konten/kontakte/${encodeURIComponent(c.id)}`}
                          search={history ? { verlauf: 1 } : {}}
                        >
                          {contactBalanceLine(c.balanceCents)}
                        </AppLink>
                      </td>
                      <td className="contacts-actions-cell">
                        {c.balanceCents !== 0 && (
                          <ContactActionsMenu name={c.name} onSettle={() => setWriteOff(c)} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))}
        <FormDialog open={creating} onClose={() => setCreating(false)} title="Neuer Kontakt">
          {creating && (
            <NewContact
              onClose={() => setCreating(false)}
              onDone={() => {
                setCreating(false);
                setHistory(true);
              }}
            />
          )}
        </FormDialog>
        {writeOff && (
          <ContactWriteOffDialog
            contact={currentWriteOff ?? writeOff}
            ready={!contacts.isFetching && !contacts.isError && !!currentWriteOff}
            onClose={() => setWriteOff(null)}
          />
        )}
        <ContactRenameDialog contact={renaming} onClose={() => setRenaming(null)} />
      </div>
    </PageFrame>
  );
}

function ContactRename({
  contact,
  onOpen,
}: {
  contact: { id: string; name: string };
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="icon-btn contact-rename"
      aria-label={`${contact.name} umbenennen`}
      onClick={onOpen}
    >
      <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

export function ContactRenameDialog({
  contact,
  onClose,
}: {
  contact: { id: string; name: string } | null;
  onClose: () => void;
}) {
  return (
    <FormDialog open={contact !== null} onClose={onClose} title="Kontakt umbenennen">
      {contact && <NewContact contact={contact} onClose={onClose} onDone={onClose} />}
    </FormDialog>
  );
}

export function NewContact({
  onDone,
  onClose,
  contact,
}: {
  onDone: () => void;
  onClose: () => void;
  contact?: { id: string; name: string };
}) {
  useAmountPrivacy();
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => nameInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const [name, setName] = useState(contact?.name ?? '');
  const [busy, setBusy] = useState(false);
  const write = useContactWrite();
  return (
    <form
      className="bkform"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || !name.trim() || (contact && name.trim() === contact.name)) return;
        setBusy(true);
        void write(
          () =>
            request(
              contact ? 'PATCH' : 'POST',
              contact ? contactUrl(contact.id) : '/api/contacts',
              { name: name.trim() },
            ),
          contact ? 'Kontakt umbenannt.' : 'Kontakt angelegt.',
        ).then((ok) => {
          setBusy(false);
          if (ok) onDone();
        });
      }}
    >
      <div className="bk-head">
        <h2 className="bk-kind-fixed">{contact ? 'Kontakt umbenennen' : 'Neuer Kontakt'}</h2>
        <button type="button" className="icon-btn" aria-label="Schließen" onClick={onClose}>
          ×
          <span className="control-label" aria-hidden="true">
            Schließen
          </span>
        </button>
      </div>
      <div className="bk-body contacts-form">
        <Field label="Name">
          {({ id }) => (
            <TextInput
              id={id}
              ref={nameInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
            />
          )}
        </Field>
      </div>
      <div className="bk-foot">
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          type="submit"
          disabled={busy || !name.trim() || (!!contact && name.trim() === contact.name)}
        >
          {contact ? 'Speichern' : 'Kontakt anlegen'}
        </Button>
      </div>
    </form>
  );
}

export function ContactStatementPage() {
  useAmountPrivacy();
  const { id } = useParams({ strict: false }) as { id: string };
  const { verlauf } = useSearch({ strict: false }) as { verlauf?: number };
  const context = verlauf === 1 ? { verlauf } : {};
  const statement = useQuery({
    queryKey: [...LEDGER_KEY, 'contact', id],
    enabled: !!id,
    queryFn: () => request<Statement>('GET', contactUrl(id)),
  });
  return (
    <PageFrame meta={META}>
      <section className="contacts-page contacts-statement" aria-label="Kontaktkontoauszug">
        <nav aria-label="Brotkrumen">
          <AppLink className="btn btn-ghost" to="/konten/kontakte" search={context}>
            Zurück zu Kontakte
          </AppLink>
        </nav>
        {(statement.isPending || statement.isFetching) && <LoadingNote what="Kontoblatt" />}
        {statement.isError && (
          <ErrorNote
            what="Kontoblatt"
            error={statement.error}
            onRetry={() => void statement.refetch()}
          />
        )}
        {/* A read refresh hides statement figures, but must not discard an open editor/draft. */}
        {statement.data && (
          <ContactBody
            key={id}
            statement={statement.data}
            ready={!statement.isFetching && !statement.isError}
          />
        )}
      </section>
    </PageFrame>
  );
}

export function ContactBody({
  statement,
  ready,
  reportReader = false,
}: {
  statement: Statement;
  ready: boolean;
  reportReader?: boolean;
}) {
  useAmountPrivacy();
  const heading = useRef<HTMLHeadingElement>(null);
  const readerRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!reportReader) heading.current?.focus({ preventScroll: true });
  }, [statement.contact.id, reportReader]);
  const [receipt, setReceipt] = useState(false);
  const [writeOff, setWriteOff] = useState(false);
  const [info, setInfo] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const noteId = useId();
  const [sourceOpening, setSourceOpening] = useState<ContactSourceOpening | null>(null);
  const [giftOutlay, setGiftOutlay] = useState<OpenContactOutlay | null>(null);
  const sourceGeneration = useRef(0);
  const openSource = (movement: ContactMovement) =>
    setSourceOpening({ movement, generation: ++sourceGeneration.current });
  const balance = contactBalanceWords(statement.balanceCents);
  const currentMonth = statement.asOf.slice(0, 7);
  const monthTitle = `Zahlungen im ${new Intl.DateTimeFormat('de-AT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${currentMonth}-01T00:00:00Z`))}`;
  const closureIndex = statement.movements.findIndex(
    (movement) => movement.splitId === statement.closedThroughSplitId,
  );
  const currentMonthMovements = statement.movements.filter(
    (movement) => movement.date.slice(0, 7) === currentMonth,
  );
  const archived =
    closureIndex < 0
      ? []
      : statement.movements
          .slice(0, closureIndex + 1)
          .filter((movement) => movement.date.slice(0, 7) !== currentMonth);
  const postClosure = statement.movements
    .slice(closureIndex + 1)
    .filter((movement) => movement.date.slice(0, 7) !== currentMonth);
  const openOlderOutlays = statement.outlays.filter(
    (outlay) => outlay.remainingCents > 0 && outlay.date.slice(0, 7) !== currentMonth,
  );
  const openOlderIds = new Set(openOlderOutlays.map((outlay) => outlay.splitId));
  const visibleHistory = (closureIndex < 0 ? statement.movements : postClosure).filter(
    (movement) => movement.date.slice(0, 7) !== currentMonth && !openOlderIds.has(movement.splitId),
  );
  return (
    <div className="contacts-form" ref={readerRoot}>
      {!reportReader && (
        <div className="contacts-title">
          <h2 ref={heading} tabIndex={-1}>
            {statement.contact.name}
          </h2>
          <ContactRename contact={statement.contact} onOpen={() => setRenaming(true)} />
        </div>
      )}
      {ready && !reportReader && (
        <>
          <p className={`contacts-balance is-${balance.tone}`}>
            <span className="contacts-balance-words">{balance.words}</span>{' '}
            <span className="contacts-balance-amount">{balance.amount}</span>
          </p>
          <div className="contacts-actions">
            <Button onClick={() => setReceipt((r) => !r)}>
              {receipt ? 'Rückzahlung schließen' : 'Rückzahlung buchen'}
            </Button>
            {statement.balanceCents !== 0 && (
              <ContactActionsMenu
                name={statement.contact.name}
                onSettle={() => setWriteOff(true)}
              />
            )}
            <button
              type="button"
              className="icon-btn contact-info"
              aria-expanded={info}
              aria-controls={noteId}
              aria-label="Erläuterung zu Rückzahlung und Ausgleich"
              onClick={() => setInfo((open) => !open)}
            >
              <Info size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          {info && (
            <p id={noteId} className="contacts-note">
              Auslagen und Rückzahlungen bewegen Geld. Ein Ausgleich übernimmt Guthaben ins Budget
              oder erlässt eine Forderung als Ausgabe, ohne Geldbewegung.
            </p>
          )}
        </>
      )}
      {receipt && (
        <ReceiptForm statement={statement} ready={ready} onDone={() => setReceipt(false)} />
      )}
      {writeOff && (
        <ContactWriteOffDialog
          contact={{ ...statement.contact, balanceCents: statement.balanceCents }}
          ready={ready}
          onClose={() => setWriteOff(false)}
        />
      )}
      {giftOutlay && (
        <ContactGiftDialog
          statement={statement}
          outlay={giftOutlay}
          ready={ready}
          onClose={() => setGiftOutlay(null)}
          onOpenSource={() => {
            openSource(giftOutlay);
            setGiftOutlay(null);
          }}
        />
      )}
      {ready && (
        <>
          {currentMonthMovements.length === 0 ? (
            <>
              <h3>{monthTitle}</h3>
              <p>In diesem Monat gibt es noch keine Kontaktbuchungen.</p>
            </>
          ) : (
            <ContactMovementTable
              statement={statement}
              movements={currentMonthMovements}
              title={monthTitle}
              caption="Kontaktbuchungen im aktuellen Monat"
              onOpen={openSource}
              onGift={reportReader ? undefined : setGiftOutlay}
            />
          )}
          {openOlderOutlays.length > 0 && (
            <section aria-labelledby="contacts-open-older">
              <ContactMovementTable
                statement={statement}
                movements={openOlderOutlays}
                title="Offene ältere Auslagen"
                headingId="contacts-open-older"
                caption="Noch offene Auslagen aus früheren Monaten"
                onOpen={openSource}
                onGift={reportReader ? undefined : setGiftOutlay}
              />
            </section>
          )}
          {visibleHistory.length === 0 ? (
            <>
              <h3>Verlauf</h3>
              <p>Noch keine ältere oder spätere Kontaktbewegung.</p>
            </>
          ) : (
            <ContactMovementTable
              statement={statement}
              movements={visibleHistory}
              title="Verlauf außerhalb des aktuellen Monats"
              heading="Verlauf"
              caption="Kontaktbuchungen außerhalb des aktuellen Monats"
              onOpen={openSource}
              onGift={reportReader ? undefined : setGiftOutlay}
            />
          )}
          {archived.length > 0 && (
            <details className="contacts-closed-history">
              <summary>
                Abgeschlossene Historie bis zum Ausgleich anzeigen ({archived.length} Buchungen)
              </summary>
              <ContactMovementTable
                statement={statement}
                movements={archived}
                title="Abgeschlossene Historie bis zum Ausgleich"
                heading={false}
                caption="Abgeschlossene Kontaktbuchungen bis zum Ausgleich"
                onOpen={openSource}
                onGift={reportReader ? undefined : setGiftOutlay}
              />
            </details>
          )}
        </>
      )}
      <ContactRenameDialog
        contact={renaming ? statement.contact : null}
        onClose={() => setRenaming(false)}
      />
      <ContactBookingSource
        opening={sourceOpening}
        onClose={() => {
          const split = sourceOpening?.movement.splitId;
          setSourceOpening(null);
          if (reportReader && split)
            requestAnimationFrame(() => {
              const replacement = [
                ...(readerRoot.current?.querySelectorAll<HTMLButtonElement>(
                  '[data-contact-source]',
                ) ?? []),
              ].find((element) => element.dataset['contactSource'] === split);
              (
                replacement ??
                readerRoot.current?.closest('details')?.querySelector<HTMLElement>('summary')
              )?.focus({ preventScroll: true });
            });
        }}
      />
    </div>
  );
}

function ContactForgivenessGuard({ dirty, busy }: { dirty: boolean; busy: boolean }) {
  useBlocker({
    shouldBlockFn: () =>
      busy || (dirty && !window.confirm('Ungespeicherten Schuldenerlass verwerfen?')),
    enableBeforeUnload: dirty || busy,
  });
  return null;
}

export function ContactWriteOffDialog({
  contact,
  ready = true,
  forgivenessOnly = false,
  onRecheck,
  onClose,
}: {
  contact: { id: string; name: string; balanceCents: number };
  ready?: boolean;
  forgivenessOnly?: boolean;
  onRecheck?: () => void;
  onClose: () => void;
}) {
  useAmountPrivacy();
  const queryClient = useQueryClient();
  const accounts = useQuery(accountsQuery());
  const lookups = useQuery(lookupsQuery());
  const sourceReady =
    ready && accounts.isSuccess && !accounts.isFetching && lookups.isSuccess && !lookups.isFetching;
  const budgetAccounts =
    accounts.data?.accounts.filter(
      (a) =>
        a.onBudget &&
        a.currency === 'EUR' &&
        a.closedAt === null &&
        ['checking', 'savings', 'cash'].includes(a.type),
    ) ?? [];
  const incomeTypes = lookups.data?.incomeTypes.filter((t) => t.id !== 'income-capital') ?? [];
  const expenses =
    lookups.data?.categories.filter(
      (c) => c.class !== null && !['advance', 'income', 'card_payment'].includes(c.kind),
    ) ?? [];
  const credit = !forgivenessOnly && contact.balanceCents < 0;
  const [amount, setAmount] = useState(decimal(Math.abs(contact.balanceCents)));
  const [dateText, setDateText] = useState(longDay(todayInVienna()));
  const [memo, setMemo] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [incomeTypeId, setIncomeTypeId] = useState('income-other');
  const [busy, setBusy] = useState(false);
  const write = useContactWrite();
  const parsed = parseAmount(amount);
  const amountCents = parsed.ok ? parsed.cents : 0;
  const validAmount = amountCents > 0 && amountCents <= Math.abs(contact.balanceCents);
  const chosenAccount = accountId || budgetAccounts[0]?.id || '';
  const chosenType = incomeTypes.find((t) => t.id === incomeTypeId)?.id ?? '';
  const remaining = contact.balanceCents - Math.sign(contact.balanceCents) * amountCents;
  const date = dateText.replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, '$3-$2-$1');
  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date &&
    date <= todayInVienna();
  const budget = useQuery({
    ...budgetQuery(validDate ? date.slice(0, 7) : todayInVienna().slice(0, 7)),
    enabled: forgivenessOnly && validDate,
  });
  const envelope = forgivenessOnly
    ? budget.data?.summary.envelopes.find((item) => item.categoryId === categoryId)
    : undefined;
  const afterAvailable = envelope ? envelope.availableCents - amountCents : undefined;
  const previewReady =
    !forgivenessOnly ||
    (budget.isSuccess &&
      !budget.isFetching &&
      !budget.isError &&
      Number.isSafeInteger(afterAvailable));
  const category = expenses.find((item) => item.id === categoryId);
  const dirty =
    amount !== decimal(Math.abs(contact.balanceCents)) ||
    !!categoryId ||
    !!memo ||
    !!accountId ||
    dateText !== longDay(todayInVienna());
  const close = () => {
    if (
      busy ||
      (forgivenessOnly && dirty && !window.confirm('Ungespeicherten Schuldenerlass verwerfen?'))
    )
      return;
    onClose();
  };
  const valid =
    previewReady &&
    (!forgivenessOnly || (contact.balanceCents > 0 && !!category)) &&
    sourceReady &&
    validAmount &&
    chosenAccount &&
    validDate &&
    (credit ? chosenType : categoryId);
  return (
    <FormDialog
      open
      onClose={onClose}
      title={forgivenessOnly ? 'Schulden erlassen' : 'Kontakt ausgleichen'}
      beforeClose={() =>
        !busy &&
        (!forgivenessOnly || !dirty || window.confirm('Ungespeicherten Schuldenerlass verwerfen?'))
      }
    >
      <form
        className={`bkform contacts-write-off${forgivenessOnly ? ' contact-forgiveness-only' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid || busy) return;
          setBusy(true);
          void write(
            () =>
              request('POST', `${contactUrl(contact.id)}/write-offs`, {
                accountId: chosenAccount,
                date,
                amountCents,
                memo,
                ...(credit ? { incomeTypeId: chosenType } : { categoryId }),
              }),
            forgivenessOnly ? 'Schulden erlassen.' : 'Kontakt ausgeglichen.',
          ).then((ok) => {
            setBusy(false);
            if (ok) onClose();
            else if (forgivenessOnly) void queryClient.invalidateQueries();
          });
        }}
      >
        {forgivenessOnly && <ContactForgivenessGuard dirty={dirty} busy={busy} />}
        <div className="bk-head">
          <h2 className="bk-kind bk-kind-fixed">
            {forgivenessOnly ? 'Schulden erlassen' : 'Kontakt ausgleichen'}
          </h2>
          <Button variant="ghost" onClick={close} disabled={busy} aria-label="Schließen">
            ×
          </Button>
        </div>
        <div className="bk-body contacts-form">
          <p>
            {contact.name}
            {sourceReady
              ? ` · ${credit ? 'Einnahme ins Budget' : 'Ausgabe'}`
              : ' · Kontostand wird geprüft'}
          </p>
          {forgivenessOnly && contact.balanceCents <= 0 && (
            <p role="status">
              Aktuell besteht keine offene Forderung. Ein Schuldenerlass ist nicht möglich.
            </p>
          )}
          {forgivenessOnly && !ready && onRecheck && (
            <p role="status">
              Der Kontaktsaldo ist derzeit nicht bestätigt. Deine Eingaben bleiben erhalten.{' '}
              <Button variant="ghost" onClick={onRecheck}>
                Saldo erneut prüfen
              </Button>
            </p>
          )}
          <AmountInput label="Betrag" value={amount} onChange={setAmount} />
          {sourceReady && !validAmount && (
            <p role="alert" className="field-error">
              Bitte einen Betrag größer als 0 und höchstens {eur(Math.abs(contact.balanceCents))}{' '}
              eintragen.
            </p>
          )}
          <Field
            label="Datum"
            hint="TT.MM.JJJJ"
            error={!validDate ? 'Bitte ein gültiges Datum bis heute eintragen.' : undefined}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={dateText}
                placeholder="TT.MM.JJJJ"
                pattern="\d{2}\.\d{2}\.\d{4}"
                required
                onChange={(e) => setDateText(e.target.value)}
              />
            )}
          </Field>
          <Field label="Budgetkonto">
            {({ id }) => (
              <Select
                id={id}
                value={chosenAccount}
                required
                onChange={(e) => setAccountId(e.target.value)}
              >
                <AccountOptions accounts={budgetAccounts} />
              </Select>
            )}
          </Field>
          {credit ? (
            <Field label="Einnahmenart">
              {({ id }) => (
                <Select
                  id={id}
                  value={chosenType}
                  required
                  onChange={(e) => setIncomeTypeId(e.target.value)}
                >
                  {incomeTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Field label="Kategorie">
              {({ id }) => (
                <Select
                  id={id}
                  value={categoryId}
                  required
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Kategorie wählen</option>
                  {expenses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field label="Notiz">
            {({ id }) => (
              <TextInput
                id={id}
                value={memo}
                maxLength={2000}
                onChange={(e) => setMemo(e.target.value)}
              />
            )}
          </Field>
          {!forgivenessOnly && sourceReady && validAmount && (
            <p aria-live="polite">
              {eur(amountCents)} werden {credit ? 'ins Budget übernommen' : 'als Ausgabe gebucht'};
              der Kontakt steht danach auf {eur(remaining)}. Kein Geld bewegt sich.
            </p>
          )}
          {forgivenessOnly &&
            sourceReady &&
            validAmount &&
            category &&
            previewReady &&
            afterAvailable !== undefined && (
              <div aria-live="polite" className="contact-forgiveness-preview">
                <p>
                  Schuldenerlass für {contact.name}: {eur(amountCents)} · höchstens{' '}
                  {eur(Math.max(0, contact.balanceCents))}.
                </p>
                <p>
                  Kategorie {category.name}: verfügbar {eur(envelope!.availableCents)} →{' '}
                  {eur(afterAvailable)}. Fehlbetrag danach: {eur(Math.max(0, -afterAvailable))}.
                </p>
                <p>
                  Kontaktschuld danach: {eur(remaining)}. Kontogeld bleibt unverändert. Der Betrag
                  wird vom Auslagenposten in die gewählte Ausgabenkategorie umgebucht.
                </p>
              </div>
            )}
          {forgivenessOnly && budget.isPending && <LoadingNote what="Kategorievorschau" />}
          {forgivenessOnly && budget.isError && (
            <ErrorNote
              what="Kategorievorschau"
              error={budget.error}
              onRetry={() => void budget.refetch()}
            />
          )}
          {accounts.isError && (
            <ErrorNote
              what="Budgetkonten"
              error={accounts.error}
              onRetry={() => void accounts.refetch()}
            />
          )}
          {lookups.isError && (
            <ErrorNote
              what="Kategorien und Einnahmenarten"
              error={lookups.error}
              onRetry={() => void lookups.refetch()}
            />
          )}
          {!ready ||
          accounts.isFetching ||
          lookups.isFetching ||
          accounts.isPending ||
          lookups.isPending ? (
            <LoadingNote what="Ausgleich" />
          ) : (
            !budgetAccounts.length && (
              <p>Für den Ausgleich wird ein offenes EUR-Budgetkonto benötigt.</p>
            )
          )}
        </div>
        <div className="bk-foot">
          <Button variant="ghost" onClick={close} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={busy || !valid}>
            {forgivenessOnly ? 'Schulden erlassen' : 'Ausgleich speichern'}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}

function ContactGiftDialog({
  statement,
  outlay,
  ready,
  onClose,
  onOpenSource,
}: {
  statement: Statement;
  outlay: OpenContactOutlay;
  ready: boolean;
  onClose: () => void;
  onOpenSource: () => void;
}) {
  useAmountPrivacy();
  const [amount, setAmount] = useState(decimal(outlay.remainingCents));
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const write = useContactWrite();
  const source = useQuery({
    queryKey: [...LEDGER_KEY, 'contact-gift-source', outlay.bookingId],
    queryFn: () =>
      request<{ booking: ListedBooking }>(
        'GET',
        `/api/bookings/${encodeURIComponent(outlay.bookingId)}`,
      ),
    gcTime: 0,
  });
  const lookups = useQuery(lookupsQuery());
  const expenses =
    lookups.data?.categories.filter(
      (c) => c.class !== null && !['advance', 'income', 'card_payment'].includes(c.kind),
    ) ?? [];
  const parsed = parseAmount(amount);
  const amountCents = parsed.ok ? parsed.cents : 0;
  const booking = source.data?.booking;
  const allocated = statement.receipts.some(
    (receipt) =>
      receipt.recorded &&
      receipt.allocations.some(
        (a) =>
          a.outlaySplitId === outlay.splitId ||
          booking?.splits.some((s) => s.id === a.outlaySplitId),
      ),
  );
  const blocked =
    allocated ||
    booking?.status === 'reconciled' ||
    !!booking?.transferId ||
    booking?.splits.some((s) => s.transferId);
  const valid =
    ready &&
    !!booking &&
    source.isSuccess &&
    !source.isFetching &&
    lookups.isSuccess &&
    !lookups.isFetching &&
    !blocked &&
    outlay.date <= todayInVienna() &&
    amountCents > 0 &&
    amountCents <= outlay.remainingCents &&
    expenses.some((c) => c.id === categoryId);
  return (
    <FormDialog
      open
      title="Auslage als Geschenk übernehmen"
      onClose={onClose}
      beforeClose={() => !busy}
    >
      <form
        className="contacts-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid || busy) return;
          setBusy(true);
          void write(
            () =>
              request(
                'POST',
                `${contactUrl(statement.contact.id)}/outlays/${encodeURIComponent(outlay.splitId)}/gift`,
                { amountCents, categoryId },
              ),
            'Auslage als eigenes Geschenk übernommen.',
          ).then((ok) => {
            setBusy(false);
            if (ok) onClose();
          });
        }}
      >
        <h2>Auslage als Geschenk übernehmen</h2>
        <p>
          {maskMoneyText(outlay.memo?.trim() || 'Auslage')} · {statement.contact.name}
        </p>
        <p>
          Datum bleibt {longDay(booking?.date ?? outlay.date)}. Der Bankbetrag bleibt gleich. Nur
          der gewählte Kontaktanteil wird deine eigene Ausgabe.
        </p>
        {allocated && (
          <p role="status">
            Diese Buchung ist bereits einer Rückzahlung zugeordnet. Zuerst die zugehörige
            Rückzahlung rückgängig machen.
          </p>
        )}
        {booking?.status === 'reconciled' && (
          <p role="status">
            Die Ursprungsbuchung ist abgeglichen und gesperrt. Bitte dort den bestehenden
            Entsperrweg verwenden.
          </p>
        )}
        {blocked && (
          <Button variant="ghost" onClick={onOpenSource}>
            Ursprungsbuchung öffnen
          </Button>
        )}
        <AmountInput label="Geschenkbetrag" value={amount} onChange={setAmount} />
        <Field label="Eigene Geschenkkategorie">
          {({ id }) => (
            <Select
              id={id}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              <option value="">Kategorie wählen</option>
              {expenses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {source.isPending && <LoadingNote what="Ursprungsbuchung" />}
        {source.isError && (
          <ErrorNote
            what="Ursprungsbuchung"
            error={source.error}
            onRetry={() => void source.refetch()}
          />
        )}
        {lookups.isError && (
          <ErrorNote
            what="Geschenkkategorie"
            error={lookups.error}
            onRetry={() => void lookups.refetch()}
          />
        )}
        <div className="contacts-actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={!valid || busy}>
            Als Geschenk übernehmen
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}

function ReceiptForm({
  statement,
  ready,
  onDone,
}: {
  statement: Statement;
  ready: boolean;
  onDone: () => void;
}) {
  useAmountPrivacy();
  const accounts = useQuery(accountsQuery());
  const cash =
    accounts.data?.accounts.filter(
      (a) =>
        a.closedAt === null &&
        a.currency === 'EUR' &&
        ['checking', 'savings', 'cash'].includes(a.type),
    ) ?? [];
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(todayInVienna());
  const [amount, setAmount] = useState('');
  const [chosen, setChosen] = useState<Record<string, string> | null>(null);
  const [excessToBudget, setExcessToBudget] = useState(true);
  const [busy, setBusy] = useState(false);
  const write = useContactWrite();
  const target = useQuery({
    queryKey: [...LEDGER_KEY, 'contact', statement.contact.id, date],
    queryFn: () =>
      request<Statement>(
        'GET',
        `${contactUrl(statement.contact.id)}?asOf=${encodeURIComponent(date)}`,
      ),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
  });
  const sourceReady =
    ready && accounts.isSuccess && !accounts.isFetching && target.isSuccess && !target.isFetching;
  const open = target.data?.outlays.filter((o) => o.remainingCents > 0) ?? [];
  const parsed = parseAmount(amount);
  const amountCents = parsed.ok && parsed.cents > 0 ? parsed.cents : 0;
  const plan = allocateContactReceipt(open, amountCents);
  const chosenAccount = cash.find((a) => a.id === (accountId || cash[0]?.id));
  const validExcessDestination =
    !excessToBudget || plan.creditCents === 0 || chosenAccount?.onBudget === true;
  const values =
    chosen ??
    Object.fromEntries(
      open.map((o) => [
        o.splitId,
        decimal(plan.allocations.find((a) => a.outlaySplitId === o.splitId)?.amountCents ?? 0),
      ]),
    );
  let allocations: ContactAllocation[] = [];
  let allocationError = '';
  try {
    allocations = open.flatMap((o) => {
      const value = parseAmount(values[o.splitId] ?? '0');
      if (!value.ok || value.cents < 0) throw new Error('Bitte gültige Anteile eintragen.');
      return value.cents ? [{ outlaySplitId: o.splitId, amountCents: value.cents }] : [];
    });
    allocateContactReceipt(open, amountCents, allocations);
  } catch {
    allocationError =
      'Die Anteile müssen zur Rückzahlung passen und dürfen die offene Auslage nicht übersteigen.';
  }
  return (
    <form
      className="contacts-form contacts-receipt"
      onSubmit={(e) => {
        e.preventDefault();
        if (
          !sourceReady ||
          !amountCents ||
          allocationError ||
          !validExcessDestination ||
          !target.data
        )
          return;
        setBusy(true);
        void write(
          () =>
            request('POST', `${contactUrl(statement.contact.id)}/settlements`, {
              accountId: accountId || cash[0]?.id,
              date,
              amountCents,
              allocations,
              excessToBudget,
            }),
          'Rückzahlung gebucht.',
        ).then((ok) => {
          setBusy(false);
          if (ok) onDone();
        });
      }}
    >
      <p>Rückzahlungen sind auf offene EUR-Konten (Giro, Sparen oder Bargeld) möglich.</p>
      <Field label="Konto">
        {({ id }) => (
          <Select
            id={id}
            value={accountId || cash[0]?.id || ''}
            onChange={(e) => setAccountId(e.target.value)}
            required
          >
            <AccountOptions accounts={cash} />
          </Select>
        )}
      </Field>
      <Field label="Datum">
        {({ id }) => (
          <TextInput
            id={id}
            type="date"
            value={date}
            max={todayInVienna()}
            required
            onChange={(e) => {
              setDate(e.target.value);
              setChosen(null);
            }}
          />
        )}
      </Field>
      <AmountInput
        label="Rückzahlung"
        value={amount}
        onChange={(v) => {
          setAmount(v);
        }}
      />
      <p>Standard: älteste offene Auslage zuerst. Anteile vor dem Speichern ändern.</p>
      <p>
        Auslagen auswählen und die tatsächliche Rückzahlung prüfen. Die Auswahl allein bucht kein
        Geld.
      </p>
      {(!ready || target.isPending || target.isFetching || accounts.isFetching) && (
        <LoadingNote what="Offene Auslagen" />
      )}
      {accounts.isError && (
        <ErrorNote what="Konten" error={accounts.error} onRetry={() => void accounts.refetch()} />
      )}
      {target.isError && (
        <ErrorNote
          what="Offene Auslagen"
          error={target.error}
          onRetry={() => void target.refetch()}
        />
      )}
      {open.map((o, i) => (
        <div key={o.splitId} className="contact-receipt-allocation">
          <label className="contact-select-outlay">
            <input
              type="checkbox"
              checked={sourceReady && allocations.some((a) => a.outlaySplitId === o.splitId)}
              disabled={!sourceReady || busy}
              onChange={(e) => {
                const next = {
                  ...values,
                  [o.splitId]: decimal(e.target.checked ? o.remainingCents : 0),
                };
                const total = open.reduce((sum, item) => {
                  const value = parseAmount(next[item.splitId] ?? '0');
                  return sum + (value.ok && value.cents > 0 ? value.cents : 0);
                }, 0);
                setChosen(next);
                setAmount(Number.isSafeInteger(total) ? decimal(total) : '');
              }}
            />
            Für Rückzahlung:{' '}
            {sourceReady ? maskMoneyText(o.memo?.trim() || `Auslage ${i + 1}`) : `Auslage ${i + 1}`}{' '}
            ausgleichen
          </label>
          <Field
            label={
              sourceReady
                ? `Auslage ${i + 1} · ${longDay(o.date)} · offen ${eur(o.remainingCents)}`
                : `Auslage ${i + 1}`
            }
          >
            {({ id }) => (
              <TextInput
                id={id}
                inputMode="decimal"
                value={values[o.splitId] ?? '0'}
                money
                onChange={(e) => setChosen({ ...values, [o.splitId]: e.target.value })}
              />
            )}
          </Field>
        </div>
      ))}
      <label className="contact-select-outlay">
        <input
          type="checkbox"
          checked={excessToBudget}
          onChange={(e) => setExcessToBudget(e.target.checked)}
        />
        Überschuss dieser Rückzahlung ins Budget übernehmen
      </label>
      {sourceReady && (
        <p>
          {excessToBudget ? 'Zusätzlich zu verteilen: ' : 'Guthaben aus dieser Rückzahlung: '}
          <strong>{eur(plan.creditCents)}</strong>
        </p>
      )}
      {!validExcessDestination && (
        <p role="alert">Für die Übernahme ins Budget bitte ein Budgetkonto wählen.</p>
      )}
      {sourceReady && amountCents > 0 && allocationError && (
        <p className="field-error" role="alert">
          {allocationError}
        </p>
      )}
      <Button
        type="submit"
        disabled={
          busy ||
          !sourceReady ||
          !cash.length ||
          !amountCents ||
          !!allocationError ||
          !validExcessDestination ||
          !target.data ||
          target.isFetching
        }
      >
        Rückzahlung speichern
      </Button>
    </form>
  );
}
