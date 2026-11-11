import { DialogClose } from './dialog-close';
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
  BookingStatusIcon,
  useIsPhone,
  useToast,
} from '@budget/ui';
import { manualTransferStatus, todayInVienna, type ManualBankStatus } from '@budget/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  ChevronDown,
  Trash2,
  Repeat2,
  Plus,
  MoreHorizontal,
  Store,
  Landmark,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
} from 'react';
import { ApiError, request } from '../api/http';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import './capture-redesign.css';
import { budgetQuery } from '../budget/budget-api';
import {
  fetchBookings,
  createPayee,
  setPayeeDefaultCategory,
  readDeletePreview,
  type BookingDeletePreview,
} from './api';
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
  recentPayeeCategory,
  orderAccounts,
  pickableCategories,
  readMemory,
  remember,
} from './capture-model';
import { CategoryCombobox } from './category-picker';
import { Combobox } from './combobox';
import { SplitEditor, captureLines } from './split-editor';
import { AccountOptions } from './account-options';
import { ProjectField } from './project-field';

import {
  AttachedReceipts,
  ReceiptSection,
  type AttachedReceipt,
} from '../receipts/receipt-section';
import { CAPTURE_SHORTCUT_HINT, SKIP_REASON_LABEL, errorText } from './labels';
import { nativeCurrency } from './format';
import { useLedgerWrites } from './mutations';
import { LEDGER_KEY, accountsQuery, lookupsQuery, payeesQuery } from './queries';
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
      !['checkbox', 'file', 'hidden'].includes((el as HTMLInputElement).type) &&
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
  queued,
}: {
  state: NonNullable<BookingPanelState>;
  onDone: () => void;
  onBankCategorized?: ((id: string) => void) | undefined;
  /** Tells the dialog whether closing would lose input. */
  dirtyRef: MutableRefObject<boolean>;
  discard: DiscardAsk;
  requestClose: () => void;
  queued?: QueuedBooking;
}) {
  useAmountPrivacy();
  const qc = useQueryClient();
  const accounts = useQuery(accountsQuery());
  const lookups = useQuery(lookupsQuery(state.mode === 'edit' ? state.booking.id : undefined));
  const payees = useQuery(payeesQuery());
  const writes = useLedgerWrites();
  const [deletion, setDeletion] = useState<BookingDeletePreview | null>(null);
  const deleteQuestion = useRef<HTMLDivElement>(null),
    deleteReturn = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (deletion) deleteQuestion.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [deletion]);
  const cancelDeletion = () => {
    setDeletion(null);
    deleteReturn.current?.focus();
  };
  const formRef = useRef<HTMLFormElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [receiptActionsHost, setReceiptActionsHost] = useState<HTMLDivElement | null>(null);
  const [contactHost, setContactHost] = useState<HTMLDivElement | null>(null);
  const accountRequest = useRef(0);
  // Receipts attached to a NEW booking are already in Prüfen; they get linked once it is saved.
  const toast = useToast();
  const [attached, setAttached] = useState<AttachedReceipt[]>([]);
  const attachedRef = useRef<AttachedReceipt[]>([]);
  // Save is held back while a file is still uploading, so a late result cannot reach the next
  // booking; the draft scope additionally ignores any result that belongs to a previous draft.
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const onUploadBusy = (value: boolean) => {
    uploadingRef.current = value;
    setUploading(value);
  };
  const [draftScope, setDraftScope] = useState(0);
  const draftScopeRef = useRef(0);
  const attach = (file: AttachedReceipt, scope = draftScopeRef.current) => {
    if (scope !== draftScopeRef.current) {
      toast.show({ message: 'Beleg bleibt unter Prüfen.' });
      return;
    }
    if (attachedRef.current.some((r) => r.id === file.id)) return;
    attachedRef.current = [...attachedRef.current, file];
    setAttached(attachedRef.current);
  };
  const detach = async (id: string) => {
    const file = attachedRef.current.find((r) => r.id === id);
    if (!file) return;
    attachedRef.current = attachedRef.current.filter((r) => r.id !== id);
    setAttached(attachedRef.current);
    try {
      await request('DELETE', `/api/receipts/${encodeURIComponent(id)}`);
      void qc.invalidateQueries({ queryKey: [...LEDGER_KEY, 'receipts'] });
      toast.show({ message: 'Beleg verworfen.' });
    } catch {
      toast.show({ message: 'Beleg konnte nicht verworfen werden und bleibt unter Prüfen.' });
    }
  };
  // Closing without a save leaves the files unlinked in Prüfen.
  useEffect(
    () => () => {
      if (attachedRef.current.length) toast.show({ message: 'Beleg bleibt unter Prüfen.' });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const linkAttached = async (bookingId: string | undefined) => {
    // Snapshot at submit time: the ids attached when Save was pressed are the only ones linked;
    // a file arriving while the create request runs stays in Prüfen (and is ignored by the next draft).
    const files = attachedRef.current;
    attachedRef.current = [];
    setAttached([]);
    if (!files.length) return;
    let failed = false;
    for (const file of files) {
      if (!bookingId) {
        failed = true;
        break;
      }
      try {
        await request('POST', `/api/receipts/${encodeURIComponent(file.id)}/links`, { bookingId });
      } catch (error) {
        // 404: the receipt is gone (e.g. its upload was undone); nothing left to link or report.
        if (!(error instanceof ApiError && error.status === 404)) failed = true;
      }
    }
    void qc.invalidateQueries({ queryKey: [...LEDGER_KEY, 'receipts'] });
    if (failed)
      toast.show({ message: 'Beleg bleibt unter Prüfen und kann dort zugeordnet werden.' });
  };
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
    note.style.height = `${note.scrollHeight + note.offsetHeight - note.clientHeight}px`;
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
  // Guards save() itself: held or repeated Ctrl+Enter must not send the booking twice.
  const saving = useRef(false);
  const isPhone = useIsPhone();
  const mobileRedesign = REDESIGN_ENABLED && isPhone;
  const amountMeasure = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!mobileRedesign) return;
    const input = formRef.current?.querySelector<HTMLInputElement>(
      '.bk-amount-primary .amount-input',
    );
    const measure = amountMeasure.current;
    if (!input || !measure) return;
    const fit = () => {
      const width = measure.getBoundingClientRect().width;
      const available = input.clientWidth - 4; // Leave space for the native caret.
      if (width > 0 && available > 0) {
        const base = Number.parseFloat(getComputedStyle(measure).fontSize);
        input.style.fontSize = `${base * Math.min(1, available / width)}px`;
        input.scrollLeft = 0;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(input);
    observer.observe(measure);
    return () => {
      observer.disconnect();
      input.style.removeProperty('font-size');
    };
  }, [mobileRedesign, draft.amount]);
  const amountInputEvent = useRef<InputEvent | null>(null);
  useEffect(() => {
    if (!mobileRedesign) return;
    let frame = 0;
    const release = (event: PointerEvent | FocusEvent) => {
      const form = formRef.current;
      if (!form || form.dataset.amountPointer === undefined) return;
      if ('pointerId' in event && form.dataset.amountPointer !== String(event.pointerId)) return;
      frame = requestAnimationFrame(() => delete form.dataset.amountPointer);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
      if (formRef.current) delete formRef.current.dataset.amountPointer;
    };
  }, [mobileRedesign]);
  const [moreOpen, setMoreOpen] = useState(!REDESIGN_ENABLED && Boolean(draft.projectId));
  // The category the last chosen payee's default filled in; only that one is replaced by the next.
  const appliedByPayee = useRef<string | null>(null);
  const categoryRequest = useRef(0);
  const categoryChosen = useRef(Boolean(draft.categoryId || draft.contactId || draft.splitOn));
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
  // Async payee-history callbacks must see the categories and kind of the latest render, not the
  // ones captured when the payee was picked (they may still be loading then).
  const allRef = useRef(all);
  const kindRef = useRef(draft.kind);
  useLayoutEffect(() => {
    allRef.current = all;
    kindRef.current = draft.kind;
  });
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
      contacts: lookups.data.contacts
        .filter((c) => !c.archived)
        .map(({ id, name }) => ({ id, name })),
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
  // Archived contacts leave the pick list; a booking being edited keeps its own.
  const keptContactIds = new Set(
    editing?.splits.flatMap((x) => (x.contactId ? [x.contactId] : [])),
  );
  const contacts = (lookups.data?.contacts ?? offlineChoices?.contacts ?? []).filter(
    (c) => !('archived' in c && c.archived) || keptContactIds.has(c.id),
  );
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
  const showLineProblem =
    blocked && (mobileRedesign || Boolean(draft.amount.trim() || errors.splits));
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

  /** Applies a payee-suggested category to a draft, only where it is still allowed and valid. */
  const withPayeeCategory = (
    d: typeof draft,
    fallback: string | null | undefined,
  ): typeof draft => {
    if (d.splitOn || d.kind === 'transfer' || d.contactId) return d;
    const next = categoryFromPayee(d.categoryId, appliedByPayee.current, fallback);
    if (next === undefined || !categoriesFor(allRef.current, d.kind, '').some((c) => c.id === next))
      return d;
    appliedByPayee.current = next;
    return {
      ...d,
      categoryId: next,
      ...(d.lines?.length === 1 && d.lines[0]?.type === 'category'
        ? { lines: [{ ...d.lines[0], categoryId: next }] }
        : {}),
    };
  };
  // A history answer that arrives before the categories are loaded waits for them.
  const pendingCategory = useRef<{ request: number; ids: string[] } | null>(null);
  useEffect(() => {
    const pending = pendingCategory.current;
    if (!pending || !all.length) return;
    pendingCategory.current = null;
    if (pending.request !== categoryRequest.current || categoryChosen.current) return;
    const id = pending.ids.find((c) => categoriesFor(all, kindRef.current).some((i) => i.id === c));
    if (id) setDraft((d) => withPayeeCategory(d, id));
  }, [all]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The payee's default category is applied when a payee is chosen (list pick or leaving the
   * field), not while typing: "Spar" on the way to "Sparkasse" must not set anything.
   */
  const applyPayeeDefault = (name: string, chosen = false) => {
    const key = name.trim().toLowerCase();
    const payee = payees.data?.payees.find((p) => p.name.toLowerCase() === key);
    const request = ++categoryRequest.current;
    const applyCategory = (fallback: string | null | undefined) => {
      if (request !== categoryRequest.current || categoryChosen.current) return;
      setDraft((d) => withPayeeCategory(d, fallback));
    };
    applyCategory(payee?.defaultCategoryId);
    const suggestAccount =
      !editing &&
      !queued &&
      !hasAccountContext &&
      draft.kind !== 'transfer' &&
      key &&
      (chosen || key !== accountPayee.current);
    const suggestCategory =
      !editing &&
      !queued &&
      payee &&
      !payee.defaultCategoryId &&
      !categoryChosen.current &&
      !draft.splitOn &&
      !draft.contactId &&
      draft.kind !== 'transfer';
    // Share the history read; account and category choices have separate guards.
    if (!suggestAccount && !suggestCategory) return;
    const accountVersion = suggestAccount ? ++accountRequest.current : accountRequest.current;
    if (suggestAccount) accountPayee.current = key;
    const applyAccount = (last: string | undefined) => {
      if (!suggestAccount || accountVersion !== accountRequest.current) return;
      set(
        'accountId',
        accountFromPayee(open, memory.accounts.length ? memory.accounts : [accountId], last),
      );
    };
    if (!payee) return applyAccount(undefined);
    const readHistory = async () => {
      let cursor: string | undefined;
      do {
        const page = await fetchBookings(
          { payeeId: payee.id, to: today },
          cursor,
          suggestCategory ? 50 : 1,
        );
        if (!cursor) applyAccount(page.items[0]?.accountId);
        if (!suggestCategory || request !== categoryRequest.current || categoryChosen.current)
          return;
        const ids = page.items
          .map((booking) => recentPayeeCategory(booking, kindRef.current))
          .filter((id): id is string => Boolean(id));
        if (!allRef.current.length) {
          pendingCategory.current = { request, ids };
          return;
        }
        const category = ids.find(
          (id) =>
            id && categoriesFor(allRef.current, kindRef.current).some((item) => item.id === id),
        );
        if (category) return applyCategory(category);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
    };
    void readHistory().catch(() => undefined);
  };

  const changeKind = (kind: BookingKind) => {
    if (kind !== draft.kind) setBankIntent(null);
    setDraft((d) => {
      accountRequest.current++;
      categoryRequest.current++;
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
    if (saving.current || uploadingRef.current) return;
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
        await linkAttached(undefined);
        return onDone();
      }
      const result = await writes.create.mutateAsync({ input, draft: filled });
      if (result) learnPayeeDefault();
      await linkAttached(result?.bookings[0]?.id);
      remember(accountId, draft.categoryId || null);
      if (!andNew) return onDone();
      // The next booking keeps the context (kind, account, date, payee and its category).
      draftScopeRef.current++;
      setDraftScope(draftScopeRef.current);
      setStatusChosen(false);
      setBankIntent(null);
      categoryRequest.current++;
      categoryChosen.current = false;
      appliedByPayee.current = draft.splitOn ? null : draft.categoryId;
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

  const remove = async (confirmed?: BookingDeletePreview) => {
    if (!editing || busy || saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const preview = confirmed ?? (await readDeletePreview([editing.id]));
      const protectedRow =
        preview.affectedIds.length > 1 ||
        preview.selection.items.some((item) => item.reason !== null) ||
        preview.skipped.length > 0;
      if (!confirmed && protectedRow) {
        deleteReturn.current = document.activeElement as HTMLElement | null;
        setDeletion(preview);
        return;
      }
      await writes.remove.mutateAsync({
        id: editing.id,
        unlock,
        previewRevision: preview.revision,
      });
      onDone();
    } catch (error) {
      setDeletion(null);
      setErrors({ form: errorText(error) });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const deleteReason = deletion?.selection.items.find((item) => item.reason !== null)?.reason;
  const canConfirmDelete =
    !!deletion &&
    deletion.selection.items.length > 0 &&
    (deletion.skipped.length === 0 ||
      (unlock && deletion.skipped.every((item) => item.reason === 'reconciled_locked')));
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (
      REDESIGN_ENABLED &&
      e.key === 'Escape' &&
      moreOpen &&
      !e.defaultPrevented &&
      e.target instanceof HTMLElement &&
      e.target.closest('.kmore')
    ) {
      e.preventDefault();
      e.stopPropagation();
      setMoreOpen(false);
      formRef.current?.querySelector<HTMLElement>('.kmore > summary')?.focus();
      return;
    }
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
  const moreSummary = draft.projectId ? 'Projekt' : '';
  const statusControl = (id?: string, describedBy?: string) =>
    locked && !unlock ? (
      <span className="status">
        {REDESIGN_ENABLED && <BookingStatusIcon status="reconciled" />}geprüft
      </span>
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
        {REDESIGN_ENABLED ? (
          <BookingStatusIcon status={shownStatus} />
        ) : (
          <Check size={16} strokeWidth={1.75} aria-hidden="true" />
        )}
        <span>{shownStatus === 'confirmed' ? 'Bestätigt' : 'Vorgemerkt'}</span>
      </button>
    );
  const repeatField = (
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
  );
  // Desktop context row: the repeat button joins the date control row (input, calendar, repeat)
  // so Datum and Konto share one structure: label row, then one --touch-high control row.
  const repeatInline = REDESIGN_ENABLED && !mobileRedesign && !isTransfer;
  const repeatButton = (
    <div className="bk-repeat-native" data-recurring={draft.repeat ? '1' : undefined}>
      {repeatField}
      <Repeat2 size={16} strokeWidth={1.75} aria-hidden="true" />
    </div>
  );
  const dateAndRepeat = (
    <div className="bk-dates" data-enter-skip>
      {mobileRedesign && (
        <CalendarDays className="bk-mobile-row-icon" size={16} aria-hidden="true" />
      )}
      <div className="bk-date-row">
        <DateField
          draft={draft}
          set={set}
          error={errors.date}
          inputRef={dateRef}
          year={today.slice(0, 4)}
          trailing={repeatInline ? repeatButton : null}
        />
        {!isTransfer && !repeatInline && (REDESIGN_ENABLED ? repeatButton : repeatField)}
      </div>
    </div>
  );

  const lineEditor = (
    <SplitEditor
      draft={draft}
      setDraft={setDraft}
      onCategoryChoose={() => {
        categoryChosen.current = true;
        categoryRequest.current++;
        appliedByPayee.current = null;
      }}
      categories={splitPickable}
      accounts={open}
      accountId={accountId}
      contacts={contacts}
      hasAdvanceCategory={Boolean(advanceCategoryId)}
      locked={splitLocked}
      error={splitError ?? errors.category}
      suggestions={chips}
      singleMetadata={singleMetadata}
      contactHost={REDESIGN_ENABLED ? contactHost : undefined}
      compact={REDESIGN_ENABLED && isPhone}
      allowReadyToAssign={
        !draft.splitOn &&
        editing?.splits.length === 1 &&
        draft.payee.trim() === editing.payeeName &&
        (editing.payeeSystemKind === 'reconciliation_adjustment' ||
          editing.payeeSystemKind === 'manual_adjustment')
      }
    />
  );

  const hasMoreEntries = ((lookups.data?.projects ?? offlineChoices?.projects)?.length ?? 0) > 0;
  const moreFields = (
    <details className="kmore" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
      <summary>
        <span className={REDESIGN_ENABLED ? 'sr-only' : undefined}>
          Mehr{moreSummary && <span className="bk-more-summary"> · {moreSummary}</span>}
        </span>
        <span aria-hidden="true" className="kmore-caret">
          {' '}
          {REDESIGN_ENABLED ? (
            <MoreHorizontal size={16} strokeWidth={1.75} />
          ) : (
            <ChevronDown className="disclosure-chevron" size={16} strokeWidth={1.75} />
          )}
        </span>
      </summary>
      <div className="kform">
        <ProjectField
          projects={lookups.data?.projects ?? offlineChoices?.projects ?? []}
          value={draft.projectId}
          onChange={(projectId) => set('projectId', projectId)}
        />
      </div>
    </details>
  );
  const closeControl = <DialogClose onClick={requestClose} />;
  const kindHeader = (
    <div className="bk-head" data-kind={draft.kind} data-editing={editing ? 'true' : undefined}>
      {REDESIGN_ENABLED && <span className="bk-kind-label">Art</span>}
      {legOfTransfer ? (
        <span className="bk-kind bk-kind-fixed">Umbuchung</span>
      ) : (
        <Segmented
          label="Art der Buchung"
          options={editing ? EDIT_KINDS : KINDS}
          value={draft.kind}
          onChange={changeKind}
          stretch
          slide={REDESIGN_ENABLED}
          className="bk-kind"
        />
      )}
      {!REDESIGN_ENABLED && closeControl}
    </div>
  );
  const amountField = (
    <AmountInput
      label="Betrag"
      showOperators={mobileRedesign}
      value={draft.amount}
      onChange={(value) => {
        const event = amountInputEvent.current;
        amountInputEvent.current = null;
        // Direct keypad digits shift cents; paste, expressions and commits keep the shared parser.
        if (
          mobileRedesign &&
          event &&
          ((event.inputType === 'insertText' && /^\d$/.test(event.data ?? '')) ||
            event.inputType.startsWith('delete')) &&
          /^[\d.,]*$/.test(value)
        ) {
          const digits = value.replace(/\D/g, '').replace(/^0+/, '');
          const padded = digits.padStart(3, '0');
          value = value === '' ? '' : `${padded.slice(0, -2)},${padded.slice(-2)}`;
        } else if (
          mobileRedesign &&
          event?.inputType === 'insertText' &&
          /^[\d.,]*$/.test(draft.amount) &&
          /^[.,]$/.test(event.data ?? '')
        ) {
          value = draft.amount;
        }
        set('amount', value);
      }}
      sign={isTransfer ? null : draft.kind === 'income' ? '+' : '−'}
      error={errors.amount}
    />
  );

  // Phone buttons advertise the same validation used by save(), without changing its writer.
  const phoneProblem = (() => {
    if (!mobileRedesign) return undefined;
    if (!editing && !from) return 'Bitte ein verfügbares Konto wählen.';
    if (lineProblem) return lineProblem;
    const { name, known } = typedPayee();
    const planned = name === '' ? null : (known?.id ?? 'new-payee');
    const filled = { ...lineDraft, date: parsedDate ?? '', accountId, status: effectiveStatus };
    const options = { advanceCategoryId, trackingAccountIds };
    if (editing) {
      const result = buildPatch(editing, filled, planned, unlock, options);
      if (!result.ok) return Object.values(result.errors).find(Boolean);
      return locked && !unlock && touchesLocked(result.value) ? LOCKED : undefined;
    }
    const result = buildCreate(filled, planned, {
      ...options,
      requireCategory: true,
      transferNeedsCategory: needsCategory,
    });
    return result.ok ? undefined : Object.values(result.errors).find(Boolean);
  })();
  const saveBlocked = mobileRedesign ? Boolean(phoneProblem) : blocked;
  const saveReason = mobileRedesign ? phoneProblem : lineProblem;
  const showSaveReason = mobileRedesign ? Boolean(phoneProblem) : showLineProblem;

  const saveButton = (
    <Button
      type="submit"
      disabled={busy || saveBlocked || uploading}
      aria-describedby={
        showSaveReason ? 'booking-save-reason' : uploading ? 'booking-upload-reason' : undefined
      }
    >
      Speichern
    </Button>
  );
  const formActions = (
    <div className={mobileRedesign ? 'bk-form-actions' : 'bk-foot'}>
      {mobileRedesign && saveButton}
      {REDESIGN_ENABLED && !isPhone && !editing && (
        <Button variant="ghost" className="bk-cancel" onClick={requestClose}>
          Abbrechen
        </Button>
      )}
      {editing && (
        <div className="bk-foot-extra">
          <Button variant="ghost" onClick={() => void remove()} disabled={busy}>
            <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
            Löschen
          </Button>
        </div>
      )}
      {!editing && !queued && (
        <Button
          variant="ghost"
          className={REDESIGN_ENABLED ? 'bk-save-new' : undefined}
          disabled={busy || saveBlocked || uploading}
          onClick={() => void save(true)}
        >
          {REDESIGN_ENABLED && (
            <Plus className="bk-save-new-icon" size={16} strokeWidth={1.75} aria-hidden="true" />
          )}
          <span className={REDESIGN_ENABLED ? 'bk-save-new-label' : undefined}>
            Speichern und neu
          </span>
        </Button>
      )}
      {editing && !mobileRedesign && (
        <Button variant="ghost" onClick={requestClose}>
          Abbrechen
        </Button>
      )}
      {!mobileRedesign && saveButton}
    </div>
  );

  return (
    // Keyboard flow is handled once for all fields of the form.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      // React's autoFocus runs before showModal; the native dialog needs the attribute itself.
      ref={(form) => {
        formRef.current = form;
        // Keep the shared arithmetic field unchanged outside this mobile capture surface.
        form?.querySelectorAll<HTMLInputElement>('.amount-input').forEach((input) => {
          input.inputMode = mobileRedesign ? 'decimal' : 'text';
        });
        const amount = form?.querySelector<HTMLInputElement>('.amount-input');
        if (!editing && amount && !amount.autofocus) {
          amount.autofocus = true;
          if (form?.closest('dialog')?.open) amount.focus();
        }
      }}
      className={`bkform${isTransfer ? '' : ' bk-split-cols'}${REDESIGN_ENABLED ? ' bkform-redesign' : ''}`}
      data-redesign={REDESIGN_ENABLED ? 'booking-editor' : undefined}
      onPointerDown={(event) => {
        const form = event.currentTarget;
        form.dataset.touchFocus = String(event.pointerType === 'touch');
        if (mobileRedesign && document.activeElement?.closest('.bk-amount-primary')) {
          // Keep compact controls stationary from pointerdown through the resulting click.
          form.dataset.amountPointer = String(event.pointerId);
        }
      }}
      onKeyDownCapture={(event) => {
        if (event.key === 'Tab') event.currentTarget.dataset.touchFocus = 'false';
      }}
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      onKeyDown={onKeyDown}
      noValidate
    >
      {REDESIGN_ENABLED && (
        <div className="bk-editor-titlebar">
          <h2>{editing ? 'Buchung bearbeiten' : 'Buchung erfassen'}</h2>
          <div className="bk-editor-receipt-actions" ref={setReceiptActionsHost} />
          {hasMoreEntries && moreFields}
          {closeControl}
          {!editing && (
            <ReceiptSection
              uploadOnly
              actionsHost={receiptActionsHost}
              scope={draftScope}
              onAttached={attach}
              onBusyChange={onUploadBusy}
            />
          )}
        </div>
      )}
      {!REDESIGN_ENABLED && kindHeader}
      {REDESIGN_ENABLED && !editing && (
        <AttachedReceipts items={attached} onRemove={(id) => void detach(id)} />
      )}
      <div className="bk-body kform">
        {REDESIGN_ENABLED && !mobileRedesign && kindHeader}
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
              Diese Buchung ist <strong>geprüft</strong>. Nur die Notiz ist frei; alles andere{' '}
              braucht deine Freigabe.
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
            {mobileRedesign && kindHeader}
            {REDESIGN_ENABLED ? (
              <div
                className="bk-amount-primary"
                data-kind={draft.kind}
                onInputCapture={(event) => {
                  amountInputEvent.current = event.nativeEvent as InputEvent;
                }}
                onPointerUp={(event) => {
                  if (
                    mobileRedesign &&
                    event.target instanceof HTMLInputElement &&
                    event.target.selectionStart === event.target.selectionEnd
                  )
                    event.target.setSelectionRange(
                      event.target.value.length,
                      event.target.value.length,
                    );
                }}
              >
                {amountField}
                {mobileRedesign && (
                  <span className="bk-amount-measure-clip" aria-hidden="true">
                    <span className="bk-amount-measure" ref={amountMeasure}>
                      {draft.amount || '0,00'}
                    </span>
                  </span>
                )}
                {!isTransfer && !mobileRedesign && statusControl()}
              </div>
            ) : (
              amountField
            )}
            {!isTransfer && (
              <div className="bk-payee">
                {mobileRedesign && (
                  <Store className="bk-mobile-row-icon" size={16} aria-hidden="true" />
                )}
                <Combobox
                  label={draft.kind === 'income' ? 'Von (Zahler)' : 'Empfänger'}
                  value={draft.payee}
                  placeholder={mobileRedesign ? 'Empfänger wählen' : 'Suchen oder neu anlegen'}
                  captureOverlay={mobileRedesign}
                  pickSingle
                  onChange={(text) => {
                    accountRequest.current++;
                    categoryRequest.current++;
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
            {mobileRedesign && !isTransfer && <div className="bk-col-lines">{lineEditor}</div>}
            <div className="bk-context">
              <div className="bk-context-fields">
                {REDESIGN_ENABLED && !mobileRedesign && !isTransfer && dateAndRepeat}
                <div
                  className={isTransfer ? 'kform-pair' : 'bk-account-row'}
                  {...(isTransfer ? {} : { 'data-enter-skip': true })}
                >
                  {mobileRedesign && !isTransfer && (
                    <Landmark className="bk-mobile-row-icon" size={16} aria-hidden="true" />
                  )}
                  <Field
                    label={
                      isTransfer
                        ? 'Von Konto'
                        : REDESIGN_ENABLED
                          ? 'Konto'
                          : draft.kind === 'expense'
                            ? 'Bezahlt von'
                            : 'Konto'
                    }
                    error={errors.account}
                  >
                    {({ id, describedBy, invalid }) => (
                      <>
                        {REDESIGN_ENABLED && !isTransfer && draft.kind === 'expense' && (
                          <label htmlFor={id} className="sr-only">
                            Bezahlt von
                          </label>
                        )}
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
                      </>
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
                  ) : !REDESIGN_ENABLED ? (
                    statusControl()
                  ) : null}
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
                {(!REDESIGN_ENABLED || mobileRedesign || isTransfer) && dateAndRepeat}
                {mobileRedesign && !isTransfer && (
                  <div className="bk-mobile-status">
                    <Field label="Status">{({ id }) => statusControl(id)}</Field>
                  </div>
                )}
              </div>
            </div>
          </div>
          {(!mobileRedesign || isTransfer) && (
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
              {!isTransfer && !mobileRedesign && lineEditor}
            </div>
          )}
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
            {REDESIGN_ENABLED && !isTransfer && (
              <div className="bk-contact-host" ref={setContactHost} />
            )}
            {!REDESIGN_ENABLED && hasMoreEntries && moreFields}
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
        {editing &&
          (REDESIGN_ENABLED ? (
            <details className="bk-editor-receipts">
              <summary>Belege</summary>
              <ReceiptSection bookingId={editing.id} actionsHost={receiptActionsHost} />
            </details>
          ) : (
            <ReceiptSection bookingId={editing.id} />
          ))}
        {uploading && (
          <p id="booking-upload-reason" className="bk-save-hint" role="status">
            Beleg wird hochgeladen … Speichern ist gleich möglich.
          </p>
        )}
        {mobileRedesign && showSaveReason && (
          <p
            id="booking-save-reason"
            className={errors.splits ? 'bk-save-reason' : 'bk-save-hint'}
            role="status"
          >
            {saveReason}
          </p>
        )}
        {mobileRedesign && formActions}
        <p className={REDESIGN_ENABLED ? 'khint sr-only' : 'khint'} aria-hidden="true">
          {CAPTURE_SHORTCUT_HINT}
        </p>
      </div>
      {discard.asking && (
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
      )}
      {deletion && (
        <div
          ref={deleteQuestion}
          className="kdiff bk-discard kdelete-question"
          role="alertdialog"
          aria-label="Buchung löschen?"
        >
          <p>
            {deleteReason
              ? `Diese Buchung ist geschützt: ${SKIP_REASON_LABEL[deleteReason]}.`
              : deletion.selection.items.length
                ? 'Diese Umbuchung wird mit allen verbundenen Seiten gelöscht.'
                : 'Die Buchung ist nicht mehr verfügbar.'}
          </p>
          <p>
            {deletion.affectedIds.length} Buchungsseiten sind betroffen.{' '}
            {deletion.affectedTotals
              .map((total) =>
                total.cents === null
                  ? `${total.currency}: nicht darstellbar`
                  : nativeCurrency(total.cents, total.currency, true),
              )
              .join(' · ')}
          </p>
          {deletion.affectedIds.length > 1 && (
            <p>
              Alle Seiten der Umbuchung werden gemeinsam gelöscht und mit einem Rückgängig
              wiederhergestellt.
            </p>
          )}
          {!canConfirmDelete && (
            <p>
              Geprüfte Buchungen zuerst ausdrücklich freigeben. Bei Kontakt- oder Trade-Abrechnungen
              zuerst die zugehörige Abrechnung öffnen und zurücknehmen. Geschützte Dokumentbuchungen
              bleiben ihrer Quellaktion zugeordnet.
            </p>
          )}
          <Button variant="ghost" disabled={busy} onClick={cancelDeletion}>
            Weiter bearbeiten
          </Button>
          {canConfirmDelete && (
            <Button disabled={busy} onClick={() => void remove(deletion)}>
              Löschen bestätigen
            </Button>
          )}
        </div>
      )}
      {!mobileRedesign && showLineProblem && (
        <p id="booking-save-reason" className="bk-save-reason" role="status">
          {lineProblem}
        </p>
      )}
      {!mobileRedesign && formActions}
      {mobileRedesign && (
        <Button
          className="bk-keyboard-save"
          type="submit"
          aria-label="Buchung speichern"
          disabled={busy || saveBlocked || uploading}
          aria-describedby={
            showSaveReason ? 'booking-save-reason' : uploading ? 'booking-upload-reason' : undefined
          }
          onMouseDown={(event) => event.preventDefault()}
        >
          <Check size={20} strokeWidth={1.5} aria-hidden="true" />
        </Button>
      )}
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
  trailing = null,
}: {
  draft: BookingDraft;
  set: <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) => void;
  error: string | undefined;
  inputRef: React.RefObject<HTMLInputElement | null>;
  year: string;
  /** Rendered in the control row after the calendar button (desktop repeat button). */
  trailing?: React.ReactNode;
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
              <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
              <input
                type="date"
                aria-label="Datum im Kalender"
                title="Kalender öffnen"
                value={parsed ?? ''}
                onChange={(e) => set('date', e.target.value)}
              />
            </span>
            {trailing}
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
