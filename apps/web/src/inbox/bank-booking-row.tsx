import { Button, Select, useAmountPrivacy, useIsPhone } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { Check, CircleHelp, MoreHorizontal, Pencil } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { request } from '../api/http';
import { bookingAssignmentQuery } from '../assignment/api';
import { useBudgetWrite } from '../budget/use-category-writes';
import { BookingAssignmentReview } from '../assignment/review';
import { CategoryCombobox } from '../ledger/category-picker';
import { pickableCategories } from '../ledger/capture-model';
import { nativeCurrency, shortDay } from '../ledger/format';
import { KontenMenu } from '../ledger/konten-menu';
import { lookupsQuery, payeesQuery } from '../ledger/queries';
import type { BookingPatch } from '../ledger/api';
import type { InboxBooking } from './api';
import {
  BankBookingMerge,
  bankBookingMatchesQuery,
  type PreparedBankSuggestion,
} from './bank-candidate';

/** The row's current payee/category choice, handed to the full booking form. */
export type BookingPrefill = {
  payeeId: string | null;
  payeeName: string | null;
  categoryId: string | null;
  categoryName: string | null;
};

type Draft = {
  payeeId?: string;
  payeeName?: string;
  categoryId?: string;
  categoryName?: string;
};

/**
 * A bank booking that is still unclassified: payee and category are proposed by the server
 * (read-only) and can be corrected and confirmed in the row with ONE booking patch.
 */
