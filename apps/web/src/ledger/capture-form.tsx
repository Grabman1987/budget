import './ledger-batch.css';
import '../nav/disclosure-icons.css';
import { BookingAssignmentReview } from '../assignment/review';
import {
  useAmountPrivacy,
  AmountInput,
  Button,
  Field,
  Segmented,
  Select,
  TextInput,
  type SegmentedOption,
  maskMoneyText,
} from '@budget/ui';
import { manualTransferStatus, todayInVienna, type ManualBankStatus } from '@budget/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronDown, Trash2, X } from 'lucide-react';
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
import { fetchBookings, createPayee, setPayeeDefaultCategory, readBookingDeletePreview, type BookingDeletePreview } from './api';
import { BookingDeletePreviewPanel } from './booking-delete-preview';
import {
  buildCreate,
  buildPatch,
  draftFromBooking,
  emptyDraft,
  isTransferBooking,
  touchesLocked,
  type BookingDraft,
  type BookingKind,
  type DraftErrors,
} from './booking-model';
import type { BookingPanelState } from './booking-panel';
import {
  accountFromPayee,
  captureDirty,
  captureDate,
  categoriesFor,
  categoryFromPayee,
  orderAccounts,
  pickableCategories,
  readMemory,
  remember,
} from './capture-model';
import { CategoryCombobox } from './category-picker';
import { Combobox } from './combobox';
import { FlagPicker } from './flag-picker';
import { SplitEditor, captureLines } from './split-editor';
import { AccountOptions } from './account-options';

import { ReceiptSection } from '../receipts/receipt-section';
import { CAPTURE_SHORTCUT_HINT, FLAG_LABEL, errorText } from './labels';
import { BOOKING_FLAGS, type BookingFlag } from './types';
import { useLedgerWrites } from './mutations';
import { accountsQuery, lookupsQuery, payeesQuery } from './queries';
import {
  editQueued,
  readChoices,
  saveChoices,
  type CaptureChoices,
  type QueuedBooking,
} from '../pwa/queue-store';

const KINDS: ReadonlyArray<SegmentedOption<BookingKind>> = [
  { value: 'expense', label: 'Ausgabe' },
  { value: 'income', label: 'Einnahme' },
  { value: 'transfer', label: 'Umbuchung' },
];
const EDIT_KINDS = KINDS.slice(0, 2);
const NONE = '__none';
const LOCKED = 'Diese Buchung ist geprüft. Bestätige die Freigabe, um sie zu ändern.';
const REMAINDER_SAVE_ERROR = 'Speichern geht erst, wenn der Rest 0,00 € ist.';
interface BankIntent {
  fromAccountId: string;
  toAccountId: string;
  status: ManualBankStatus;
}

/**
 * Focusable fields in reading order; the operator buttons of the amount field are skipped. Fields
 * marked `data-enter-skip` (account and date of a booking: usually right already) stay reachable by Tab but Enter
 * does not stop there.
 */
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
 * The capture form (Buchung erfassen / bearbeiten): keyboard first. Enter saves valid inputs and otherwise moves on,
 * Ctrl+Enter saves, Ctrl+Umschalt+Enter saves and starts the next booking with account, date and
 * payee kept. Esc is handled by the dialog around it (with a discard question when dirty).
 */
