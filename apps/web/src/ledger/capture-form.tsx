import { addDays, todayInVienna } from '@budget/domain';
import {
  AmountInput,
  Button,
  ClassSwatch,
  Field,
  Segmented,
  Select,
  TextInput,
  type SegmentedOption,
} from '@budget/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
} from 'react';
import { ApiError } from '../api/http';
import { budgetQuery } from '../budget/budget-api';
import { BUDGET_KEY } from '../budget/use-category-writes';
import { createPayee, ensureAdvanceCategory, setPayeeDefaultCategory } from './api';
import {
  buildCreate,
  buildPatch,
  draftFromBooking,
  emptyDraft,
  needsAdvanceCategory,
  newSplit,
  splitRemainder,
  touchesLocked,
  type BookingDraft,
  type BookingKind,
  type Built,
  type DraftErrors,
  type Failed,
} from './booking-model';
import type { BookingPanelState } from './booking-panel';
import {
  categoriesFor,
  defaultAccountId,
  orderAccounts,
  pickableCategories,
  quickDays,
  readMemory,
  remember,
} from './capture-model';
import { Combobox, type ComboOption } from './combobox';
import { SplitEditor } from './split-editor';
import { eur, monthName } from './format';
import { errorText, FLAG_LABEL } from './labels';
import { useLedgerWrites } from './mutations';
import { accountsQuery, lookupsQuery, payeesQuery } from './queries';
import { BOOKING_FLAGS } from './types';

const KINDS: ReadonlyArray<SegmentedOption<BookingKind>> = [
  { value: 'expense', label: 'Ausgabe' },
  { value: 'income', label: 'Einnahme' },
  { value: 'transfer', label: 'Umbuchung' },
];
const EDIT_KINDS = KINDS.slice(0, 2);
const NONE = '__none';
/** Stand-in for the Auslagen category while it does not exist yet (replaced before saving). */
const PENDING = '__pending-advance';
const LOCKED = 'Diese Buchung ist geprüft. Bestätige die Freigabe, um sie zu ändern.';

/** Focusable fields in reading order; the operator buttons of the amount field are skipped. */
function fields(form: HTMLFormElement): HTMLElement[] {
  return Array.from(
    form.querySelectorAll<HTMLElement>('input, select, textarea, button[type="submit"]'),
  ).filter(
    (el) =>
      !el.closest('.amount-ops') &&
      !(el as HTMLInputElement).disabled &&
      (el as HTMLInputElement).type !== 'checkbox' &&
      el.offsetParent !== null,
  );
}

export interface DiscardAsk {
  asking: boolean;
  keep: () => void;
  discard: () => void;
}

/**
 * The capture form (Buchung erfassen / bearbeiten): keyboard first. Enter moves to the next field,
 * Ctrl+Enter saves, Ctrl+Umschalt+Enter saves and starts the next booking with account, date and
 * payee kept. Esc is handled by the dialog around it (with a discard question when dirty).
 */
