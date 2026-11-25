import { DialogClose } from './dialog-close';
import { BookingReleaseQuestion } from './booking-release-question';
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
import {
  manualTransferStatus,
  parseAmount,
  todayInVienna,
  type ManualBankStatus,
} from '@budget/domain';
import { useContactChecklist } from './contact-checklist';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { flushSync } from 'react-dom';
import { ApiError, request } from '../api/http';
import { discardRejectedChange } from '../pwa/queue';
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
import {
  LEDGER_KEY,
  accountsQuery,
  contactCreditQuery,
  lookupsQuery,
  payeesQuery,
} from './queries';
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
 * payee kept. Esc is handled by the dialog around it (closes at once; only a refused queued edit asks).
 */
export function CaptureForm({
  state,
  onDone,
  onBankCategorized,
  dirtyRef,
  discard,
  requestClose,
  queued,
  initialUnlockReconciled = false,
  initialUnlockContactLinked = false,
  initialUnlockLinkedRepayment = false,
}: {
  state: NonNullable<BookingPanelState>;
  onDone: () => void;
  onBankCategorized?: ((id: string) => void) | undefined;
  /** Tells the dialog whether closing would lose input. */
  dirtyRef: MutableRefObject<boolean>;
  discard: DiscardAsk;
  requestClose: () => void;
  queued?: QueuedBooking;
  /** Explicit confirmation from this editor opening; never persisted across openings. */
  initialUnlockReconciled?: boolean;
  initialUnlockContactLinked?: boolean;
  initialUnlockLinkedRepayment?: boolean;
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
  const appliedPayee = useRef<string | null>(null);
  const accountChosen = useRef(false);
  const [allowDefaultAccount, setAllowDefaultAccount] = useState(true);

  const [today] = useState(todayInVienna);
  const [memory] = useState(readMemory);
  const editing = state.mode === 'edit' ? state.booking : null;
  const editDraft = editing ? draftFromBooking(editing) : null;
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
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [offlineChoices, setOfflineChoices] = useState<CaptureChoices>();
  useEffect(() => {
    void readChoices()
      .then(setOfflineChoices)
      .catch(() => undefined);
  }, []);
  const [unlock, setUnlock] = useState(initialUnlockReconciled);
  const [releaseAsking, setReleaseAsking] = useState(false);
  const releaseQuestion = useRef<HTMLDivElement>(null);
  const releaseReturn = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (!releaseAsking) return;
    const returnTo =
      releaseReturn.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const background = Array.from(formRef.current?.children ?? []).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== releaseQuestion.current,
    );
    for (const element of background) element.inert = true;
    releaseQuestion.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      for (const element of background) element.inert = false;
      // React suppresses focus events during cleanup; restore after commit so comboboxes reopen.
      queueMicrotask(() => {
        if (returnTo?.isConnected) returnTo.focus();
      });
    };
  }, [releaseAsking]);
  // #1108: an Auslage that a repayment allocates asks once more, then retries with the flag.
  const [linkedAsk, setLinkedAsk] = useState<{ dates: string[]; op: 'save' | 'remove' } | null>(
    null,
  );
  const linkedConfirmed = useRef(false);
  const retryRemove = useRef<(() => void) | null>(null);
  const askLinked = (error: unknown, op: 'save' | 'remove') => {
    if (!(error instanceof ApiError) || error.code !== 'contact_linked' || linkedConfirmed.current)
      return false;
    setLinkedAsk({ dates: error.settlementDates, op });
    setReleaseAsking(true);
    return true;
  };
  const finishRelease = (confirmed: boolean) => {
    if (linkedAsk) {
      const { op } = linkedAsk;
      setLinkedAsk(null);
      setReleaseAsking(false);
      if (confirmed) {
        linkedConfirmed.current = true;
        setTimeout(() =>
          op === 'save' ? void currentSave.current?.(false) : retryRemove.current?.(),
        );
      }
      return;
    }
    setUnlock(confirmed);
    setReleaseAsking(false);
  };
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
  const set = <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) => {
    if ((key === 'accountId' || key === 'toAccountId') && value !== draft[key]) setBankIntent(null);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const open = useMemo(
    () => orderAccounts(accounts.data?.accounts ?? offlineChoices?.accounts ?? [], memory.accounts),
    [accounts.data, offlineChoices, memory],
  );
  const accountId =
    draft.accountId ||
    (allowDefaultAccount ? accountFromPayee(open, memory.accounts, undefined) : '');
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
  // #1147: the credit a contact already holds, read for a new booking's date only.
  const shareContactIds =
    isTransfer || editing
      ? []
      : [
          ...new Set(
            captureLines(draft, singleMetadata)
              .flatMap((line) => line.shares)
              .map((share) => share.contactId)
              .filter((id): id is string => !!id),
          ),
        ];
  const creditReports = useQueries({
    queries: shareContactIds.map((id) => contactCreditQuery(id, parsedDate ?? today)),
  });
  const contactCredits = (contactId: string) => {
    const credits = creditReports[shareContactIds.indexOf(contactId)]?.data;
    return credits
      ?.filter((c) => !c.targetOutlaySplitId && c.onBudget === from?.onBudget)
      .map((c) => ({ remainingCents: c.remainingCents, categoryId: c.categoryId }));
  };
  // #1322: a payment from one contact lists the contact's open items as a checklist.
  const checklistLines = captureLines(draft, singleMetadata);
  const received = parseAmount(draft.amount);
  const checklist = useContactChecklist({
    contactId:
      !editing &&
      !queued &&
      draft.kind === 'income' &&
      checklistLines.length === 1 &&
      checklistLines[0]?.type === 'contact' &&
      checklistLines[0].shares.length === 0
        ? (checklistLines[0].contactId ?? '')
        : '',
    date: parsedDate && parsedDate <= today ? parsedDate : '',
    receivedCents: received.ok ? received.cents : 0,
    enabled: true,
  });
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
  const showLineProblem = blocked && saveAttempted;
  const splitError = errors.splits === REMAINDER_SAVE_ERROR && !blocked ? undefined : errors.splits;

  // Closing (x, Esc, Verwerfen) discards changed inputs at once. Only a refused queued edit still
  // needs its explicit discard (discardRejectedChange), even after reverting its fields.
  const [refusedEdit, setRefusedEdit] = useState(false);

  useEffect(() => {
    dirtyRef.current = refusedEdit;
  }, [refusedEdit, dirtyRef]);

  /** Applies a payee-suggested category to a draft, only where it is still allowed and valid. */
  const withPayeeCategory = (
    d: typeof draft,
    fallback: string | null | undefined,
  ): typeof draft => {
    if (d.splitOn || d.kind === 'transfer' || d.contactId) return d;
    if (fallback && !categoriesFor(allRef.current, d.kind, '').some((c) => c.id === fallback))
      fallback = undefined;
    const next = fallback
      ? categoryFromPayee(d.categoryId, appliedByPayee.current, fallback)
      : d.categoryId === appliedByPayee.current || !d.categoryId
        ? ''
        : undefined;
    if (
      next === undefined ||
      (next && !categoriesFor(allRef.current, d.kind, '').some((c) => c.id === next))
    )
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
  const openRef = useRef(open);
  useLayoutEffect(() => {
    openRef.current = open;
  });
  const pendingAccount = useRef<{ version: number; id: string } | null>(null);
  useEffect(() => {
    const pending = pendingAccount.current;
    if (!pending || !open.length) return;
    pendingAccount.current = null;
    if (pending.version !== accountRequest.current || accountChosen.current) return;
    setAllowDefaultAccount(false);
    set('accountId', open.some((account) => account.id === pending.id) ? pending.id : '');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
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
   * The payee's last booking is applied when a payee is chosen (list pick or leaving the
   * field), not while typing: "Spar" on the way to "Sparkasse" must not set anything.
   */
  const applyPayeeDefault = (name: string, chosen = false) => {
    const key = name.trim().toLowerCase();
    if (!chosen && appliedPayee.current === key) return;
    appliedPayee.current = key;
    const payee = payees.data?.payees.find((p) => p.name.toLowerCase() === key);
    const request = ++categoryRequest.current;
    const applyCategory = (fallback: string | null | undefined) => {
      if (request !== categoryRequest.current || categoryChosen.current) return;
      setDraft((d) => withPayeeCategory(d, fallback));
    };
    applyCategory(undefined);
    const suggestAccount =
      !editing &&
      !queued &&
      !hasAccountContext &&
      !accountChosen.current &&
      draft.kind !== 'transfer' &&
      (key || accountPayee.current) &&
      (chosen || key !== accountPayee.current);
    const suggestCategory =
      !editing &&
      !queued &&
      !categoryChosen.current &&
      !draft.splitOn &&
      !draft.contactId &&
      draft.kind !== 'transfer';
    // Share the history read; account and category choices have separate guards.
    if (!suggestAccount && !suggestCategory) return;
    const accountVersion = suggestAccount ? ++accountRequest.current : accountRequest.current;
    if (suggestAccount) accountPayee.current = key;
    const applyAccount = (last: string | undefined) => {
      if (!suggestAccount || accountVersion !== accountRequest.current || accountChosen.current)
        return;
      // A history answer that arrives before the accounts are loaded waits for them.
      if (last && !openRef.current.length) {
        pendingAccount.current = { version: accountVersion, id: last };
        return;
      }
      pendingAccount.current = null;
      setAllowDefaultAccount(false);
      set('accountId', openRef.current.some((account) => account.id === last) ? last! : '');
    };
    // Clear automatic values together while the changed payee's history is unresolved.
    applyAccount(undefined);
    if (!payee) return;
    const readHistory = async () => {
      const page = await fetchBookings({ payeeId: payee.id, to: today }, undefined, 1);
      applyAccount(page.items[0]?.accountId);
      if (!suggestCategory || request !== categoryRequest.current || categoryChosen.current) return;
      const latest = page.items[0];
      const category =
        latest?.splits.length === 1 ? recentPayeeCategory(latest, kindRef.current) : undefined;
      if (category && !allRef.current.length) {
        pendingCategory.current = { request, ids: [category] };
        return;
      }
      applyCategory(category);
    };
    void readHistory().catch(() => undefined);
  };

  const changeKind = (kind: BookingKind) => {
    appliedPayee.current = null;
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

  const currentSave = useRef<((andNew: boolean) => Promise<void>) | null>(null);
  const save = async (andNew: boolean): Promise<void> => {
    if (releaseAsking || saving.current || uploadingRef.current) return;
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement &&
      active.validity.customError &&
      active.closest('.is-capture-category') &&
      formRef.current?.contains(active)
    ) {
      // Keyboard saves resolve category search just like leaving the field. Use the updated draft.
      flushSync(() => active.blur());
      return currentSave.current?.(andNew);
    }
    setSaveAttempted(true);
    if (!formRef.current?.checkValidity()) return;
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
            patch: initialUnlockContactLinked
              ? {
                  ...built.value,
                  unlockContactLinked: true,
                  unlockLinkedRepayment: initialUnlockLinkedRepayment,
                }
              : linkedConfirmed.current
                ? { ...built.value, unlockContactLinked: true }
                : built.value,
            capture: {
              input: {
                type: 'booking',
                accountId,
                date: filled.date,
                amountCents: built.value.amountCents ?? editing.amountCents,
                splits: built.value.splits ?? editing.splits,
              },
              draft: filled,
            },
          });
        else if (refusedEdit) await discardRejectedChange(editing.id);
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
      const checklistBody = checklist.payload({
        accountId,
        date: filled.date,
        amountCents: received.ok ? received.cents : 0,
        memo: draft.memo.trim() === '' ? null : draft.memo,
      });
      if (checklistBody && name !== '') {
        if (known) checklistBody.payeeId = known.id;
        else checklistBody.payeeName = name;
      }
      const contactId = checklistLines[0]?.contactId ?? '';
      let createdId: string | undefined;
      if (checklistBody && contactId) {
        createdId = (await writes.checklist.mutateAsync({ contactId, body: checklistBody }))
          .bookingId;
        if (name !== '' && !known) void qc.invalidateQueries({ queryKey: payeesQuery().queryKey });
        learnPayeeDefault();
      } else {
        const result = await writes.create.mutateAsync({ input, draft: filled });
        if (result) learnPayeeDefault();
        createdId = result?.bookings[0]?.id;
      }
      await linkAttached(createdId);
      remember(accountId, draft.categoryId || null);
      if (!andNew) return onDone();
      // Only the register account, date and booking mode belong to the next form.
      draftScopeRef.current++;
      setDraftScope(draftScopeRef.current);
      setStatusChosen(false);
      setBankIntent(null);
      accountRequest.current++;
      accountChosen.current = false;
      accountPayee.current = '';
      appliedPayee.current = null;
      setAllowDefaultAccount(false);
      setSaveAttempted(false);
      categoryRequest.current++;
      categoryChosen.current = false;
      appliedByPayee.current = null;
      setDraft((d) => ({
        ...emptyDraft(hasAccountContext ? explicitAccountId! : '', d.date),
        kind: d.kind,
      }));
      setErrors({});
      // Save and new keeps the form body's scroll position (#1146).
      const body = formRef.current?.querySelector<HTMLElement>('.bk-body');
      const top = body?.scrollTop ?? 0;
      requestAnimationFrame(() => {
        formRef.current
          ?.querySelector<HTMLElement>('.amount-input')
          ?.focus({ preventScroll: true });
        if (body) body.scrollTop = top;
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'booking_queued') return onDone();
      if (
        editing &&
        error instanceof ApiError &&
        error.status > 0 &&
        error.status < 500 &&
        error.code !== 'idempotency_conflict'
      )
        setRefusedEdit(true);
      if (askLinked(error, 'save')) return;
      setErrors({
        form:
          error instanceof ApiError && error.code === 'reconciled_locked'
            ? LOCKED
            : error instanceof Error && !(error instanceof ApiError)
              ? error.message
              : errorText(error),
      });
    } finally {
      linkedConfirmed.current = false;
      saving.current = false;
      setBusy(false);
    }
  };

  const remove = async (confirmed?: BookingDeletePreview) => {
    if (releaseAsking) return;
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
        ...(initialUnlockContactLinked || linkedConfirmed.current ? { unlockLinked: true } : {}),
        ...(initialUnlockContactLinked
          ? { unlockLinkedRepayment: initialUnlockLinkedRepayment }
          : {}),
      });
      onDone();
    } catch (error) {
      setDeletion(null);
      if (!askLinked(error, 'remove')) setErrors({ form: errorText(error) });
    } finally {
      linkedConfirmed.current = false;
      saving.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    retryRemove.current = () => void remove();
  });
  const deleteReason = deletion?.selection.items.find((item) => item.reason !== null)?.reason;
  const canConfirmDelete =
    !!deletion &&
    deletion.selection.items.length > 0 &&
    deletion.skipped.every(
      (item) =>
        (unlock && item.reason === 'reconciled_locked') ||
        (initialUnlockContactLinked && item.id === editing?.id && item.reason === 'linked_contact'),
    );
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (releaseAsking) {
      if (e.key === 'Escape') {
        e.preventDefault();
        finishRelease(false);
      } else if (e.key === 'Tab') {
        const buttons = releaseQuestion.current?.querySelectorAll<HTMLButtonElement>('button');
        const first = buttons?.[0];
        const last = buttons?.[1];
        if (first && last) {
          e.preventDefault();
          (document.activeElement === first ? last : first).focus();
        }
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.preventDefault();
      e.stopPropagation();
      return;
    }
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
  useLayoutEffect(() => {
    currentSave.current = save;
  });
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
      key={draftScope}
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
      contactCredits={contactCredits}
      hasAdvanceCategory={Boolean(advanceCategoryId)}
      locked={splitLocked}
      error={splitError ?? errors.category}
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
  const showSaveReason = mobileRedesign
    ? Boolean(phoneProblem) && (Boolean(editing) || saveAttempted)
    : showLineProblem;

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
      <Button variant="ghost" className="bk-cancel" onClick={requestClose}>
        Verwerfen
      </Button>
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
      {saveButton}
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
                ref={releaseReturn}
                type="checkbox"
                checked={unlock}
                onChange={(e) => {
                  if (REDESIGN_ENABLED && e.target.checked) setReleaseAsking(true);
                  else setUnlock(e.target.checked);
                }}
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
                    appliedPayee.current = null;
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
            {mobileRedesign && !isTransfer && (
              <div className="bk-col-lines">
                {lineEditor}
                {checklist.view}
              </div>
            )}
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
                            accountChosen.current = true;
                            set('accountId', e.target.value);
                          }}
                        >
                          {!accountId && <option value="">Konto wählen</option>}
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
                  allowCreate
                  label="Kategorie"
                  capturePicker
                  categories={pickable}
                  leading={leading}
                  selectedName={categoryName}
                  error={errors.category}
                  onSearchChange={() => pickCategory('')}
                  onSelect={pickCategory}
                />
              )}
              {!isTransfer && !mobileRedesign && lineEditor}
              {!isTransfer && !mobileRedesign && checklist.view}
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

        {busy && <p role="status">Wird gesendet…</p>}
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
        <p className={REDESIGN_ENABLED ? 'khint sr-only' : 'khint'} aria-hidden="true">
          {CAPTURE_SHORTCUT_HINT}
        </p>
      </div>
      {releaseAsking && (
        <BookingReleaseQuestion
          questionRef={releaseQuestion}
          {...(linkedAsk ? { linkedDates: linkedAsk.dates } : {})}
          onCancel={() => finishRelease(false)}
          onConfirm={() => finishRelease(true)}
        />
      )}
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
          <Button
            size="sm"
            onClick={() => {
              void (async () => {
                try {
                  if (editing && refusedEdit) await discardRejectedChange(editing.id);
                  discard.discard();
                } catch (error) {
                  setErrors({ form: errorText(error) });
                }
              })();
            }}
          >
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
          {canConfirmDelete && initialUnlockContactLinked && (
            <p>
              Die Rückzahlung bleibt gebucht. Ihr bisher zugeordneter Betrag wird zu Guthaben beim
              Kontakt.
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
      {formActions}
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
