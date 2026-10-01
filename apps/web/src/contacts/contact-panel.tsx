import {
  addMonths,
  cents,
  formatDecimal,
  lastDayOfMonth,
  monthOf,
  parseAmount,
  todayInVienna,
} from '@budget/domain';
import {
  AmountInput,
  Button,
  DetailPanel,
  DimensionChain,
  Field,
  Select,
  TextInput,
  type DimensionChainTerm,
} from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useBudgetWrite } from '../budget/use-category-writes';
import { eur, shortDay } from '../ledger/format';
import { accountsQuery } from '../ledger/queries';
import { monthLabel } from '../nav/month';
import { AppLink } from '../shell/app-link';
import {
  contactLedgerQuery,
  createContact,
  deleteContact,
  patchContact,
  settleContact,
  type ContactLedger,
  type ContactView,
} from './contacts-api';
import {
  BALANCE_LABEL,
  OCCURRENCE_STATUS_LABEL,
  balanceKind,
  defaultSettleAccount,
  openItemsText,
  settleHint,
} from './contacts-model';

export type ContactPanelState =
  { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; id: string };

/** Earliest month the Kontoblatt can be paged back to from today. */
const MONTHS_BACK = 36;

/**
 * Side panel (desktop) / bottom sheet (phone) of one contact: the Kontoblatt with the monthly
 * statement, the open items, "Ausgleich buchen", the expected contributions and the contact's own
 * data. A new contact only asks for name and note.
 */
export function ContactPanel({
  state,
  contact,
  onClose,
}: {
  state: ContactPanelState;
  contact: ContactView | undefined;
  onClose: () => void;
}) {
  const creating = state.mode === 'create';
  const shown = state.mode === 'closed' || (state.mode === 'edit' && !contact) ? false : true;
  return (
    <DetailPanel
      open={shown}
      onClose={onClose}
      title={creating ? 'Neuer Kontakt' : (contact?.name ?? '')}
    >
      {shown && <ContactBody key={contact?.id ?? 'new'} contact={contact} onDone={onClose} />}
    </DetailPanel>
  );
}

function ContactBody({
  contact,
  onDone,
}: {
  contact: ContactView | undefined;
  onDone: () => void;
}) {
  return (
    <div className="kform contact-form">
      {contact && <Kontoblatt contact={contact} />}
      <ContactData contact={contact} onDone={onDone} />
    </div>
  );
}

function Kontoblatt({ contact }: { contact: ContactView }) {
  const today = todayInVienna();
  const current = monthOf(today);
  const [month, setMonth] = useState(current);
  const ledger = useQuery(contactLedgerQuery(contact.id, `${month}-01`, lastDayOfMonth(month)));
  const kind = balanceKind(contact);

  return (
    <>
      <div>
        <div className="big" data-testid="contact-balance">
          {eur(contact.balanceCents)}
        </div>
        <p className="panel-sub">
          {BALANCE_LABEL[kind]} · {openItemsText(contact.openItemCount)}
          {contact.accountBalanceCents !== 0 &&
            ` · davon ${eur(contact.accountBalanceCents)} auf dem Forderungskonto`}
        </p>
      </div>

      <div className="cm-head">
        <h3 className="panel-h">Monatsabrechnung</h3>
        <div className="cm-nav" role="group" aria-label="Monat der Abrechnung">
          <button
            type="button"
            className="icon-btn"
            aria-label="Vormonat"
            disabled={month <= addMonths(current, -MONTHS_BACK)}
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <span className="cm-month" aria-live="polite">
            {monthLabel(month)}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Nächster Monat"
            disabled={month >= current}
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>
      {ledger.isPending && <p className="panel-sub">Kontoblatt wird geladen …</p>}
      {ledger.isError && <p className="panel-sub">Das Kontoblatt konnte nicht geladen werden.</p>}
      {ledger.data && <Statement ledger={ledger.data} month={month} />}

      {ledger.data && <OpenItemsBlock ledger={ledger.data} contact={contact} />}
      {ledger.data && <Outlook ledger={ledger.data} />}

      <h3 className="panel-h">Ausgleich buchen</h3>
      <SettleForm
        key={`${contact.openCents}-${ledger.data?.openItems.length ?? 0}`}
        contact={contact}
        ledger={ledger.data}
      />

      <p className="panel-sub">
        <AppLink to="/konten/buchungen" search={{ kontakt: contact.id }}>
          Alle Buchungen dieses Kontakts ansehen
        </AppLink>
      </p>
    </>
  );
}

