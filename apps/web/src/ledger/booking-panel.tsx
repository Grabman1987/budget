import { todayInVienna } from '@budget/domain';
import {
  AmountInput,
  Button,
  DetailPanel,
  Field,
  Segmented,
  Select,
  TextInput,
  type SegmentedOption,
} from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { ApiError } from '../api/http';
import { createPayee } from './api';
import {
  buildCreate,
  buildPatch,
  draftFromBooking,
  emptyDraft,
  newSplit,
  splitRemainder,
  touchesLocked,
  type BookingDraft,
  type BookingKind,
  type DraftErrors,
} from './booking-model';
import { eur } from './format';
import { errorText, FLAG_LABEL } from './labels';
import { useLedgerWrites } from './mutations';
import { accountsQuery, lookupsQuery, payeesQuery } from './queries';
import { BOOKING_FLAGS, type AccountRow, type ListedBooking } from './types';

export type BookingPanelState =
  | { mode: 'create'; accountId?: string | undefined }
  | { mode: 'edit'; booking: ListedBooking }
  | null;

const KINDS: ReadonlyArray<SegmentedOption<BookingKind>> = [
  { value: 'expense', label: 'Ausgabe' },
  { value: 'income', label: 'Einnahme' },
  { value: 'transfer', label: 'Umbuchung' },
];
const EDIT_KINDS = KINDS.slice(0, 2);

/** Buchung erfassen / bearbeiten in the side panel (desktop) or bottom sheet (phone). */
export function BookingPanel({
  state,
  onClose,
}: {
  state: BookingPanelState;
  onClose: () => void;
}) {
  const title = state?.mode === 'edit' ? 'Buchung bearbeiten' : 'Buchung erfassen';
  return (
    <DetailPanel open={state !== null} onClose={onClose} title={title}>
      {state && (
        <BookingForm
          key={state.mode === 'edit' ? state.booking.id : 'new'}
          state={state}
          onDone={onClose}
        />
      )}
    </DetailPanel>
  );
}

