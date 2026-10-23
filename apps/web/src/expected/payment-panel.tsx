import {
  useAmountPrivacy,
  AmountInput,
  Button,
  FormDialog,
  Field,
  RevisionTable,
  Select,
  TextInput,
  maskMoneyText,
} from '@budget/ui';
import { addMonths, monthOf, parseAmount, todayInVienna } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useBudgetWrite } from '../budget/use-category-writes';
import { eur, longDay, shortDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import { bookingsQuery } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import {
  addVersion,
  createPayment,
  deletePayment,
  expectedQuery,
  linkOccurrence,
  markMissed,
  paymentDetailQuery,
  patchPayment,
  skipOccurrence,
  unlinkOccurrence,
  unskipOccurrence,
  versionsQuery,
  type ExpectedPayment,
  type Occurrence,
  type PaymentDetailRow,
} from './api';
import { cadenceText, money, needsAction, versionAmount, versionLetter } from './expected-model';
import {
  changedFields,
  draftFromPayment,
  emptyDraft,
  readDraft,
  type DraftErrors,
  type DraftField,
  type PaymentDraft,
} from './payment-draft';
import { PaymentForm } from './payment-form';
import { StatusStamp } from './status-stamp';

export type PaymentPanelState =
  { mode: 'view'; id: string } | { mode: 'create'; draft?: PaymentDraft } | null;

/** Existing bodies and write paths: content is inline on its page, creation is a form dialog. */
export function PaymentPanel({
  state,
  onClose,
}: {
  state: PaymentPanelState;
  onClose: () => void;
}) {
  useAmountPrivacy();
  const payments = useQuery(expectedQuery()).data;
  const payment = state?.mode === 'view' ? payments?.find((p) => p.id === state.id) : undefined;
  if (state?.mode === 'view')
    return payment ? <ViewBody key={payment.id} payment={payment} onDone={onClose} /> : null;
  return (
    <PaymentDialog
      open={state?.mode === 'create'}
      onClose={onClose}
      title="Wiederkehrende Zahlung anlegen"
    >
      {state?.mode === 'create' && <CreateBody key="new" draft={state.draft} onDone={onClose} />}
    </PaymentDialog>
  );
}

function PaymentDialog({
  open,
  title,
  onClose,
  busy = false,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <FormDialog open={open} title={title} onClose={onClose} beforeClose={() => !busy}>
      {open && (
        <>
          <div className="bk-head">
            <h2>{title}</h2>
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              Schließen
            </Button>
          </div>
          <div className="bk-body">{children}</div>
        </>
      )}
    </FormDialog>
  );
}

function CreateBody({
  draft: initial,
  onDone,
}: {
  draft: PaymentDraft | undefined;
  onDone: () => void;
}) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const [today] = useState(todayInVienna);
  const [draft, setDraft] = useState<PaymentDraft>(initial ?? emptyDraft(today));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends DraftField>(key: K, value: PaymentDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = async () => {
    const read = readDraft(draft, true);
    setErrors(read.errors);
    if (!read.fields || !read.version) return;
    setBusy(true);
    const { fields, version } = read;
    const done = await write(
      () => createPayment(fields, version),
      () => `${fields.name}: wiederkehrende Zahlung angelegt`,
    );
    setBusy(false);
    if (done) onDone();
  };

  return (
    <form
      className="kform"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <PaymentForm draft={draft} errors={errors} creating onChange={set} />
      <div className="panel-actions">
        <Button type="submit" disabled={busy}>
          Anlegen
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function ViewBody({ payment: p, onDone }: { payment: ExpectedPayment; onDone: () => void }) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const currency = p.version?.currency ?? 'EUR';
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="kform xp-panel">
      <div>
        <div className="xp-big">
          {p.amountCents === null ? '–' : money(p.amountCents, currency, p.kind === 'inflow')}
        </div>
        <p className="panel-sub">
          {cadenceText(p)}
          {p.nextDueDate && ` · nächste Fälligkeit ${longDay(p.nextDueDate)}`}
        </p>
      </div>
      <VersionsSection payment={p} />
      <OccurrencesSection payment={p} />
      <div className="panel-actions">
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Bearbeiten
        </Button>
        <Button variant="ghost" onClick={() => setDeleting(true)}>
          Löschen
        </Button>
      </div>
      <PaymentDialog open={editing} title="Zahlung bearbeiten" onClose={() => setEditing(false)}>
        {editing && <EditSection payment={p} onDone={() => setEditing(false)} write={write} />}
      </PaymentDialog>
      <PaymentDialog
        open={deleting}
        title="Zahlung löschen"
        busy={busy}
        onClose={() => setDeleting(false)}
      >
        <p>„{p.name}“ als wiederkehrende Zahlung löschen? Bestehende Buchungen bleiben erhalten.</p>
        <div className="panel-actions">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const done = await write(
                () => deletePayment(p.id),
                () => `${p.name}: wiederkehrende Zahlung gelöscht`,
              );
              setBusy(false);
              if (done) onDone();
            }}
          >
            Löschen bestätigen
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setDeleting(false)}>
            Abbrechen
          </Button>
        </div>
      </PaymentDialog>
    </div>
  );
}