/** Offen am Monatsanfang + Neu − Bezahlt = Offen am Monatsende, then the rows of the month. */
function Statement({ ledger, month }: { ledger: ContactLedger; month: string }) {
  const s = ledger.statements.find((x) => x.month === month);
  if (!s) return null;
  const terms: DimensionChainTerm[] = [
    { label: 'Offen am Monatsanfang', value: cents(s.openingCents) },
    { label: 'Neu', value: cents(s.newCents), op: '+' },
    { label: 'Bezahlt', value: cents(s.paidCents), op: '-' },
    { label: 'Offen am Monatsende', value: cents(s.closingCents), op: '=' },
  ];
  return (
    <>
      <DimensionChain terms={terms} precision="cent" label={`Maßkette Kontoblatt ${month}`} />
      <p className="panel-sub" data-testid="statement-difference">
        Differenz im Monat: {eur(s.differenceCents, { sign: true })}
      </p>
      {ledger.rows.length === 0 ? (
        <p className="panel-sub">Keine Buchungen in diesem Monat.</p>
      ) : (
        <table className="cm-sheet">
          <caption className="sr-only">Kontoblatt {monthLabel(month)}</caption>
          <thead>
            <tr>
              <th className="tech" scope="col">
                Datum
              </th>
              <th className="tech" scope="col">
                Text
              </th>
              <th className="tech cm-num" scope="col">
                Auslage / Ausgleich
              </th>
              <th className="tech cm-num" scope="col">
                Saldo
              </th>
            </tr>
          </thead>
          <tbody>
            {ledger.rows.map((r) => (
              <tr key={r.id} data-testid="sheet-row">
                <td className="cm-date">{shortDay(r.date)}</td>
                <td>{r.memo ?? (r.ausgleichCents > 0 ? 'Ausgleich' : 'Auslage')}</td>
                <td className="cm-num">
                  {r.ausgleichCents > 0
                    ? eur(-r.ausgleichCents, { sign: true })
                    : eur(r.auslageCents, { sign: true })}
                </td>
                <td className="cm-num cm-run">{eur(r.balanceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function OpenItemsBlock({ ledger, contact }: { ledger: ContactLedger; contact: ContactView }) {
  return (
    <>
      <h3 className="panel-h">Offene Posten</h3>
      {ledger.openItems.length === 0 ? (
        <p className="panel-sub">
          {contact.creditCents > 0
            ? `Nichts offen. ${eur(contact.creditCents)} wurden mehr zurückgezahlt.`
            : 'Nichts offen.'}
        </p>
      ) : (
        <ul className="cm-items" aria-label="Offene Posten, älteste zuerst">
          {ledger.openItems.map((i) => (
            <li key={i.id} data-testid="open-item">
              <span className="cm-date">{shortDay(i.date)}</span>
              <span className="cm-text">{i.memo ?? 'Auslage'}</span>
              <span className="cm-num">
                {eur(i.openCents)}
                {i.openCents !== i.amountCents && (
                  <span className="cc-sub">von {eur(i.amountCents)}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Outlook({ ledger }: { ledger: ContactLedger }) {
  const { contributions, passThroughs } = ledger.outlook;
  if (contributions.length === 0 && passThroughs.length === 0) return null;
  const lines = [
    ...contributions.map((l) => ({ ...l, kind: 'Beitrag' })),
    ...passThroughs.map((l) => ({ ...l, kind: 'weitergereicht' })),
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return (
    <>
      <h3 className="panel-h">Erwartet in 30 Tagen</h3>
      <ul className="cm-items" aria-label="Erwartete Beiträge und weitergereichte Kosten">
        {lines.map((l) => (
          <li key={l.occurrenceId} data-testid="outlook-line">
            <span className="cm-date">{shortDay(l.dueDate)}</span>
            <span className="cm-text">
              {l.name}
              <span className="cc-sub">
                {l.kind} · {OCCURRENCE_STATUS_LABEL[l.status]}
              </span>
            </span>
            <span className="cm-num">{eur(l.cents)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function SettleForm({
  contact,
  ledger,
}: {
  contact: ContactView;
  ledger: ContactLedger | undefined;
}) {
  const write = useBudgetWrite();
  const accounts = useQuery(accountsQuery()).data?.accounts ?? [];
  const usable = accounts.filter((a) => a.closedAt === null && a.currency === 'EUR');
  const today = todayInVienna();
  const [amount, setAmount] = useState(
    contact.openCents > 0 ? formatDecimal(cents(contact.openCents)) : '',
  );
  const [accountId, setAccountId] = useState(defaultSettleAccount(accounts)?.id ?? '');
  const [date, setDate] = useState(today);
  const [errors, setErrors] = useState<{ amount?: string; account?: string; date?: string }>({});
  const parsed = parseAmount(amount);
  const items = ledger?.openItems ?? [];
  const chosen = accountId || defaultSettleAccount(accounts)?.id || '';

  if (contact.openCents === 0)
    return <p className="panel-sub">Es ist nichts offen, das ausgeglichen werden könnte.</p>;

  const submit = async () => {
    const next: typeof errors = {};
    if (!parsed.ok || parsed.cents <= 0) next.amount = 'Bitte einen Betrag über 0 eintragen.';
    else if (parsed.cents > contact.openCents)
      next.amount = `Mehr als offen ist (${eur(contact.openCents)}).`;
    if (chosen === '') next.account = 'Bitte ein Konto wählen.';
    if (date === '') next.date = 'Bitte ein Datum wählen.';
    else if (date > today) next.date = 'Ein Ausgleich liegt nicht in der Zukunft.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.ok) return;
    await write(
      () => settleContact(contact.id, { accountId: chosen, date, amountCents: parsed.cents }),
      (r) =>
        `Ausgleich ${eur(parsed.cents)} von ${contact.name} gebucht · ${
          r.settlement.parts.filter((p) => p.remainingCents === 0).length
        } von ${items.length} Posten ausgeglichen`,
    );
  };

  return (
    <div className="kform settle-form">
      <AmountInput
        label="Betrag"
        value={amount}
        onChange={setAmount}
        sign="+"
        error={errors.amount}
      />
      <p className="panel-sub" data-testid="settle-hint">
        {parsed.ok ? settleHint(items, parsed.cents) : ''}
      </p>
      <Field label="Eingegangen auf" error={errors.account}>
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            value={chosen}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Bitte wählen</option>
            {usable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Datum" error={errors.date}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            type="date"
            value={date}
            max={today}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </Field>
      <div className="panel-actions">
        <Button onClick={() => void submit()}>Ausgleich buchen</Button>
      </div>
    </div>
  );
}

/** Name and note; deleting is refused by the server while anything refers to the contact. */
function ContactData({
  contact,
  onDone,
}: {
  contact: ContactView | undefined;
  onDone: () => void;
}) {
  const write = useBudgetWrite();
  const [name, setName] = useState(contact?.name ?? '');
  const [note, setNote] = useState(contact?.note ?? '');
  const [error, setError] = useState<string | undefined>();

  const save = async () => {
    if (name.trim() === '') return setError('Bitte einen Namen eintragen.');
    setError(undefined);
    const values = { name: name.trim(), note: note.trim() === '' ? null : note.trim() };
    if (!contact) {
      if (
        await write(
          () => createContact(values),
          () => `Kontakt „${values.name}“ angelegt`,
        )
      )
        onDone();
      return;
    }
    if (values.name === contact.name && values.note === contact.note) return onDone();
    if (
      await write(
        () => patchContact(contact.id, values),
        () => `${values.name} geändert`,
      )
    )
      onDone();
  };

  return (
    <>
      <h3 className="panel-h">{contact ? 'Kontakt bearbeiten' : 'Kontakt'}</h3>
      <Field label="Name" error={error}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            value={name}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <Field label="Notiz" hint="Optional, nur für dich.">
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            value={note}
            aria-describedby={describedBy}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
      </Field>
      <div className="panel-actions">
        <Button onClick={() => void save()}>{contact ? 'Speichern' : 'Anlegen'}</Button>
        {contact && (
          <Button
            variant="ghost"
            onClick={() =>
              void write(
                () => deleteContact(contact.id),
                () => `Kontakt „${contact.name}“ gelöscht`,
              ).then((done) => done && onDone())
            }
          >
            Löschen
          </Button>
        )}
      </div>
    </>
  );
}