function BookingForm({
  state,
  onDone,
}: {
  state: NonNullable<BookingPanelState>;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const accounts = useQuery(accountsQuery());
  const lookups = useQuery(lookupsQuery());
  const payees = useQuery(payeesQuery());
  const writes = useLedgerWrites();
  const listId = useId();

  const open: AccountRow[] = (accounts.data?.accounts ?? []).filter((a) => !a.closedAt);
  const editing = state.mode === 'edit' ? state.booking : null;
  const [draft, setDraft] = useState<BookingDraft>(() =>
    editing
      ? draftFromBooking(editing)
      : emptyDraft(state.mode === 'create' ? (state.accountId ?? '') : '', todayInVienna()),
  );
  const [errors, setErrors] = useState<DraftErrors & { form?: string }>({});
  const [unlock, setUnlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Without a preselected account the first open one is used (state before accounts arrived).
  const accountId = draft.accountId || open[0]?.id || '';
  const isTransfer = draft.kind === 'transfer';
  const legOfTransfer = editing?.transferId != null;
  const locked = editing?.status === 'reconciled';
  const from = open.find((a) => a.id === accountId);
  const to = open.find((a) => a.id === draft.toAccountId);
  // A transfer between a budget and a tracking account is categorised (SPEC §5.3).
  const needsCategory = isTransfer && from && to && from.onBudget !== to.onBudget;
  const remainder = splitRemainder(draft.amount, draft.splits);

  const resolvePayee = async (): Promise<string | null> => {
    const name = draft.payee.trim();
    if (name === '') return null;
    const known = payees.data?.payees.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (known) return known.id;
    const created = await createPayee(name);
    void qc.invalidateQueries({ queryKey: payeesQuery().queryKey });
    return created.payee.id;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const filled = { ...draft, accountId };
    setBusy(true);
    try {
      const payeeId = isTransfer ? null : await resolvePayee();
      if (editing) {
        const built = buildPatch(editing, filled, payeeId, unlock);
        if (!built.ok) return setErrors(built.errors);
        if (locked && !unlock && touchesLocked(built.value)) {
          return setErrors({
            form: 'Diese Buchung ist geprüft. Bestätige die Freigabe, um sie zu ändern.',
          });
        }
        if (Object.keys(built.value).length > 0) {
          await writes.patch.mutateAsync({ id: editing.id, patch: built.value });
        }
      } else {
        const built = buildCreate(filled, payeeId);
        if (!built.ok) return setErrors(built.errors);
        await writes.create.mutateAsync(built.value);
      }
      onDone();
    } catch (error) {
      setErrors({
        form:
          error instanceof ApiError && error.code === 'reconciled_locked'
            ? 'Diese Buchung ist geprüft. Bestätige die Freigabe, um sie zu ändern.'
            : errorText(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    if (locked && !unlock) {
      return setErrors({ form: 'Diese Buchung ist geprüft. Bestätige die Freigabe zum Löschen.' });
    }
    setBusy(true);
    try {
      await writes.remove.mutateAsync({ id: editing.id, unlock });
      onDone();
    } catch (error) {
      setErrors({ form: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const startSplit = () =>
    setDraft((d) => ({
      ...d,
      splitOn: true,
      splits: [newSplit({ categoryId: d.categoryId, amount: d.amount }), newSplit()],
    }));
  const changeSplit = (key: string, patch: Partial<BookingDraft['splits'][number]>) =>
    setDraft((d) => ({
      ...d,
      splits: d.splits.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    }));

  const categoryOptions = (
    <>
      <option value="">ohne Kategorie</option>
      {(lookups.data?.groups ?? []).map((g) => (
        <optgroup key={g.id} label={g.name}>
          {lookups.data?.categories
            .filter((c) => c.groupId === g.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
      {lookups.data?.categories
        .filter((c) => !c.groupId)
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
    </>
  );
  const accountOptions = open.map((a) => (
    <option key={a.id} value={a.id}>
      {a.name}
    </option>
  ));

  return (
    <form className="kform" onSubmit={(e) => void submit(e)} noValidate>
      {!legOfTransfer && (
        <Segmented
          label="Art der Buchung"
          options={editing ? EDIT_KINDS : KINDS}
          value={draft.kind}
          onChange={(kind) => set('kind', kind)}
          stretch
        />
      )}
      {locked && (
        <div className="kdiff is-ok" role="note">
          <span>
            Diese Buchung ist <strong>geprüft</strong>. Nur Markierung und Notiz sind frei; alles
            andere braucht deine Freigabe.
          </span>
          <label className="kcheck">
            <input type="checkbox" checked={unlock} onChange={(e) => setUnlock(e.target.checked)} />
            Trotzdem ändern
          </label>
        </div>
      )}
      <Field label={isTransfer ? 'Von Konto' : 'Konto'} error={errors.account}>
        {({ id, describedBy, invalid }) => (
          <Select
            id={id}
            value={accountId}
            disabled={legOfTransfer}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(e) => set('accountId', e.target.value)}
          >
            {accountOptions}
          </Select>
        )}
      </Field>
      {isTransfer && (
        <Field label="Nach Konto" error={errors.toAccount}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              value={draft.toAccountId}
              disabled={legOfTransfer}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(e) => set('toAccountId', e.target.value)}
            >
              <option value="">Konto wählen</option>
              {accountOptions}
            </Select>
          )}
        </Field>
      )}
      <Field label="Datum" error={errors.date}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            type="date"
            value={draft.date}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(e) => set('date', e.target.value)}
          />
        )}
      </Field>
      <AmountInput
        label="Betrag"
        value={draft.amount}
        onChange={(v) => set('amount', v)}
        sign={isTransfer ? null : draft.kind === 'income' ? '+' : '−'}
        error={errors.amount}
      />
      {!isTransfer && (
        <Field label="Empfänger">
          {({ id }) => (
            <>
              <TextInput
                id={id}
                list={listId}
                value={draft.payee}
                autoComplete="off"
                onChange={(e) => set('payee', e.target.value)}
              />
              <datalist id={listId}>
                {(payees.data?.payees ?? []).map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </>
          )}
        </Field>
      )}
      {!isTransfer && draft.splitOn ? (
        <fieldset className="ksplits">
          <legend className="tech">Aufteilung</legend>
          {draft.splits.map((s, index) => (
            <div className="ksplit" key={s.key}>
              <Field label={`Kategorie ${index + 1}`}>
                {({ id }) => (
                  <Select
                    id={id}
                    value={s.categoryId}
                    onChange={(e) => changeSplit(s.key, { categoryId: e.target.value })}
                  >
                    {categoryOptions}
                  </Select>
                )}
              </Field>
              <AmountInput
                label={`Betrag ${index + 1}`}
                value={s.amount}
                onChange={(v) => changeSplit(s.key, { amount: v })}
              />
              {draft.splits.length > 2 && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Zeile ${index + 1} entfernen`}
                  onClick={() =>
                    setDraft((d) => ({ ...d, splits: d.splits.filter((x) => x.key !== s.key) }))
                  }
                >
                  <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                </Button>
              )}
            </div>
          ))}
          <p className={remainder === 0 ? 'kdiff is-ok' : 'kdiff is-bad'} aria-live="polite">
            {remainder === 0 ? 'Aufteilung geht auf.' : `Rest: ${eur(remainder)}`}
          </p>
          {errors.splits && (
            <p className="field-error" role="alert">
              {errors.splits}
            </p>
          )}
          <div className="panel-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft((d) => ({ ...d, splits: [...d.splits, newSplit()] }))}
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              Zeile hinzufügen
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft((d) => ({ ...d, splitOn: false, splits: [] }))}
            >
              Nicht aufteilen
            </Button>
          </div>
        </fieldset>
      ) : (
        (!isTransfer || needsCategory) && (
          <>
            <Field label="Kategorie">
              {({ id }) => (
                <Select
                  id={id}
                  value={draft.categoryId}
                  onChange={(e) => set('categoryId', e.target.value)}
                >
                  {categoryOptions}
                </Select>
              )}
            </Field>
            {!isTransfer && (
              <Button variant="ghost" size="sm" onClick={startSplit}>
                Aufteilen
              </Button>
            )}
          </>
        )
      )}
      <Field label="Notiz">
        {({ id }) => (
          <TextInput
            id={id}
            value={draft.memo}
            autoComplete="off"
            onChange={(e) => set('memo', e.target.value)}
          />
        )}
      </Field>
      <Field label="Status">
        {({ id }) => (
          <Select
            id={id}
            value={draft.status}
            onChange={(e) => set('status', e.target.value as BookingDraft['status'])}
          >
            <option value="confirmed">bestätigt</option>
            <option value="pending">vorgemerkt</option>
          </Select>
        )}
      </Field>
      {!isTransfer && (
        <Field label="Markierung">
          {({ id }) => (
            <Select
              id={id}
              value={draft.flag}
              onChange={(e) => set('flag', e.target.value as BookingDraft['flag'])}
            >
              <option value="">keine</option>
              {BOOKING_FLAGS.map((f) => (
                <option key={f} value={f}>
                  {FLAG_LABEL[f]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {errors.form && (
        <p className="field-error" role="alert">
          {errors.form}
        </p>
      )}
      <div className="panel-actions">
        <Button type="submit" disabled={busy}>
          Speichern
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
        {editing && (
          <Button variant="ghost" onClick={() => void remove()} disabled={busy}>
            <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
            Löschen
          </Button>
        )}
      </div>
    </form>
  );
}