export function CaptureForm({
  state,
  onDone,
  dirtyRef,
  discard,
  requestClose,
}: {
  state: NonNullable<BookingPanelState>;
  onDone: () => void;
  /** Tells the dialog whether closing would lose input. */
  dirtyRef: MutableRefObject<boolean>;
  discard: DiscardAsk;
  requestClose: () => void;
}) {
  const qc = useQueryClient();
  const accounts = useQuery(accountsQuery());
  const lookups = useQuery(lookupsQuery());
  const payees = useQuery(payeesQuery());
  const writes = useLedgerWrites();
  const formRef = useRef<HTMLFormElement>(null);

  const [today] = useState(todayInVienna);
  const [memory] = useState(readMemory);
  const editing = state.mode === 'edit' ? state.booking : null;
  const [draft, setDraft] = useState<BookingDraft>(() =>
    editing
      ? draftFromBooking(editing)
      : emptyDraft(state.mode === 'create' ? (state.accountId ?? '') : '', today),
  );
  const [errors, setErrors] = useState<DraftErrors & { form?: string }>({});
  const [unlock, setUnlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(Boolean(editing));
  // A category the user picked is never replaced by the payee's default.
  const categoryTouched = useRef(Boolean(editing));
  const [typing, setTyping] = useState<string | null>(null);
  const set = <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const open = useMemo(
    () => orderAccounts(accounts.data?.accounts ?? [], memory.accounts),
    [accounts.data, memory],
  );
  const accountId =
    draft.accountId || defaultAccountId(accounts.data?.accounts ?? [], memory.accounts);
  const isTransfer = draft.kind === 'transfer';
  const legOfTransfer = editing?.transferId != null;
  const locked = editing?.status === 'reconciled';
  const from = open.find((a) => a.id === accountId);
  const to = open.find((a) => a.id === draft.toAccountId);
  const needsCategory = Boolean(isTransfer && from && to && from.onBudget !== to.onBudget);
  const remainder = splitRemainder(draft.amount, draft.splits);

  // The budget of the booking's month gives the categories by stage and their Available.
  const month = /^\d{4}-\d{2}-\d{2}$/.test(draft.date) ? draft.date.slice(0, 7) : today.slice(0, 7);
  const budget = useQuery(budgetQuery(month));
  const all = useMemo(
    () => pickableCategories(budget.data, lookups.data),
    [budget.data, lookups.data],
  );
  const pickable = useMemo(
    () => categoriesFor(all, draft.kind, draft.categoryId),
    [all, draft.kind, draft.categoryId],
  );
  const selected = all.find((c) => c.id === draft.categoryId);
  const payeeDefault = (() => {
    const name = draft.payee.trim().toLowerCase();
    const row = payees.data?.payees.find((p) => p.name.toLowerCase() === name);
    return row?.defaultCategoryId ?? null;
  })();

  // Contact shares (Auslage / Rückzahlung) run through the Auslagen category.
  const advanceCategoryId =
    budget.data?.categories.find((c) => c.kind === 'advance' && !c.hiddenAt)?.id ??
    lookups.data?.categories.find((c) => c.kind === 'advance')?.id;
  const contacts = lookups.data?.contacts ?? [];
  const splitLocked = Boolean(editing?.splits.some((x) => x.transferId));
  const blocked = draft.splitOn && remainder !== 0;
  const startSplit = () =>
    setDraft((d) => ({
      ...d,
      splitOn: true,
      contactId: '',
      splits: [
        newSplit({
          type: d.contactId ? 'contact' : 'category',
          contactId: d.contactId || null,
          categoryId: d.contactId ? '' : d.categoryId,
          amount: d.amount,
        }),
        newSplit(),
      ],
    }));

  const dirty = editing
    ? JSON.stringify(strip(draft)) !== JSON.stringify(strip(draftFromBooking(editing)))
    : Boolean(draft.amount.trim() || draft.payee.trim() || draft.memo.trim() || draft.splitOn);
  // The panel opens to record money: the amount is the first thing typed. The dialog moves the
  // focus itself when it opens, so this runs after it.
  useEffect(() => {
    if (editing) return;
    const frame = requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>('.amount-input')?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty, dirtyRef]);

  const applyPayee = (name: string) => {
    const key = name.trim().toLowerCase();
    const row = payees.data?.payees.find((p) => p.name.toLowerCase() === key);
    setDraft((d) => {
      const next = { ...d, payee: name };
      const fallback = row?.defaultCategoryId;
      if (
        !categoryTouched.current &&
        !d.splitOn &&
        d.kind !== 'transfer' &&
        fallback &&
        categoriesFor(all, d.kind, '').some((c) => c.id === fallback)
      ) {
        next.categoryId = fallback;
      }
      return next;
    });
  };

  const changeKind = (kind: BookingKind) =>
    setDraft((d) => {
      categoryTouched.current = false;
      const valid = kind !== 'expense' || all.find((c) => c.id === d.categoryId)?.kind !== 'income';
      return {
        ...d,
        kind,
        categoryId: kind === 'transfer' || !valid ? '' : d.categoryId,
        incomeTypeId: kind === 'income' ? d.incomeTypeId : '',
        contactId: kind === 'transfer' ? '' : d.contactId,
        splitOn: kind === 'transfer' ? false : d.splitOn,
      };
    });

  /** Payee id from the typed name; a new payee is created with the chosen category as its default. */
  const resolvePayee = async (): Promise<string | null> => {
    const name = draft.payee.trim();
    if (name === '' || isTransfer) return null;
    const single = !draft.splitOn && draft.categoryId ? draft.categoryId : null;
    const known = payees.data?.payees.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (known) {
      if (single && !known.defaultCategoryId && draft.kind === 'expense') {
        void setPayeeDefaultCategory(known.id, single).then(() =>
          qc.invalidateQueries({ queryKey: payeesQuery().queryKey }),
        );
      }
      return known.id;
    }
    const created = await createPayee(name, draft.kind === 'expense' ? single : null);
    void qc.invalidateQueries({ queryKey: payeesQuery().queryKey });
    return created.payee.id;
  };

  const save = async (andNew: boolean) => {
    if (blocked) return setErrors({ splits: 'Speichern geht erst, wenn der Rest 0,00 € ist.' });
    const filled = { ...draft, accountId };
    setBusy(true);
    try {
      const payeeId = await resolvePayee();
      // The first contact share creates "Auslagen". Validate with a stand-in id first, so an
      // incomplete booking does not leave an envelope behind.
      const provisional = advanceCategoryId ?? (needsAdvanceCategory(filled) ? PENDING : undefined);
      const settle = async <T,>(
        build: (advance: string | undefined) => Built<T> | Failed,
        beforeCreating?: (value: T) => string | undefined,
      ): Promise<T | undefined> => {
        let built = build(provisional);
        if (!built.ok) return void setErrors(built.errors);
        const blockedBy = beforeCreating?.(built.value);
        if (blockedBy) return void setErrors({ form: blockedBy });
        if (provisional === PENDING) {
          const { category } = await ensureAdvanceCategory();
          void qc.invalidateQueries({ queryKey: BUDGET_KEY });
          void qc.invalidateQueries({ queryKey: lookupsQuery().queryKey });
          built = build(category.id);
          if (!built.ok) return void setErrors(built.errors);
        }
        return built.value;
      };
      if (editing) {
        const patch = await settle(
          (advance) => buildPatch(editing, filled, payeeId, unlock, { advanceCategoryId: advance }),
          (value) => (locked && !unlock && touchesLocked(value) ? LOCKED : undefined),
        );
        if (!patch) return;
        if (Object.keys(patch).length > 0)
          await writes.patch.mutateAsync({ id: editing.id, patch });
        return onDone();
      }
      const created = await settle((advance) =>
        buildCreate(filled, payeeId, {
          requireCategory: true,
          transferNeedsCategory: needsCategory,
          advanceCategoryId: advance,
        }),
      );
      if (!created) return;
      await writes.create.mutateAsync(created);
      remember(accountId, draft.categoryId || null);
      if (!andNew) return onDone();
      // The next booking keeps the context (kind, account, date, payee and its category).
      setDraft((d) => ({
        ...emptyDraft(accountId, d.date),
        kind: d.kind,
        toAccountId: d.toAccountId,
        payee: d.payee,
        categoryId: d.splitOn ? '' : d.categoryId,
        incomeTypeId: d.incomeTypeId,
        projectId: d.projectId,
      }));
      setErrors({});
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>('.amount-input')?.focus(),
      );
    } catch (error) {
      setErrors({
        form:
          error instanceof ApiError && error.code === 'reconciled_locked'
            ? LOCKED
            : errorText(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    if (locked && !unlock)
      return setErrors({ form: 'Diese Buchung ist geprüft. Bestätige die Freigabe zum Löschen.' });
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

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || e.altKey) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      void save(e.shiftKey && !editing);
      return;
    }
    const target = e.target as HTMLElement;
    const form = formRef.current;
    if (!form || e.shiftKey || !(target instanceof HTMLInputElement)) return;
    if (['checkbox', 'radio', 'button', 'submit'].includes(target.type)) return;
    e.preventDefault();
    const list = fields(form);
    const next = list[list.indexOf(target) + 1];
    next?.focus();
    if (next instanceof HTMLInputElement && next.type !== 'date') next.select();
  };

  const categoryOptions: ComboOption[] = useMemo(() => {
    const zu: ComboOption[] =
      draft.kind === 'income'
        ? [{ id: NONE, label: 'Zu verteilen', hint: 'noch keiner Kategorie zugewiesen' }]
        : [];
    return [
      ...zu,
      ...pickable.map((c) => ({
        id: c.id,
        label: c.name,
        group: c.group,
        hint: c.availableCents === null ? undefined : `Verfügbar ${eur(c.availableCents)}`,
      })),
    ];
  }, [pickable, draft.kind]);
  const categoryName =
    selected?.name ?? (draft.kind === 'income' && draft.categoryId === '' ? 'Zu verteilen' : '');
  const chips = [...new Set([...(payeeDefault ? [payeeDefault] : []), ...memory.categories])]
    .map((id) => pickable.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c) && c?.id !== draft.categoryId)
    .slice(0, 4);
  const amountAbs =
    Math.abs(parseFloat(draft.amount.replace(/\./g, '').replace(',', '.')) * 100) || 0;

  const pickCategory = (id: string) => {
    categoryTouched.current = true;
    set('categoryId', id === NONE ? '' : id);
    setTyping(null);
  };

  const accountOptions = open.map((a) => (
    <option key={a.id} value={a.id}>
      {a.name}
    </option>
  ));
  const showCategory = (!isTransfer || needsCategory) && !draft.contactId;

  return (
    // Keyboard flow (Enter, Ctrl+Enter) is handled once for all fields of the form.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      ref={formRef}
      className="kform"
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      onKeyDown={onKeyDown}
      noValidate
    >
      {discard.asking && (
        <div className="kdiff is-bad" role="alertdialog" aria-label="Eingaben verwerfen?">
          <span>Eingaben verwerfen?</span>
          <Button size="sm" variant="ghost" onClick={discard.keep}>
            Weiter bearbeiten
          </Button>
          <Button size="sm" onClick={discard.discard}>
            Verwerfen
          </Button>
        </div>
      )}
      {!legOfTransfer && (
        <Segmented
          label="Art der Buchung"
          options={editing ? EDIT_KINDS : KINDS}
          value={draft.kind}
          onChange={changeKind}
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
      <AmountInput
        label="Betrag"
        value={draft.amount}
        onChange={(v) => set('amount', v)}
        sign={isTransfer ? null : draft.kind === 'income' ? '+' : '−'}
        error={errors.amount}
      />
      {!isTransfer && (
        <Combobox
          label={draft.kind === 'income' ? 'Von (Zahler)' : 'Empfänger'}
          value={draft.payee}
          placeholder="Suchen oder neu anlegen"
          onChange={applyPayee}
          onSelect={(o) => applyPayee(o.label)}
          options={(payees.data?.payees ?? [])
            .filter((p) => !p.systemKind)
            .sort((a, b) => (b.lastBookingDate ?? '').localeCompare(a.lastBookingDate ?? ''))
            .map((p) => ({
              id: p.id,
              label: p.name,
              hint: all.find((c) => c.id === p.defaultCategoryId)?.name,
            }))}
        />
      )}
      {showCategory && !draft.splitOn && (
        <div className="kcatfield">
          <Combobox
            label="Kategorie"
            value={typing ?? categoryName}
            filter={typing ?? ''}
            placeholder="Kategorie suchen"
            error={errors.category}
            listWhenEmpty
            emptyText="Keine Kategorie gefunden."
            options={categoryOptions}
            onChange={setTyping}
            onFocusChange={(focused) => !focused && setTyping(null)}
            onSelect={(o) => pickCategory(o.id)}
          />
          {selected && selected.availableCents !== null && (
            <p className="kavail" aria-live="polite">
              Verfügbar im {monthName(draft.date)}: <strong>{eur(selected.availableCents)}</strong>
              {draft.kind === 'expense' && amountAbs > 0 && (
                <> · danach {eur(selected.availableCents - amountAbs)}</>
              )}
            </p>
          )}
          {chips.length > 0 && (
            <div className="kchips" role="group" aria-label="Vorschläge">
              {chips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="chip"
                  onClick={() => pickCategory(c.id)}
                >
                  {c.cls && <ClassSwatch kind={c.cls} />}
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {draft.kind === 'income' && (
        <Field label="Einnahmeart">
          {({ id }) => (
            <Select
              id={id}
              value={draft.incomeTypeId}
              onChange={(e) => set('incomeTypeId', e.target.value)}
            >
              <option value="">keine Angabe</option>
              {(lookups.data?.incomeTypes ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {!isTransfer && !draft.splitOn && (contacts.length > 0 || draft.contactId !== '') && (
        <Field
          label={draft.kind === 'income' ? 'Rückzahlung von Kontakt' : 'Auslage für Kontakt'}
          error={errors.contact}
          hint={
            draft.contactId
              ? advanceCategoryId
                ? 'Läuft über Auslagen, eine eigene Kategorie ist nicht nötig.'
                : 'Läuft über „Auslagen“. Die Kategorie wird beim Speichern angelegt.'
              : undefined
          }
        >
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              value={draft.contactId}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(e) => set('contactId', e.target.value)}
            >
              <option value="">keiner</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {!isTransfer && !draft.splitOn && (
        <Button variant="ghost" size="sm" onClick={startSplit}>
          Aufteilen
        </Button>
      )}
      {!isTransfer && draft.splitOn && (
        <SplitEditor
          draft={draft}
          setDraft={setDraft}
          categories={pickable}
          accounts={open}
          accountId={accountId}
          contacts={lookups.data?.contacts ?? []}
          hasAdvanceCategory={Boolean(advanceCategoryId)}
          locked={splitLocked}
          error={errors.splits}
        />
      )}
      <div className="kform-pair">
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
        {isTransfer ? (
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
                <optgroup label="Budget-Konten">
                  {open
                    .filter((a) => a.id !== accountId && a.onBudget)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Tracking-Konten">
                  {open
                    .filter((a) => a.id !== accountId && !a.onBudget)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </optgroup>
              </Select>
            )}
          </Field>
        ) : (
          <DateField draft={draft} set={set} error={errors.date} />
        )}
      </div>
      {isTransfer && <DateField draft={draft} set={set} error={errors.date} />}
      <DateChips date={draft.date} today={today} onPick={(day) => set('date', day)} />
      <Field label="Notiz">
        {({ id }) => (
          <TextInput
            id={id}
            value={draft.memo}
            placeholder="Optional"
            autoComplete="off"
            onChange={(e) => set('memo', e.target.value)}
          />
        )}
      </Field>
      <details
        className="kmore"
        open={moreOpen}
        onToggle={(e) => setMoreOpen(e.currentTarget.open)}
      >
        <summary>Mehr</summary>
        <div className="kform">
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
          {(lookups.data?.projects.length ?? 0) > 0 && (
            <Field label="Projekt">
              {({ id }) => (
                <Select
                  id={id}
                  value={draft.projectId}
                  onChange={(e) => set('projectId', e.target.value)}
                >
                  <option value="">kein Projekt</option>
                  {(lookups.data?.projects ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
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
        </div>
      </details>
      {errors.form && (
        <p className="field-error" role="alert">
          {errors.form}
        </p>
      )}
      <div className="panel-actions">
        {!editing && (
          <Button variant="ghost" disabled={busy || blocked} onClick={() => void save(true)}>
            Speichern und neu
          </Button>
        )}
        <Button type="submit" disabled={busy || blocked}>
          Speichern
        </Button>
        {editing && (
          <>
            <Button variant="ghost" onClick={requestClose}>
              Abbrechen
            </Button>
            <Button variant="ghost" onClick={() => void remove()} disabled={busy}>
              <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
              Löschen
            </Button>
          </>
        )}
      </div>
      <p className="khint" aria-hidden="true">
        Enter weiter · Strg Enter speichert · Strg Umschalt Enter speichert und beginnt neu · Esc
        schließt
      </p>
    </form>
  );
}

/** Date with quick picks for the last days; the day decides which month's Available is shown. */
function DateField({
  draft,
  set,
  error,
}: {
  draft: BookingDraft;
  set: <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) => void;
  error: string | undefined;
}) {
  return (
    <div className="kdate">
      <Field label="Datum" error={error}>
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
    </div>
  );
}

/** Quick picks for the last days, under the account and date row. */
function DateChips({
  date,
  today,
  onPick,
}: {
  date: string;
  today: string;
  onPick: (day: string) => void;
}) {
  return (
    <div className="kchips" role="group" aria-label="Schnellwahl">
      {quickDays(today, addDays).map(([label, day]) => (
        <button
          key={label}
          type="button"
          className="chip"
          aria-pressed={date === day}
          onClick={() => onPick(day)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** A draft without the generated split keys: two drafts are the same when nothing was typed. */
function strip(draft: BookingDraft) {
  return { ...draft, splits: draft.splits.map((s) => ({ ...s, key: '' })) };
}
