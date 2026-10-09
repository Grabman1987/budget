import {
  useAmountPrivacy,
  AmountInput,
  Button,
  FormDialog,
  Field,
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
import { useLocation, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { request } from '../api/http';
import { AccountOptions } from '../ledger/account-options';
import { undoGroup } from '../ledger/api';
import { eur, longDay } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { accountsQuery, lookupsQuery, LEDGER_KEY } from '../ledger/queries';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { PAGES } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import './contacts.css';
import '../ledger/ledger.css';
interface ContactRow {
  id: string;
  name: string;
  balanceCents: number;
  creditCents: number;
}
interface Statement {
  contact: { id: string; name: string };
  asOf: string;
  balanceCents: number;
  creditCents: number;
  movements: ContactMovement[];
  outlays: OpenContactOutlay[];
  receipts: { receiptSplitId: string; allocations: ContactAllocation[]; creditCents: number }[];
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
  const [writeOff, setWriteOff] = useState<ContactRow | null>(null);
  const contacts = useQuery({
    queryKey: [...LEDGER_KEY, 'contacts', history],
    queryFn: () =>
      request<{ contacts: ContactRow[] }>('GET', `/api/contacts?history=${history ? '1' : '0'}`),
  });
  return (
    <PageFrame meta={META}>
      <div className="contacts-page">
        <p>Kontoblätter und Rückzahlungen werden derzeit in EUR geführt.</p>
        <div className="ptoolbar">
          <label className="contacts-history">
            <input
              type="checkbox"
              checked={history}
              onChange={(e) => setHistory(e.target.checked)}
            />
            Auch ausgeglichene Kontakte
          </label>
          <span className="spacer" />
          <Button size="sm" onClick={() => setCreating(true)}>
            Neuer Kontakt
          </Button>
        </div>
        {contacts.isPending && <LoadingNote what="Kontakte" />}
        {contacts.isError && (
          <ErrorNote
            what="Kontakte"
            error={contacts.error}
            onRetry={() => void contacts.refetch()}
          />
        )}
        {contacts.data &&
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
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {contacts.data.contacts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <AppLink
                        className="btn btn-ghost"
                        to={`/konten/kontakte/${encodeURIComponent(c.id)}`}
                        search={history ? { verlauf: 1 } : {}}
                      >
                        {c.name}
                      </AppLink>
                    </td>
                    <td className="num">{eur(c.balanceCents)}</td>
                    <td>
                      {c.balanceCents > 0
                        ? 'Kontakt schuldet dir'
                        : c.balanceCents < 0
                          ? 'Guthaben des Kontakts'
                          : 'Ausgeglichen'}
                      {c.balanceCents !== 0 && (
                        <div>
                          <Button variant="ghost" onClick={() => setWriteOff(c)}>
                            Ausgleichen
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
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
        {writeOff && <ContactWriteOffDialog contact={writeOff} onClose={() => setWriteOff(null)} />}
      </div>
    </PageFrame>
  );
}

function NewContact({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  useAmountPrivacy();
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => nameInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const write = useContactWrite();
  return (
    <form
      className="bkform"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void write(
          () => request('POST', '/api/contacts', { name: name.trim() }),
          'Kontakt angelegt.',
        ).then((ok) => {
          setBusy(false);
          if (ok) onDone();
        });
      }}
    >
      <div className="bk-head">
        <h2 className="bk-kind-fixed">Neuer Kontakt</h2>
        <button type="button" className="icon-btn" aria-label="Schließen" onClick={onClose}>
          ×
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
        <Button type="submit" disabled={busy || !name.trim()}>
          Kontakt anlegen
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
    <PageFrame meta={META} title={statement.data?.contact.name ?? 'Kontoblatt'}>
      <section className="contacts-page contacts-statement" aria-label="Kontaktkontoauszug">
        <nav aria-label="Brotkrumen">
          <AppLink to="/konten" search={{}}>
            Konten
          </AppLink>
          {' › '}
          <AppLink to="/konten/kontakte" search={context}>
            Kontakte
          </AppLink>
          {' › '}
          <span aria-current="page">{statement.data?.contact.name ?? 'Kontoblatt'}</span>
        </nav>
        <AppLink className="btn btn-ghost" to="/konten/kontakte" search={context}>
          Zurück zu Kontakte
        </AppLink>
        {statement.isPending && <LoadingNote what="Kontoblatt" />}
        {statement.isError && (
          <ErrorNote
            what="Kontoblatt"
            error={statement.error}
            onRetry={() => void statement.refetch()}
          />
        )}
        {statement.data && <ContactBody key={id} statement={statement.data} />}
      </section>
    </PageFrame>
  );
}

function ContactBody({ statement }: { statement: Statement }) {
  useAmountPrivacy();
  const [receipt, setReceipt] = useState(false);
  const [writeOff, setWriteOff] = useState(false);
  return (
    <div className="contacts-form">
      <h2>Kontoblatt</h2>
      <p className="contacts-balance">
        {eur(statement.balanceCents)}{' '}
        <span>
          {statement.balanceCents > 0
            ? 'offen'
            : statement.balanceCents < 0
              ? 'Guthaben des Kontakts'
              : 'ausgeglichen'}
        </span>
      </p>
      <p>
        Auslagen und Rückzahlungen bewegen Geld. Ein Ausgleich übernimmt Guthaben ins Budget oder
        erlässt eine Forderung als Ausgabe, ohne Geldbewegung.
      </p>
      <Button onClick={() => setReceipt((r) => !r)}>
        {receipt ? 'Rückzahlung schließen' : 'Rückzahlung buchen'}
      </Button>
      {receipt && <ReceiptForm statement={statement} onDone={() => setReceipt(false)} />}
      {statement.balanceCents !== 0 && (
        <Button variant="ghost" onClick={() => setWriteOff(true)}>
          Ausgleichen
        </Button>
      )}
      {writeOff && (
        <ContactWriteOffDialog
          contact={{ ...statement.contact, balanceCents: statement.balanceCents }}
          onClose={() => setWriteOff(false)}
        />
      )}
      <h3>Verlauf</h3>
      {statement.movements.length === 0 ? (
        <p>Noch keine Kontaktbuchungen. Beim Erfassen einer Auslage den Kontakt wählen.</p>
      ) : (
        <table className="contacts-table">
          <caption className="sr-only">Kontaktbuchungen</caption>
          <thead>
            <tr>
              <th scope="col">Datum / Buchung</th>
              <th scope="col">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {statement.movements.map((m) => {
              const repayment = statement.receipts.find((r) => r.receiptSplitId === m.splitId);
              const outlay = statement.outlays.find((o) => o.splitId === m.splitId);
              return (
                <tr key={m.splitId}>
                  <td>
                    {longDay(m.date)} ·{' '}
                    {m.memo?.startsWith('Ausgleich Kontakt')
                      ? 'Ausgleich'
                      : m.amountCents < 0
                        ? 'Auslage'
                        : 'Rückzahlung'}
                    {m.memo && <small>{m.memo}</small>}
                    {outlay && <small>Offen: {eur(outlay.remainingCents)}</small>}
                    {repayment && (
                      <small>
                        {repayment.allocations
                          .map(
                            (a) =>
                              `${longDay(statement.outlays.find((o) => o.splitId === a.outlaySplitId)!.date)}: ${eur(a.amountCents)}`,
                          )
                          .join(' · ')}
                        {repayment.creditCents > 0 && ` · Guthaben: ${eur(repayment.creditCents)}`}
                      </small>
                    )}
                  </td>
                  <td className="num">{eur(m.amountCents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function ContactWriteOffDialog({
  contact,
  onClose,
}: {
  contact: { id: string; name: string; balanceCents: number };
  onClose: () => void;
}) {
  useAmountPrivacy();
  const accounts = useQuery(accountsQuery());
  const lookups = useQuery(lookupsQuery());
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
  const credit = contact.balanceCents < 0;
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
  const valid = validAmount && chosenAccount && validDate && (credit ? chosenType : categoryId);
  return (
    <FormDialog open onClose={onClose} title="Kontakt ausgleichen" beforeClose={() => !busy}>
      <form
        className="bkform contacts-write-off"
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
            'Kontakt ausgeglichen.',
          ).then((ok) => {
            setBusy(false);
            if (ok) onClose();
          });
        }}
      >
        <div className="bk-head">
          <h2 className="bk-kind bk-kind-fixed">Kontakt ausgleichen</h2>
          <Button variant="ghost" onClick={onClose} disabled={busy} aria-label="Schließen">
            ×
          </Button>
        </div>
        <div className="bk-body contacts-form">
          <p>
            {contact.name} · {credit ? 'Einnahme ins Budget' : 'Ausgabe'}
          </p>
          <AmountInput label="Betrag" value={amount} onChange={setAmount} />
          {!validAmount && (
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
          {validAmount && (
            <p aria-live="polite">
              {eur(amountCents)} werden {credit ? 'ins Budget übernommen' : 'als Ausgabe gebucht'};
              der Kontakt steht danach auf {eur(remaining)}. Kein Geld bewegt sich.
            </p>
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
          {accounts.isPending || lookups.isPending ? (
            <LoadingNote what="Ausgleich" />
          ) : (
            !budgetAccounts.length && (
              <p>Für den Ausgleich wird ein offenes EUR-Budgetkonto benötigt.</p>
            )
          )}
        </div>
        <div className="bk-foot">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={busy || !valid}>
            Ausgleich speichern
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}

function ReceiptForm({ statement, onDone }: { statement: Statement; onDone: () => void }) {
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
  const open = target.data?.outlays.filter((o) => o.remainingCents > 0) ?? [];
  const parsed = parseAmount(amount);
  const amountCents = parsed.ok && parsed.cents > 0 ? parsed.cents : 0;
  const plan = allocateContactReceipt(open, amountCents);
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
        if (!amountCents || allocationError || !target.data) return;
        setBusy(true);
        void write(
          () =>
            request('POST', `${contactUrl(statement.contact.id)}/settlements`, {
              accountId: accountId || cash[0]?.id,
              date,
              amountCents,
              allocations,
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
          setChosen(null);
        }}
      />
      <p>Standard: älteste offene Auslage zuerst. Anteile vor dem Speichern ändern.</p>
      {target.isPending && <LoadingNote what="Offene Auslagen" />}
      {target.isError && (
        <ErrorNote
          what="Offene Auslagen"
          error={target.error}
          onRetry={() => void target.refetch()}
        />
      )}
      {open.map((o, i) => (
        <Field
          key={o.splitId}
          label={`Auslage ${i + 1} · ${longDay(o.date)} · offen ${eur(o.remainingCents)}`}
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
      ))}
      <p>
        Guthaben aus dieser Rückzahlung: <strong>{eur(plan.creditCents)}</strong>
      </p>
      {amountCents > 0 && allocationError && (
        <p className="field-error" role="alert">
          {allocationError}
        </p>
      )}
      <Button
        type="submit"
        disabled={
          busy ||
          !cash.length ||
          !amountCents ||
          !!allocationError ||
          !target.data ||
          target.isFetching
        }
      >
        Rückzahlung speichern
      </Button>
    </form>
  );
}