export function CaptureForm({
  state,
  onDone,
  onBankCategorized,
  dirtyRef,
  discard,
  requestClose,
  onDeleteBusy,
  queued,
}: {
  state: NonNullable<BookingPanelState>;
  onDone: () => void;
  onBankCategorized?: ((id: string) => void) | undefined;
  /** Tells the dialog whether closing would lose input. */
  dirtyRef: MutableRefObject<boolean>;
  discard: DiscardAsk;
  requestClose: () => void;
  onDeleteBusy?: (busy: boolean) => void;
  queued?: QueuedBooking;
}) {
  useAmountPrivacy();
  const qc = useQueryClient();
  const accounts = useQuery(accountsQuery());
  const lookups = useQuery(lookupsQuery(state.mode === 'edit' ? state.booking.id : undefined));
  const payees = useQuery(payeesQuery());
  const writes = useLedgerWrites();
  const formRef = useRef<HTMLFormElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const accountRequest = useRef(0);
  const accountPayee = useRef('');

  const [today] = useState(todayInVienna);
  const [memory] = useState(readMemory);
  const editing = state.mode === 'edit' ? state.booking : null;
  const editDraft = editing ? draftFromBooking(editing) : null;
  const repeatKey = useRef(crypto.randomUUID());
  const [statusChosen, setStatusChosen] = useState(false);
  // Restore explicit queued intent before choices load; shared draft.status is never that intent.
  const queuedBankIntent: BankIntent | null =
    queued?.input.type === 'transfer' && queued.input.bankStatus !== undefined
      ? {
          fromAccountId: queued.input.fromAccountId,
          toAccountId: queued.input.toAccountId,
          status: queued.input.bankStatus,
        }
      : null;
  const [bankIntent, setBankIntent] = useState<BankIntent | null>(queuedBankIntent);
  const [draft, setDraft] = useState<BookingDraft>(() =>
    queued
      ? queued.draft
      : editDraft
        ? editDraft
        : {
            ...emptyDraft(state.mode === 'create' ? (state.accountId ?? '') : '', today),
            ...(state.mode === 'create' ? state.prefill : {}),
          },
  );
  useEffect(() => {
    const note = noteRef.current;
    if (!note) return;
    note.style.height = 'auto';
    note.style.height = `${note.scrollHeight + 2}px`;
  }, [draft.memo]);
  const [errors, setErrors] = useState<DraftErrors & { form?: string }>({});
  const [offlineChoices, setOfflineChoices] = useState<CaptureChoices>();
  useEffect(() => {
    void readChoices()
      .then(setOfflineChoices)
      .catch(() => undefined);
  }, []);
  const [unlock, setUnlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletePreview, setDeletePreview] = useState<BookingDeletePreview | null>(null);
  // Guards save() itself: held or repeated Ctrl+Enter must not send the booking twice.
  const saving = useRef(false);
  useEffect(() => () => { onDeleteBusy?.(false); }, [onDeleteBusy]);
  const [moreOpen, setMoreOpen] = useState(Boolean(draft.projectId || draft.flag));
  // The category the last chosen payee's default filled in; only that one is replaced by the next.
  const appliedByPayee = useRef<string | null>(null);
  // The payee "Speichern und neu" carried over: context, so it does not make the form dirty.
  const [keptPayee, setKeptPayee] = useState('');
  const set = <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) => {
    if ((key === 'accountId' || key === 'toAccountId') && value !== draft[key]) setBankIntent(null);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const open = useMemo(
    () => orderAccounts(accounts.data?.accounts ?? offlineChoices?.accounts ?? [], memory.accounts),
    [accounts.data, offlineChoices, memory],
  );
  const accountId = draft.accountId || accountFromPayee(open, memory.accounts, undefined);
  const explicitAccountId =
    state.mode === 'create' ? (state.prefill?.accountId ?? state.accountId) : undefined;
  const hasAccountContext = open.some((account) => account.id === explicitAccountId);
  const isTransfer = draft.kind === 'transfer';
  const legOfTransfer = editing !== null && isTransferBooking(editing);
  const locked = editing?.status === 'reconciled';
  const from = open.find((a) => a.id === accountId);
  const to = open.find((a) => a.id === draft.toAccountId);
  const manualPair =
    !editing && isTransfer && from && to ? manualTransferStatus(from.type, to.type) : null;
  const currentBankIntent =
    bankIntent?.fromAccountId === accountId && bankIntent?.toAccountId === draft.toAccountId
      ? bankIntent
      : null;
  const bankStatus = currentBankIntent?.status ?? 'pending';
  const needsCategory = Boolean(isTransfer && from && to && from.onBudget !== to.onBudget);
  const singleMetadata =
    editing?.splits.length === 1
      ? {
          memo: editing.splits[0]?.memo ?? '',
          ...(draft.kind === 'expense'
            ? { incomeTypeId: editing.splits[0]?.incomeTypeId ?? null }
            : {}),
          ...(draft.contactId ? { categoryId: editing.splits[0]?.categoryId ?? '' } : {}),
        }
      : {};
  const lineDraft = isTransfer ? draft : { ...draft, lines: captureLines(draft, singleMetadata) };

  // The budget of the booking's month gives the categories by stage and their Available.
  const parsedDate = captureDate(draft.date, today.slice(0, 4));
  const month = parsedDate ? parsedDate.slice(0, 7) : today.slice(0, 7);
  const budget = useQuery(budgetQuery(month));
  const all = useMemo(
    () =>
      budget.data || lookups.data
        ? pickableCategories(budget.data, lookups.data)
        : (offlineChoices?.categories ?? []),
    [budget.data, lookups.data, offlineChoices],
  );
  // Archived categories are not offered; the field still names the one an old booking has.
  const pickable = useMemo(() => categoriesFor(all, draft.kind), [all, draft.kind]);
  useEffect(() => {
    if (!accounts.data || !lookups.data) return;
    const choices: CaptureChoices = {
      accounts: accounts.data.accounts
        .filter((a) => !a.closedAt)
        .map(({ id, name, type, onBudget, sortOrder, closedAt }) => ({
          id,
          name,
          type,
          onBudget,
          sortOrder,
          closedAt,
        })),
      categories: all.map((c) => ({ ...c, availableCents: null })),
      contacts: lookups.data.contacts.map(({ id, name }) => ({ id, name })),
      incomeTypes: lookups.data.incomeTypes.map(({ id, name }) => ({ id, name })),
      projects: lookups.data.projects.map(({ id, name, archivedAt }) => ({
        id,
        name,
        ...(archivedAt === undefined ? {} : { archivedAt }),
      })),
    };
    void saveChoices(choices).catch(() => undefined);
  }, [accounts.data, lookups.data, all]);
  const splitCategoryKey = [
    draft.categoryId,
    ...draft.splits.map((x) => x.categoryId),
    ...(draft.lines?.map((x) => x.categoryId) ?? []),
  ].join('|');
  // A split line that already has an archived category keeps listing it, so the line stays valid.
  const splitPickable = useMemo(
    () => categoriesFor(all, draft.kind, splitCategoryKey.split('|')),
    [all, draft.kind, splitCategoryKey],
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
  const contacts = lookups.data?.contacts ?? offlineChoices?.contacts ?? [];
  const trackingAccountIds = useMemo(
    () => new Set(open.filter((a) => !a.onBudget).map((a) => a.id)),
    [open],
  );
  const splitLocked = Boolean(editing?.splits.some((x) => x.transferId));
  const lineValidation = buildCreate({ ...lineDraft, accountId, date: parsedDate ?? '' }, null, {
    requireCategory: !editing,
    advanceCategoryId,
    trackingAccountIds,
  });
  const lineProblem = !lineValidation.ok ? lineValidation.errors.splits : undefined;
  const blocked = !isTransfer && Boolean(lineProblem);
  const splitError = errors.splits === REMAINDER_SAVE_ERROR && !blocked ? undefined : errors.splits;

  const draftDirty = queued
    ? JSON.stringify(strip(draft)) !== JSON.stringify(strip(queued.draft))
    : editing
      ? JSON.stringify(strip(draft)) !== JSON.stringify(strip(editDraft!))
      : captureDirty(draft, keptPayee) ||
        Boolean(draft.repeat || draft.lines?.some((line) => line.shares.length));
  const dirty = draftDirty || JSON.stringify(bankIntent) !== JSON.stringify(queuedBankIntent);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty, dirtyRef]);

  /**
   * The payee's default category is applied when a payee is chosen (list pick or leaving the
   * field), not while typing: "Spar" on the way to "Sparkasse" must not set anything.
   */
  const applyPayeeDefault = (name: string, chosen = false) => {
    const key = name.trim().toLowerCase();
    const payee = payees.data?.payees.find((p) => p.name.toLowerCase() === key);
    const fallback = payee?.defaultCategoryId;
    // A delayed lookup must not replace a later payee or a manually selected account.
    if (
      !editing &&
      !queued &&
      !hasAccountContext &&
      draft.kind !== 'transfer' &&
      key &&
      (chosen || key !== accountPayee.current)
    ) {
      accountPayee.current = key;
      const request = ++accountRequest.current;
      const applyAccount = (last: string | undefined) => {
        if (request !== accountRequest.current) return;
        set(
          'accountId',
          accountFromPayee(open, memory.accounts.length ? memory.accounts : [accountId], last),
        );
      };
      if (payee)
        void fetchBookings({ payeeId: payee.id, to: today }, undefined, 1)
          .then((page) => applyAccount(page.items[0]?.accountId))
          .catch(() => undefined);
      else applyAccount(undefined);
    }
    setDraft((d) => {
      if (d.splitOn || d.kind === 'transfer') return d;
      const next = categoryFromPayee(d.categoryId, appliedByPayee.current, fallback);
      if (next === undefined || !categoriesFor(all, d.kind, '').some((c) => c.id === next))
        return d;
      appliedByPayee.current = next;
      return {
        ...d,
        categoryId: next,
        ...(d.lines?.length === 1 && d.lines[0]?.type === 'category'
          ? { lines: [{ ...d.lines[0], categoryId: next }] }
          : {}),
      };
    });
  };

  const changeKind = (kind: BookingKind) => {
    if (kind !== draft.kind) setBankIntent(null);
    setDraft((d) => {
      accountRequest.current++;
      appliedByPayee.current = null;
      const valid = kind !== 'expense' || all.find((c) => c.id === d.categoryId)?.kind !== 'income';
      const next = {
        ...d,
        kind,
        incomeNextMonth: kind === 'income' ? d.incomeNextMonth : false,
        categoryId: kind === 'transfer' || !valid ? '' : d.categoryId,
        incomeTypeId: kind === 'income' ? d.incomeTypeId : '',
        contactId: kind === 'transfer' ? '' : d.contactId,
        splitOn: kind === 'transfer' ? false : d.splitOn,
      };
      if (kind === 'transfer') delete next.lines;
      else if (!valid && next.lines)
        next.lines = next.lines.map((line) => ({ ...line, categoryId: '' }));
      return next;
    });
  };

  const typedPayee = () => {
    const name = draft.payee.trim();
    if (name === '' || isTransfer) return { name: '', known: undefined };
    return {
      name,
      // The booking's retained identity is authoritative while the payee cache catches up.
      known:
        editing?.payeeId && editing.payeeName?.toLowerCase() === name.toLowerCase()
          ? { id: editing.payeeId, name, defaultCategoryId: null }
          : payees.data?.payees.find((p) => p.name.toLowerCase() === name.toLowerCase()),
    };
  };

  /** Payee id from the typed name; a new payee is created, on a new booking with its category. */
  const resolvePayee = async (): Promise<string | null> => {
    const { name, known } = typedPayee();
    if (name === '') return null;
    if (known) return known.id;
    const single = !editing && draft.kind === 'expense' && !draft.splitOn ? draft.categoryId : '';
    const created = await createPayee(name, single || null);
    void qc.invalidateQueries({ queryKey: payeesQuery().queryKey });
    return created.payee.id;
  };

  /** A new booking teaches a known payee without a default the category it was booked to. */
  const learnPayeeDefault = () => {
    const { known } = typedPayee();
    if (editing || !known || known.defaultCategoryId || draft.kind !== 'expense') return;
    if (draft.splitOn || !draft.categoryId) return;
    // Best effort: a failed lesson must neither block the save nor surface as an unhandled error.
    void setPayeeDefaultCategory(known.id, draft.categoryId)
      .then(() => qc.invalidateQueries({ queryKey: payeesQuery().queryKey }))
      .catch(() => undefined);
  };

  const save = async (andNew: boolean) => {
    if (saving.current) return;
    if (!editing && !from) return setErrors({ account: 'Bitte ein verfügbares Konto wählen.' });
    if (blocked) return setErrors({ splits: REMAINDER_SAVE_ERROR });
    const filled = {
      ...lineDraft,
      date: parsedDate ?? '',
      accountId,
      status: queued && isTransfer ? draft.status : effectiveStatus,
    };
    const advance = { advanceCategoryId, trackingAccountIds };
    saving.current = true;
    setBusy(true);
    try {
      // Validate first (a payee still to be created is stood in for by a placeholder id), then
      // write the payee, then the booking: a refused save leaves no payee behind.
      const { name, known } = typedPayee();
      const planned = name === '' ? null : (known?.id ?? 'new-payee');
      if (editing) {
        const plan = (payeeId: string | null) =>
          buildPatch(editing, filled, payeeId, unlock, advance);
        const dry = plan(planned);
        if (!dry.ok) return setErrors(dry.errors);
        if (locked && !unlock && touchesLocked(dry.value)) return setErrors({ form: LOCKED });
        const built = plan(await resolvePayee());
        if (!built.ok) return setErrors(built.errors);
        if (Object.keys(built.value).length > 0)
          await writes.patch.mutateAsync({
            id: editing.id,
            patch: built.value,
            ...(draft.repeat ? { key: repeatKey.current } : {}),
          });
        if (
          editing.source === 'bank' &&
          !isTransfer &&
          (built.value.splits?.some((s) => s.categoryId) ||
            editing.splits.some((s) => s.categoryId))
        )
          onBankCategorized?.(editing.id);
        return onDone();
      }
      const options = { ...advance, requireCategory: true, transferNeedsCategory: needsCategory };
      const dry = buildCreate(filled, planned, options);
      if (!dry.ok) return setErrors(dry.errors);
      const built = buildCreate(filled, known?.id ?? null, options);
      if (!built.ok) return setErrors(built.errors);
      const input =
        built.value.type === 'transfer' && currentBankIntent
          ? { ...built.value, bankStatus: currentBankIntent.status }
          : built.value.type === 'booking' && name && !known
            ? { ...built.value, payeeName: name }
            : built.value;
      if (queued) {
        await editQueued(queued.id, input, filled);
        return onDone();
      }
      const result = await writes.create.mutateAsync({ input, draft: filled });
      if (result) learnPayeeDefault();
      remember(accountId, draft.categoryId || null);
      if (!andNew) return onDone();
      // The next booking keeps the context (kind, account, date, payee and its category).
      setStatusChosen(false);
      setBankIntent(null);
      setKeptPayee(draft.payee);
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
            : error instanceof Error && !(error instanceof ApiError)
              ? error.message
              : errorText(error),
      });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || saving.current || busy) return;
    saving.current = true; setBusy(true); onDeleteBusy?.(true);
    try {
      const preview = await readBookingDeletePreview([editing.id], 'single');
      if (preview.protected || preview.blocked) { setDeletePreview(preview); return; }
      // Ordinary deletion is still immediate: no user confirmation for an unlinked open row.
      await writes.remove.mutateAsync({ id: editing.id, unlock: false, previewRevision: preview.revision });
      onDone();
    } catch (error) { setErrors({ form: errorText(error) }); }
    finally { saving.current = false; setBusy(false); onDeleteBusy?.(false); }
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
    if (!blocked && lineValidation.ok) {
      void save(false);
      return;
    }
    const list = fields(form);
    const next = list
      .slice(list.indexOf(target) + 1)
      .find((el) => !el.closest('[data-enter-skip]'));
    next?.focus();
    if (next instanceof HTMLInputElement && next.type !== 'date') next.select();
  };

  const categoryName =
    selected?.name ?? (draft.kind === 'income' && draft.categoryId === '' ? 'Zu verteilen' : '');
  const chips = [
    ...new Set([
      ...(payeeDefault ? [payeeDefault] : []),
      ...memory.categories,
      ...pickable.map((c) => c.id),
    ]),
  ]
    .map((id) => pickable.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .slice(0, 3);

  const pickCategory = (id: string) => set('categoryId', id === NONE ? '' : id);

  const leading = useMemo(
    () =>
      draft.kind === 'income'
        ? [{ id: NONE, label: 'Zu verteilen', hint: 'noch keiner Kategorie zugewiesen' }]
        : [],
    [draft.kind],
  );
  const showCategory = !isTransfer || needsCategory;
  const automaticCashStatus = !editing && from?.type === 'cash';
  const effectiveStatus = automaticCashStatus
    ? 'confirmed'
    : !editing && !queued && !statusChosen && !(state.mode === 'create' && state.prefill?.status)
      ? 'pending'
      : draft.status;
  const shownStatus = manualPair ? bankStatus : effectiveStatus;
  const bankAccount = manualPair?.cashSide === 'from' ? to : from;
  const cashAccount = manualPair?.cashSide === 'from' ? from : to;
  const moreSummary = [draft.projectId && 'Projekt', draft.flag && 'Markierung']
    .filter(Boolean)
    .join(', ');
  const statusControl = (id?: string, describedBy?: string) =>
    locked && !unlock ? (
      <span className="status">geprüft</span>
    ) : (
      <button
        id={id}
        aria-describedby={describedBy}
        type="button"
        className="icon-btn bk-status"
        aria-label={
          manualPair
            ? `${bankAccount?.name}: Status ${shownStatus === 'confirmed' ? 'Bestätigt' : 'Vorgemerkt'}`
            : effectiveStatus === 'confirmed'
              ? 'Bestätigt'
              : 'Vorgemerkt'
        }
        title={
          automaticCashStatus && !manualPair
            ? 'Bargeldbuchungen sind sofort bestätigt'
            : shownStatus === 'confirmed'
              ? 'Bestätigt'
              : 'Vorgemerkt'
        }
        disabled={automaticCashStatus && !manualPair}
        aria-pressed={shownStatus === 'confirmed'}
        onClick={() => {
          if (manualPair) {
            setBankIntent({
              fromAccountId: accountId,
              toAccountId: draft.toAccountId,
              status: bankStatus === 'confirmed' ? 'pending' : 'confirmed',
            });
            return;
          }
          setStatusChosen(true);
          set('status', effectiveStatus === 'confirmed' ? 'pending' : 'confirmed');
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          strokeWidth="1.75"
          stroke="currentColor"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path
            d="m4 12 5 5L20 6l-2-2-9 9-3-3z"
            fill={shownStatus === 'confirmed' ? 'currentColor' : 'none'}
          />
        </svg>
      </button>
    );
  const dateAndRepeat = (
    <div className="bk-dates" data-enter-skip>
      <div className="bk-date-row">
        <DateField
          draft={draft}
          set={set}
          error={errors.date}
          inputRef={dateRef}
          year={today.slice(0, 4)}
        />
        {!isTransfer && (
          <Field label="Wiederholen">
            {({ id }) => (
              <Select
                id={id}
                value={draft.repeat ?? ''}
                onChange={(e) => set('repeat', e.target.value as BookingDraft['repeat'])}
              >
                <option value="">Nie</option>
                <option value="weekly">Wöchentlich</option>
                <option value="monthly">Monatlich</option>
                <option value="quarterly">Vierteljährlich</option>
                <option value="yearly">Jährlich</option>
              </Select>
            )}
          </Field>
        )}
      </div>
    </div>
  );

  const lineEditor = (
    <SplitEditor
      draft={draft}
      setDraft={setDraft}
      categories={splitPickable}
      accounts={open}
      accountId={accountId}
      contacts={contacts}
      hasAdvanceCategory={Boolean(advanceCategoryId)}
      locked={splitLocked}
      error={splitError ?? errors.category}
      suggestions={chips}
      singleMetadata={singleMetadata}
    />
  );

  const discardQuestion = discard.asking && (
        <div
          className="kdiff is-bad bk-discard"
          role="alertdialog"
          aria-label="Eingaben verwerfen?"
        >
          <span>Eingaben verwerfen?</span>
          <Button size="sm" variant="ghost" onClick={discard.keep}>
            Weiter bearbeiten
          </Button>
          <Button size="sm" onClick={discard.discard}>
            Verwerfen
          </Button>
        </div>
      );

  if (deletePreview && editing) return <>
    <BookingDeletePreviewPanel
    ids={[editing.id]} mode="single" initialPreview={deletePreview} pending={busy || writes.remove.isPending || discard.asking}
    onCancel={() => { onDeleteBusy?.(false); setDeletePreview(null); requestAnimationFrame(() => formRef.current?.querySelector<HTMLButtonElement>('[data-booking-delete]')?.focus()); }}
    onConfirm={async (preview, confirmedUnlock) => {
      if (saving.current) return;
      saving.current = true; setBusy(true); onDeleteBusy?.(true);
      try {
        await writes.remove.mutateAsync({ id: editing.id, unlock: confirmedUnlock, previewRevision: preview.revision });
        onDone();
      } finally { saving.current = false; setBusy(false); onDeleteBusy?.(false); }
    }} />
    {discardQuestion}
  </>;

  return (
    // Keyboard flow is handled once for all fields of the form.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      // React's autoFocus runs before showModal; the native dialog needs the attribute itself.
      ref={(form) => {
        formRef.current = form;
        const amount = form?.querySelector<HTMLInputElement>('.amount-input');
        if (!editing && amount && !amount.autofocus) {
          amount.autofocus = true;
          if (form?.closest('dialog')?.open) amount.focus();
        }
      }}
      className={`bkform${isTransfer ? '' : ' bk-split-cols'}`}
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      onKeyDown={onKeyDown}
      noValidate
    >
      <div className="bk-head">
        {/* Flag first (YNAB), then the kind of booking, then close. */}
        {!isTransfer && (
          <FlagPicker title="Markieren" value={draft.flag} onChange={(flag) => set('flag', flag)} />
        )}
        {legOfTransfer ? (
          <span className="bk-kind bk-kind-fixed">Umbuchung</span>
        ) : (
          <Segmented
            label="Art der Buchung"
            options={editing ? EDIT_KINDS : KINDS}
            value={draft.kind}
            onChange={changeKind}
            stretch
            className="bk-kind"
          />
        )}
        <button
          type="button"
          className="icon-btn bk-close"
          aria-label="Schließen"
          title="Schließen"
          onClick={requestClose}
        >
          <X size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <div className="bk-body kform">
        {editing?.source === 'bank' && editing.status !== 'reconciled' && (
          <BookingAssignmentReview
            id={editing.id}
            onApplied={(canLearn) => {
              if (canLearn) onBankCategorized?.(editing.id);
              onDone();
            }}
          />
        )}
        {locked && (
          <div className="kdiff is-ok" role="note">
            <span>
              Diese Buchung ist <strong>geprüft</strong>. Nur Markierung und Notiz sind frei; alles
              andere braucht deine Freigabe.
            </span>
            <label className="kcheck">
              <input
                type="checkbox"
                checked={unlock}
                onChange={(e) => setUnlock(e.target.checked)}
              />
              Trotzdem ändern
            </label>
          </div>
        )}
        <div className="bk-cols">
          <div className="bk-col-head">
            <AmountInput
              label="Betrag"
              showOperators={false}
              value={draft.amount}
              onChange={(v) => set('amount', v)}
              sign={isTransfer ? null : draft.kind === 'income' ? '+' : '−'}
              error={errors.amount}
            />
            {!isTransfer && (
              <div className="bk-payee">
                <Combobox
                  label={draft.kind === 'income' ? 'Von (Zahler)' : 'Empfänger'}
                  value={draft.payee}
                  placeholder="Suchen oder neu anlegen"
                  pickSingle
                  onChange={(text) => {
                    accountRequest.current++;
                    set('payee', text);
                  }}
                  onSelect={(o) => {
                    set('payee', o.label);
                    applyPayeeDefault(o.label, true);
                  }}
                  onFocusChange={(focused) => !focused && applyPayeeDefault(draft.payee)}
                  options={(payees.data?.payees ?? [])
                    .filter((p) => !p.systemKind)
                    .sort((a, b) =>
                      (b.lastBookingDate ?? '').localeCompare(a.lastBookingDate ?? ''),
                    )
                    .map((p) => ({
                      id: p.id,
                      label: p.name,
                      hint: all.find((c) => c.id === p.defaultCategoryId)?.name,
                    }))}
                />
              </div>
            )}
            <div className="bk-context">
              <div className="bk-context-fields">
                <div
                  className={isTransfer ? 'kform-pair' : 'bk-account-row'}
                  {...(isTransfer ? {} : { 'data-enter-skip': true })}
                >
                  <Field
                    label={
                      isTransfer ? 'Von Konto' : draft.kind === 'expense' ? 'Bezahlt von' : 'Konto'
                    }
                    error={errors.account}
                  >
                    {({ id, describedBy, invalid }) => (
                      <Select
                        id={id}
                        value={accountId}
                        disabled={legOfTransfer}
                        aria-invalid={invalid}
                        aria-describedby={describedBy}
                        onChange={(e) => {
                          accountRequest.current++;
                          set('accountId', e.target.value);
                        }}
                      >
                        <AccountOptions accounts={open} />
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
                          <AccountOptions accounts={open} exclude={accountId} />
                        </Select>
                      )}
                    </Field>
                  ) : (
                    statusControl()
                  )}
                </div>
                {isTransfer &&
                  (manualPair && cashAccount && bankAccount ? (
                    <div className="kform-pair">
                      <Field
                        label={`${cashAccount.name}: Status`}
                        hint="Bargeld ist sofort bestätigt."
                      >
                        {({ id, describedBy }) => (
                          <TextInput
                            id={id}
                            value="Bestätigt"
                            readOnly
                            aria-describedby={describedBy}
                          />
                        )}
                      </Field>
                      <Field label={`${bankAccount.name}: Status`}>
                        {({ id, describedBy }) => statusControl(id, describedBy)}
                      </Field>
                    </div>
                  ) : (
                    statusControl()
                  ))}
                {dateAndRepeat}
              </div>
            </div>
          </div>
          <div className="bk-col-lines">
            {isTransfer && showCategory && (
              <CategoryCombobox
                label="Kategorie"
                capturePicker
                categories={pickable}
                leading={leading}
                selectedName={categoryName}
                error={errors.category}
                onSelect={pickCategory}
              />
            )}
            {!isTransfer && lineEditor}
          </div>
          <div className="bk-col-memo">
            <Field label="Notiz">
              {({ id }) => (
                <textarea
                  ref={noteRef}
                  id={id}
                  className="input bk-note"
                  rows={1}
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
              <summary>
                Mehr{moreSummary && <span className="bk-more-summary"> · {moreSummary}</span>}
                <span aria-hidden="true" className="disclosure-chevron">
                  <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
                </span>
              </summary>
              <div className="kform">
                {!isTransfer && (
                  <Field label="Markierung">
                    {({ id }) => (
                      <Select
                        id={id}
                        value={draft.flag}
                        onChange={(e) => set('flag', e.target.value as BookingFlag | '')}
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
                {((lookups.data?.projects ?? offlineChoices?.projects)?.length ?? 0) > 0 && (
                  <Field label="Projekt">
                    {({ id }) => (
                      <Select
                        id={id}
                        value={draft.projectId}
                        onChange={(e) => set('projectId', e.target.value)}
                      >
                        <option value="">kein Projekt</option>
                        {(lookups.data?.projects ?? offlineChoices?.projects ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.archivedAt ? ' · archiviert' : ''}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                )}
              </div>
            </details>
            {draft.kind === 'income' && (
              <Field label="Einnahmeart">
                {({ id }) => (
                  <Select
                    id={id}
                    value={draft.incomeTypeId}
                    onChange={(e) => set('incomeTypeId', e.target.value)}
                  >
                    <option value="">keine Angabe</option>
                    {(lookups.data?.incomeTypes ?? offlineChoices?.incomeTypes ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </div>
        </div>

        {errors.form && (
          <p className="field-error" role="alert">
            {maskMoneyText(errors.form)}
          </p>
        )}
        {editing && <ReceiptSection bookingId={editing.id} />}
        <p className="khint" aria-hidden="true">
          {CAPTURE_SHORTCUT_HINT}
        </p>
      </div>
      {discardQuestion}
      {blocked && (
        <p id="booking-save-reason" className="bk-save-reason" role="status">
          {lineProblem}
        </p>
      )}
      <div className="bk-foot">
        {editing && (
          <div className="bk-foot-extra">
            <Button data-booking-delete variant="ghost" onClick={() => void remove()} disabled={busy}>
              <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
              Löschen
            </Button>
          </div>
        )}
        {!editing && !queued && (
          <Button variant="ghost" disabled={busy || blocked} onClick={() => void save(true)}>
            Speichern und neu
          </Button>
        )}
        {editing && (
          <Button variant="ghost" onClick={requestClose}>
            Abbrechen
          </Button>
        )}
        <Button
          type="submit"
          disabled={busy || blocked}
          aria-describedby={blocked ? 'booking-save-reason' : undefined}
        >
          Speichern
        </Button>
      </div>
    </form>
  );
}

/** Date field; the day decides which month's Available is shown. */
function DateField({
  draft,
  set,
  error,
  inputRef,
  year,
}: {
  draft: BookingDraft;
  set: <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) => void;
  error: string | undefined;
  inputRef: React.RefObject<HTMLInputElement | null>;
  year: string;
}) {
  useAmountPrivacy();
  const parsed = captureDate(draft.date, year);
  return (
    <div className="kdate">
      <Field label="Datum" error={error}>
        {({ id, describedBy, invalid }) => (
          <div className="bk-date-input">
            <TextInput
              id={id}
              type="text"
              ref={inputRef}
              value={draft.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3.$2.$1')}
              placeholder="TT.MM.JJJJ"
              inputMode="text"
              autoComplete="off"
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(e) => set('date', e.target.value)}
              onBlur={() => parsed && set('date', parsed)}
            />
            <span className="bk-calendar">
              <CalendarDays size={18} aria-hidden="true" />
              <input
                type="date"
                aria-label="Datum im Kalender"
                title="Kalender öffnen"
                value={parsed ?? ''}
                onChange={(e) => set('date', e.target.value)}
              />
            </span>
          </div>
        )}
      </Field>
    </div>
  );
}

/** A draft without the generated split keys: two drafts are the same when nothing was typed. */
function strip(draft: BookingDraft) {
  return {
    ...draft,
    splits: draft.splits.map((s) => ({ ...s, key: '' })),
    ...(draft.lines
      ? {
          lines: draft.lines.map((line) => ({
            ...line,
            key: '',
            shares: line.shares.map((share) => ({ ...share, key: '' })),
          })),
        }
      : {}),
  };
}