export function BankBookingRow({
  item,
  selected,
  onSelect,
  onPrepared,
  onEdit,
  onConfirmed,
  onConfirmInline,
  busy,
}: {
  item: InboxBooking;
  selected: boolean;
  onSelect: ((checked: boolean) => void) | undefined;
  onPrepared: (id: string, suggestion: PreparedBankSuggestion | undefined) => void;
  onEdit: (id: string, prefill?: BookingPrefill) => void;
  onConfirmed: (id: string) => void;
  onConfirmInline: (id: string, patch: BookingPatch) => void;
  busy: boolean;
}) {
  useAmountPrivacy();
  const isPhone = useIsPhone();
  const row = useRef<HTMLTableRowElement>(null);
  const [active, setActive] = useState(false);
  // Rule and merge availability is cheap; it decides whether "Weitere Aktionen" has 2+ entries.
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [draft, setDraft] = useState<Draft>({});
  const [editing, setEditing] = useState<'payee' | 'category'>();
  const [merge, setMerge] = useState<PreparedBankSuggestion>();
  const [rule, setRule] = useState<PreparedBankSuggestion>();
  const suggestion = item.suggestion;
  const write = useBudgetWrite();
  const [transferBusy, setTransferBusy] = useState(false);
  const transfer = suggestion?.transfer;
  // Lookups are fetched only once somebody edits the row.
  const lookups = useQuery({ ...lookupsQuery(), enabled: active, subscribed: active });
  const payees = useQuery({ ...payeesQuery(), enabled: active, subscribed: active });
  const prepared = merge ?? rule;
  useEffect(() => onPrepared(item.id, prepared), [onPrepared, item.id, prepared]);
  const prepareRule = useCallback(
    (found: { id: string; revision: string; name: string } | undefined) =>
      setRule(
        found
          ? { action: 'rule', ruleId: found.id, revision: found.revision, label: found.name }
          : undefined,
      ),
    [],
  );
  useEffect(() => {
    if (visible || !row.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(row.current);
    return () => observer.disconnect();
  }, [visible]);
  const rules = useQuery({
    ...bookingAssignmentQuery(item.bookingId),
    enabled: visible,
    subscribed: visible,
  });
  const matches = useQuery({
    ...bankBookingMatchesQuery(item.bookingId),
    enabled: visible && item.status === 'pending',
    subscribed: visible,
  });
  const hasRule = (rules.data?.suggestions.length ?? 0) > 0;
  const hasMerge = Boolean(matches.data?.merge.length || matches.data?.transfers.length);
  const needsMenu = hasRule || hasMerge || (Boolean(onSelect) && isPhone);
  useEffect(() => {
    if (editing)
      row.current
        ?.querySelector<HTMLInputElement | HTMLSelectElement>(
          '.bank-row-editor input, .bank-row-editor select',
        )
        ?.focus();
  }, [editing]);

  const payeeChanged = draft.payeeId !== undefined;
  const payeeId = draft.payeeId ?? suggestion?.payeeId ?? '';
  const payeeName = draft.payeeName ?? suggestion?.payeeName ?? item.payeeName ?? '';
  const chosenPayee = payees.data?.payees.find((entry) => entry.id === payeeId);
  // A different payee drops the history-based category; its own default may apply.
  const categoryId =
    draft.categoryId ??
    (payeeChanged ? chosenPayee?.defaultCategoryId : suggestion?.categoryId) ??
    '';
  const categories = pickableCategories(undefined, lookups.data).filter(
    (entry) =>
      !lookups.data?.categories.find((c) => c.id === entry.id)?.hiddenAt &&
      (item.amountCents >= 0 || entry.kind !== 'income'),
  );
  const categoryName =
    draft.categoryName ??
    categories.find((entry) => entry.id === categoryId)?.name ??
    (!payeeChanged ? suggestion?.categoryName : undefined) ??
    '';
  const locked = busy;
  const reason = !categoryId
    ? 'Kategorie wählen, um zu bestätigen.'
    : suggestion === undefined || !suggestion.singleSplit
      ? 'Mehrere Teilbuchungen. Bitte im Formular bearbeiten.'
      : undefined;
  const basis =
    !payeeChanged && draft.categoryId === undefined ? (suggestion?.basis ?? undefined) : undefined;

  const prefill = (): BookingPrefill => ({
    payeeId: payeeId || null,
    payeeName: payeeName || null,
    categoryId: categoryId || null,
    categoryName: categoryName || null,
  });
  const confirm = () => {
    if (reason || locked) return;
    const splits = [{ amountCents: item.amountCents, categoryId }];
    // Only a pending booking is accepted; an already confirmed one just gets classified.
    if (item.status === 'pending')
      onConfirmInline(item.bookingId, {
        status: 'confirmed',
        acceptInReview: true,
        ...(payeeId ? { payeeId } : {}),
        splits,
      });
    else onConfirmInline(item.bookingId, { ...(payeeId ? { payeeId } : {}), splits });
  };
  // #1319: the card bill becomes ONE transfer to the card (guarded by the proposal's revision).
  const applyTransfer = () => {
    if (!transfer || locked || transferBusy) return;
    setTransferBusy(true);
    void write(
      () =>
        request<{ groupId: string }>(
          'POST',
          '/api/assignment-rules/bookings/' + encodeURIComponent(item.bookingId) + '/apply',
          { ruleId: transfer.ruleId, revision: transfer.revision },
        ),
      () => 'Kartenabrechnung als Umbuchung gebucht.',
    ).finally(() => setTransferBusy(false));
  };
  const keys = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === 'Escape' && editing) {
      event.preventDefault();
      event.stopPropagation();
      setEditing(undefined);
      row.current?.focus();
    }
  };
  const label = [payeeName, categoryName].filter(Boolean).join(' · ');
  const openEditor = (cell: 'payee' | 'category') => {
    setActive(true);
    setEditing(cell);
  };
  // Without a payee the bank text is already the card title.
  const rawText =
    item.memo && (payeeName ? item.memo !== payeeName : editing === 'payee') ? item.memo : null;
  const select = (
    <label className="bank-select">
      <input
        type="checkbox"
        checked={selected}
        disabled={locked}
        aria-label={`Bankzeile auswählen: ${item.payeeName ?? item.memo ?? item.id}`}
        onChange={(event) => onSelect?.(event.target.checked)}
      />
      {isPhone ? 'Auswählen' : null}
    </label>
  );
  return (
    <tr
      ref={row}
      className="rev-row bank-inbox-row bank-v1-row bank-editable-row bank-booking-row"
      data-testid="inbox-row"
      onKeyDownCapture={keys}
    >
      <td className="bank-v1-select">{onSelect && !isPhone && select}</td>
      <td className="bank-v1-payee">
        {editing === 'payee' ? (
          <div className="bank-row-editor">
            <Select
              aria-label="Empfänger"
              value=""
              onChange={(event) => {
                const picked = payees.data?.payees.find((p) => p.id === event.target.value);
                if (!picked) return;
                setDraft((current) => ({ ...current, payeeId: picked.id, payeeName: picked.name }));
                setEditing(undefined);
                row.current?.focus();
              }}
            >
              <option value="" disabled hidden>
                Empfänger wählen
              </option>
              {payeeId && <option value={payeeId}>{payeeName} · Vorschlag</option>}
              {payees.data?.payees
                .filter((entry) => !entry.systemKind && entry.id !== payeeId)
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
            </Select>
          </div>
        ) : (
          <button
            type="button"
            className="bank-payee-btn"
            aria-label={
              payeeName
                ? `Empfänger ändern: ${payeeName}`
                : `Empfänger wählen: ${item.memo || 'Bankbuchung'}`
            }
            title={payeeName || 'Empfänger wählen'}
            disabled={locked}
            onClick={() => openEditor('payee')}
          >
            <strong>{payeeName || item.memo || 'Bankbuchung'}</strong>
          </button>
        )}
        <div className="bank-v1-meta">
          <span>{shortDay(item.date)}</span>
          {rawText && (
            <small className="bank-v1-raw" title={rawText}>
              {rawText}
            </small>
          )}
          <small className="bank-v1-phone-source">{item.accountName} · Bankbuchung</small>
        </div>
      </td>
      <td className="bank-v1-source">
        <span>{item.accountName}</span>
        <small>Bankbuchung</small>
      </td>
      <td className="bank-v1-suggestion">
        {editing === 'category' ? (
          <div className="bank-row-editor">
            <CategoryCombobox
              label="Kategorie"
              categories={categories.filter((entry) => entry.id !== categoryId)}
              capturePicker
              overlayAvoid=".konten-inbox-safe-slot:has(.inbox-safe-action), .tabbar, .toast.is-open"
              allowCreate
              selectedName={categoryName}
              leading={
                categoryId && categoryName
                  ? [{ id: categoryId, label: `${categoryName} · Vorschlag` }]
                  : []
              }
              onSelect={(id) => {
                setDraft((current) => ({
                  ...current,
                  categoryId: id,
                  categoryName: categories.find((entry) => entry.id === id)?.name ?? '',
                }));
                setEditing(undefined);
                row.current?.focus();
              }}
            />
          </div>
        ) : transfer && draft.categoryId === undefined ? (
          <div className="bank-suggestion-actions">
            <button
              type="button"
              className="bank-suggestion-pill is-safe bank-suggestion-confirm"
              data-testid="card-settlement-suggestion"
              aria-label={`Vorschlag bestätigen: ${transfer.label}, ${nativeCurrency(item.amountCents, item.currency)}`}
              title={`${transfer.label} · ${nativeCurrency(item.amountCents, item.currency)}`}
              disabled={locked || transferBusy}
              onClick={applyTransfer}
            >
              <Check size={14} aria-hidden="true" />
              {transfer.label}
            </button>
            <button
              type="button"
              className="bank-row-full-form"
              aria-label="Stattdessen Kategorie wählen"
              title="Stattdessen Kategorie wählen"
              disabled={locked}
              onClick={() => openEditor('category')}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
          </div>
        ) : categoryId ? (
          <div className="bank-suggestion-actions">
            <button
              type="button"
              className="bank-suggestion-pill is-safe bank-suggestion-confirm"
              aria-label={`Vorschlag bestätigen: ${label}`}
              title={reason ?? basis ?? label}
              disabled={locked || Boolean(reason)}
              onClick={confirm}
            >
              <Check size={14} aria-hidden="true" />
              {label}
            </button>
            <button
              type="button"
              className="bank-row-full-form"
              aria-label="Vorschlag ändern"
              title="Vorschlag ändern"
              disabled={locked}
              onClick={() => openEditor('category')}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="bank-suggestion-pill is-missing"
            title="Kategorie wählen, um zu bestätigen."
            disabled={locked}
            onClick={() => openEditor('category')}
          >
            <CircleHelp size={14} aria-hidden="true" />
            Kategorie wählen
          </button>
        )}
      </td>
      <td className="bank-v1-amount num">{nativeCurrency(item.amountCents, item.currency)}</td>
      <td className="bank-v1-action">
        {!needsMenu && (
          <Button
            variant="ghost"
            size="sm"
            disabled={locked}
            onClick={() => onEdit(item.bookingId, prefill())}
          >
            Bearbeiten
          </Button>
        )}
      </td>
      <td className="bank-v1-more">
        {needsMenu && (
          <KontenMenu
            label="Weitere Aktionen"
            icon={<MoreHorizontal size={16} aria-hidden="true" />}
            iconOnly
          >
            {onSelect && isPhone && select}
            <Button
              variant="ghost"
              disabled={locked}
              onClick={() => onEdit(item.bookingId, prefill())}
            >
              Bearbeiten
            </Button>
            {hasRule && (
              <BookingAssignmentReview
                id={item.bookingId}
                onPrepared={prepareRule}
                onApplied={(canLearn) => {
                  if (canLearn) onConfirmed(item.bookingId);
                }}
              />
            )}
            {hasMerge && <BankBookingMerge bookingId={item.bookingId} onPrepared={setMerge} />}
          </KontenMenu>
        )}
      </td>
    </tr>
  );
}
