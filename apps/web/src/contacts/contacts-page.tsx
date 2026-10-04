import {
  useAmountPrivacy,
  AmountInput,
  Button,
  DetailPanel,
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
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { request } from '../api/http';
import { AccountOptions } from '../ledger/account-options';
import { undoGroup } from '../ledger/api';
import { eur, longDay } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { accountsQuery, LEDGER_KEY } from '../ledger/queries';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { PAGES } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import './contacts.css';
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
  const [history, setHistory] = useState(false);
  const search = useSearch({ strict: false }) as { kontakt?: string };
  const selected = search.kontakt ?? '';
  const navigate = useNavigate();
  const setSelected = (kontakt: string) =>
    void navigate({
      to: '/konten/kontakte',
      search: { kontakt: kontakt || undefined } as never,
    });
  const [creating, setCreating] = useState(false);
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
                      <Button variant="ghost" onClick={() => setSelected(c.id)}>
                        {c.name}
                      </Button>
                    </td>
                    <td className="num">{eur(c.balanceCents)}</td>
                    <td>
                      {c.balanceCents > 0
                        ? 'Kontakt schuldet dir'
                        : c.balanceCents < 0
                          ? 'Guthaben des Kontakts'
                          : 'Ausgeglichen'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        <DetailPanel open={creating} onClose={() => setCreating(false)} title="Neuer Kontakt">
          {creating && (
            <NewContact
              onDone={() => {
                setCreating(false);
                setHistory(true);
              }}
            />
          )}
        </DetailPanel>
        <ContactPanel id={selected} onClose={() => setSelected('')} />
      </div>
    </PageFrame>
  );
}

function NewContact({ onDone }: { onDone: () => void }) {
  useAmountPrivacy();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const write = useContactWrite();
  return (
    <form
      className="contacts-form"
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
      <Field label="Name">
        {({ id }) => (
          <TextInput
            id={id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            required
          />
        )}
      </Field>
      <Button type="submit" disabled={busy || !name.trim()}>
        Kontakt anlegen
      </Button>
    </form>
  );
}

function ContactPanel({ id, onClose }: { id: string; onClose: () => void }) {
  useAmountPrivacy();
  const statement = useQuery({
    queryKey: [...LEDGER_KEY, 'contact', id],
    enabled: !!id,
    queryFn: () => request<Statement>('GET', contactUrl(id)),
  });
  return (
    <DetailPanel open={!!id} onClose={onClose} title={statement.data?.contact.name ?? 'Kontoblatt'}>
      {statement.isPending && <LoadingNote what="Kontoblatt" />}
      {statement.isError && (
        <ErrorNote
          what="Kontoblatt"
          error={statement.error}
          onRetry={() => void statement.refetch()}
        />
      )}
      {statement.data && <ContactBody key={id} statement={statement.data} />}
    </DetailPanel>
  );
}

function ContactBody({ statement }: { statement: Statement }) {
  useAmountPrivacy();
  const [receipt, setReceipt] = useState(false);
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
        Auslagen und Rückzahlungen sind tatsächliche Kontobewegungen. Erwartete Zahlungen zählen
        erst nach der Buchung.
      </p>
      <Button onClick={() => setReceipt((r) => !r)}>
        {receipt ? 'Rückzahlung schließen' : 'Rückzahlung buchen'}
      </Button>
      {receipt && <ReceiptForm statement={statement} onDone={() => setReceipt(false)} />}
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
                    {longDay(m.date)} · {m.amountCents < 0 ? 'Auslage' : 'Rückzahlung'}
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