// ---------- Versionen ----------

function VersionsSection({ payment: p }: { payment: ExpectedPayment }) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const versions = useQuery(versionsQuery(p.id));
  const [today] = useState(todayInVienna);
  const [month, setMonth] = useState(addMonths(monthOf(today), 1));
  const [amount, setAmount] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const currency = p.version?.currency ?? 'EUR';
  const [editing, setEditing] = useState(false);
  const close = () => {
    setEditing(false);
    setMonth(addMonths(monthOf(today), 1));
    setAmount('');
    setAmountMax('');
    setNote('');
    setError(undefined);
  };

  const rows = (versions.data ?? []).map((v, i, all) => ({
    v,
    letter: versionLetter(i),
    last: i === all.length - 1,
  }));
  const newest = [...rows].reverse();
  const inForce = p.version?.id;

  const submit = async () => {
    const parsed = parseAmount(amount);
    const max = amountMax.trim() === '' ? null : parseAmount(amountMax);
    if (!parsed.ok || parsed.cents <= 0) return setError('Bitte einen Betrag über 0 eintragen.');
    if (max !== null && (!max.ok || max.cents < parsed.cents))
      return setError('Das Maximum muss ein Betrag über dem Betrag sein.');
    if (!/^\d{4}-\d{2}$/.test(month)) return setError('Bitte einen Monat wählen.');
    setError(undefined);
    setBusy(true);
    const done = await write(
      () =>
        addVersion(p.id, {
          validFrom: `${month}-01`,
          amountCents: parsed.cents,
          amountMaxCents: max?.ok ? max.cents : null,
          currency,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      () => `${p.name}: neue Version ab ${shortDay(`${month}-01`)}${month.slice(0, 4)}`,
    );
    setBusy(false);
    if (done) close();
  };

  return (
    <section aria-labelledby="xp-versions">
      <h3 id="xp-versions" className="panel-h">
        Versionen
      </h3>
      {versions.isPending && <LoadingNote what="Versionen" />}
      {versions.isError && (
        <ErrorNote
          what="Versionen"
          error={versions.error}
          onRetry={() => void versions.refetch()}
        />
      )}
      {versions.data && (
        <RevisionTable
          caption={`Versionen von ${p.name}, neueste zuerst`}
          headers={{ revision: 'Ver.', change: 'Gilt ab', action: 'Aktion' }}
          rows={newest.map(({ v, letter }) => ({
            id: v.id,
            letter,
            title: `${longDay(v.validFrom)} · ${versionAmount(v)}`,
            detail: [
              v.id === inForce ? 'gilt jetzt' : v.validFrom > today ? 'kommt noch' : '',
              v.note ?? '',
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
          empty="Noch keine Version."
        />
      )}
      <Button variant="ghost" onClick={() => setEditing(true)}>
        Neue Version
      </Button>
      <PaymentDialog open={editing} title="Neue Version" onClose={close} busy={busy}>
        {editing && (
          <form
            className="xp-newversion"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h4 className="xp-sub">Neue Version ab …</h4>
            <p className="field-hint">
              Ein Preis ändert sich: die alte Version bleibt, frühere Zahlungen auch.
            </p>
            <Field label="Ab Monat">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              )}
            </Field>
            <AmountInput
              label="Neuer Betrag"
              value={amount}
              onChange={setAmount}
              sign={p.kind === 'inflow' ? '+' : '−'}
            />
            <AmountInput label="bis (optional)" value={amountMax} onChange={setAmountMax} />
            <Field label="Notiz (optional)">
              {({ id }) => (
                <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />
              )}
            </Field>
            {error && (
              <p className="field-error" role="alert">
                {maskMoneyText(error)}
              </p>
            )}
            <div className="panel-actions">
              <Button type="submit" variant="ghost" disabled={busy}>
                Version speichern
              </Button>
              <Button variant="ghost" disabled={busy} onClick={close}>
                Abbrechen
              </Button>
            </div>
          </form>
        )}
      </PaymentDialog>
    </section>
  );
}

// ---------- Factual stored history and read-only future terms ----------

function detailMoney(value: number, currency: string | null) {
  return currency === null
    ? `${eur(value, { sign: true }).replace(/ €$/, '')} (Währung nicht dokumentiert)`
    : money(value, currency, true);
}

function OccurrencesSection({ payment: p }: { payment: ExpectedPayment }) {
  useAmountPrivacy();
  const [today] = useState(todayInVienna);
  const detail = useQuery(paymentDetailQuery(p.id, today));
  const [more, setMore] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const write = useBudgetWrite();
  const data = detail.data;
  const allRows = [...(data?.history ?? []), ...(data?.future ?? [])];
  const selected = allRows.find((row) => row.occurrenceId === linking && linking !== null);
  const name = p.name;
  const renderRow = (row: PaymentDetailRow) => {
    const id = row.occurrenceId;
    return (
      <li
        key={id ?? `preview:${row.dueDate}`}
        className={needsAction(row, today) ? 'is-alert' : undefined}
      >
        <span className="xp-occ-date">{longDay(row.dueDate)}</span>
        <span className="xp-occ-amt">
          <span className="xp-sub">Soll </span>
          {detailMoney(row.expectedAmountCents, row.currency)}
        </span>
        <StatusStamp status={row.status} alert={needsAction(row, today)} />
        <span className="xp-occ-actual">
          <span className="xp-sub">Ist </span>
          {row.actualComparableCents === null
            ? '–'
            : detailMoney(row.actualComparableCents, row.currency)}
        </span>
        <span className="xp-occ-delta">
          <span className="xp-sub">Abweichung </span>
          {row.deviationCents === null ? '–' : detailMoney(row.deviationCents, row.currency)}
        </span>
        <span className="xp-occ-book">
          {row.booking === null ? (
            'Keine zugeordnete Buchung.'
          ) : (
            <AppLink to="/konten/buchungen" search={{ buchung: row.booking.id }}>
              {`Buchung ${longDay(row.booking.date)} · ${money(row.booking.amountCents, row.booking.currency, true)}`}
            </AppLink>
          )}
          {row.unavailableReason === 'currency_mismatch' &&
            ' Währung nicht vergleichbar; Originalbetrag fehlt.'}
          {row.unavailableReason === 'missing_currency' &&
            ' Ursprüngliche Währung nicht dokumentiert; Abweichung nicht verfügbar.'}
          {row.unavailableReason === 'unsafe_difference' &&
            ' Abweichung außerhalb des darstellbaren Centbereichs.'}
          {row.source === 'preview' && ' Vorschau aus aktueller Regel · nicht gespeichert.'}
        </span>
        {id !== null && (
          <span className="xp-occ-act">
            {row.booking !== null ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void write(
                    () => unlinkOccurrence(id),
                    () => `${name}: Verknüpfung vom ${longDay(row.dueDate)} gelöst`,
                  )
                }
              >
                Lösen
              </Button>
            ) : row.status === 'skipped' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void write(
                    () => unskipOccurrence(id),
                    () => `${name}: ${longDay(row.dueDate)} wiederhergestellt`,
                  )
                }
              >
                Wiederherstellen
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLinking(linking === id ? null : id)}
                >
                  Verknüpfen
                </Button>
                {row.dueDate >= today && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void write(
                        () => skipOccurrence(p.id, row.dueDate),
                        () => `${name}: ${longDay(row.dueDate)} gestrichen`,
                      )
                    }
                  >
                    Streichen
                  </Button>
                )}
                {row.status !== 'missed' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void write(
                        () => markMissed(id),
                        () => `${name}: ${longDay(row.dueDate)} als ausgefallen markiert`,
                      )
                    }
                  >
                    Ausgefallen
                  </Button>
                )}
              </>
            )}
          </span>
        )}
      </li>
    );
  };
  return (
    <section aria-labelledby="xp-occ">
      <h3 id="xp-occ" className="panel-h">
        Soll gegen Ist
      </h3>
      {detail.isPending && <LoadingNote what="Fälligkeiten" />}
      {detail.isError && (
        <ErrorNote what="Fälligkeiten" error={detail.error} onRetry={() => void detail.refetch()} />
      )}
      {data && (
        <>
          <h4 className="panel-h">Letzte Fälligkeiten</h4>
          <p className="field-hint">
            {data.sparseHistory
              ? `${data.history.length} vergangene Fälligkeiten gespeichert. Ältere Termine werden nicht nachgebildet.`
              : 'Die letzten zwölf gespeicherten Fälligkeiten.'}
          </p>
          <ul className="xp-occ" aria-label={`Vergangene Fälligkeiten von ${name}`}>
            {data.history.map(renderRow)}
          </ul>
          <h4 className="panel-h">Nächste Termine</h4>
          <p className="field-hint">
            Vorschau aus aktueller Regel und gültiger Betragsversion. Gespeicherte Zuordnungen und
            Entscheidungen bleiben erhalten.
          </p>
          {data.future.length === 0 ? (
            <p className="rev-empty">Keine weiteren Termine nach aktueller Regel.</p>
          ) : (
            <ul className="xp-occ" aria-label={`Kommende Fälligkeiten von ${name}`}>
              {data.future.slice(0, more ? 12 : 3).map(renderRow)}
            </ul>
          )}
          {data.future.length > 3 && (
            <Button
              className="xp-more"
              variant="ghost"
              aria-expanded={more}
              onClick={() => setMore(!more)}
            >
              {more ? 'Weniger Termine' : 'Weitere Termine'}
            </Button>
          )}
          {more && data.hasFurtherFuture && (
            <p className="field-hint">Die Vorschau ist auf zwölf kommende Termine begrenzt.</p>
          )}
          {allRows.some((row) => row.occurrenceId !== null) && (
            <p className="field-hint">
              Streichen nimmt nur diese gespeicherte Fälligkeit aus der Planung, die Regel bleibt.
              Ausgefallen meldet eine Zahlung, die nicht eingegangen ist. Vorschauen sind
              schreibgeschützt.
            </p>
          )}
        </>
      )}
      <PaymentDialog
        open={selected !== undefined}
        title="Buchung verknüpfen"
        onClose={() => setLinking(null)}
      >
        {selected?.occurrenceId && (
          <LinkPicker
            occurrence={{
              occurrenceId: selected.occurrenceId,
              dueDate: selected.dueDate,
              kind: p.kind,
              name,
            }}
            accountId={p.accountId}
            onDone={() => setLinking(null)}
          />
        )}
      </PaymentDialog>
    </section>
  );
}

/** Pick one booking near the due date to link to the occurrence. */
function LinkPicker({
  occurrence: o,
  accountId,
  onDone,
}: {
  occurrence: Pick<Occurrence, 'occurrenceId' | 'dueDate' | 'kind' | 'name'>;
  accountId: string | null;
  onDone: () => void;
}) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const [choice, setChoice] = useState('');
  const day = (n: number) => {
    const d = new Date(`${o.dueDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const bookings = useQuery(
    bookingsQuery(
      {
        ...(accountId ? { accountId } : {}),
        from: day(-21),
        to: day(21),
        sort: 'date',
        direction: 'asc',
      },
      undefined,
      100,
    ),
  );
  const items = (bookings.data?.items ?? []).filter((b) =>
    o.kind === 'inflow' ? b.amountCents > 0 : b.amountCents < 0,
  );
  return (
    <div className="xp-link">
      {bookings.isPending && <LoadingNote what="Buchungen" />}
      {bookings.isError && (
        <ErrorNote
          what="Buchungen"
          error={bookings.error}
          onRetry={() => void bookings.refetch()}
        />
      )}
      {bookings.data && items.length === 0 && (
        <p className="field-hint">Keine passende Buchung rund um den {longDay(o.dueDate)}.</p>
      )}
      {items.length > 0 && (
        <Field label="Buchung">
          {({ id }) => (
            <Select id={id} value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Buchung wählen</option>
              {items.map((b) => (
                <option key={b.id} value={b.id}>
                  {`${longDay(b.date)} · ${b.payeeName ?? b.memo ?? b.accountName} · ${eur(b.amountCents)}`}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <div className="panel-actions">
        <Button
          size="sm"
          disabled={!choice}
          onClick={async () => {
            const done = await write(
              () => linkOccurrence(o.occurrenceId, choice),
              () => `${o.name}: Buchung mit dem ${longDay(o.dueDate)} verknüpft`,
            );
            if (done) onDone();
          }}
        >
          Verknüpfen
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

// ---------- Felder ----------

function EditSection({
  payment: p,
  onDone,
  write,
}: {
  payment: ExpectedPayment;
  onDone: () => void;
  write: ReturnType<typeof useBudgetWrite>;
}) {
  useAmountPrivacy();
  const [draft, setDraft] = useState<PaymentDraft>(() => draftFromPayment(p));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends DraftField>(key: K, value: PaymentDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    const read = readDraft(draft, false);
    setErrors(read.errors);
    if (!read.fields) return;
    const patch = changedFields(p, read.fields);
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    const done = await write(
      () => patchPayment(p.id, patch),
      () => `${read.fields?.name ?? p.name}: gespeichert`,
    );
    setBusy(false);
    if (done) onDone();
  };

  return (
    <section aria-labelledby="xp-fields">
      <h3 id="xp-fields" className="panel-h">
        Angaben
      </h3>
      <form
        className="kform"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <PaymentForm draft={draft} errors={errors} creating={false} onChange={set} />
        <div className="panel-actions">
          <Button type="submit" disabled={busy}>
            Speichern
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onDone}>
            Abbrechen
          </Button>
        </div>
      </form>
    </section>
  );
}
