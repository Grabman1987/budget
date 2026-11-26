import { Button, Select, useAmountPrivacy, useIsPhone } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { Check, CircleHelp, MoreHorizontal, Pencil, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { request } from '../api/http';
import { candidateAssignmentQuery } from '../assignment/api';
import { useBudgetWrite } from '../budget/use-category-writes';
import { CategoryCombobox } from '../ledger/category-picker';
import { pickableCategories } from '../ledger/capture-model';
import { nativeCurrency, shortDay } from '../ledger/format';
import { KontenMenu } from '../ledger/konten-menu';
import {
  accountsQuery,
  bookingsQuery,
  LEDGER_KEY,
  lookupsQuery,
  payeesQuery,
} from '../ledger/queries';
import type { InboxStored } from './api';
import { BankCandidate, type PreparedBankSuggestion } from './bank-candidate';
import { bankRowMissing } from './bank-row-model';

type Match = {
  id: string;
  accountId?: string;
  accountName: string;
  date: string;
};
type Matches = { merge: Match[]; link?: Match[]; transfers: Match[] };
type Draft = {
  payeeId?: string | undefined;
  categoryId?: string | undefined;
  ruleId?: string | null | undefined;
  revision: string;
  target?: string | undefined;
};

/** Local choices only: confirmation and rejection retain the audited writers and grouped Undo. */
export const BankCandidateRow = memo(function BankCandidateRow({
  item,
  selected,
  onSelect,
  onPrepared,
  onConfirmed,
  onResolve,
  busy,
}: {
  item: InboxStored;
  selected: boolean;
  onSelect: ((checked: boolean) => void) | undefined;
  onPrepared: (id: string, suggestion: PreparedBankSuggestion | undefined) => void;
  onConfirmed: (id: string) => void;
  onResolve: () => void;
  busy: boolean;
}) {
  useAmountPrivacy();
  const isPhone = useIsPhone();
  const id = item.refId!;
  const [active, setActive] = useState(false);
  const preparation = item.bankCandidate?.preparation;
  const loadLookups = active || Boolean(preparation);
  const review = useQuery({ ...candidateAssignmentQuery(id), enabled: active, subscribed: active });
  const matches = useQuery({
    queryKey: [...LEDGER_KEY, 'bank-matches', id],
    queryFn: () =>
      request<Matches>('GET', `/api/bank-sync/candidates/${encodeURIComponent(id)}/matches`),
    enabled: active,
    subscribed: active,
  });
  const lookups = useQuery({ ...lookupsQuery(), enabled: loadLookups, subscribed: loadLookups });
  const payees = useQuery({ ...payeesQuery(), enabled: loadLookups, subscribed: loadLookups });
  const accounts = useQuery({ ...accountsQuery(), enabled: loadLookups, subscribed: loadLookups });
  const [draft, setDraft] = useState<Draft>();
  const [editing, setEditing] = useState<'payee' | 'suggestion' | 'category'>();
  const [saving, setSaving] = useState(false);
  const [fullRequest, setFullRequest] = useState(0);
  const [formPrepared, setFormPrepared] = useState<{
    suggestion: PreparedBankSuggestion | undefined;
  } | null>(null);
  const row = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (active || preparation || !row.current || typeof IntersectionObserver === 'undefined')
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(row.current);
    return () => observer.disconnect();
  }, [active, preparation]);
  const write = useBudgetWrite();
  const prepareForm = useCallback(
    (suggestion: PreparedBankSuggestion | undefined) => setFormPrepared({ suggestion }),
    [],
  );
  // The list is a read snapshot; editing opts into fresh per-row guarded choices.
  const data = (active ? review.data : undefined) ?? preparation?.assignment;
  const matchData = (active ? matches.data : undefined) ?? preparation?.matches;
  const suggestions = data?.suggestions ?? [];
  const availableRules = suggestions.filter((suggestion) => !suggestion.unavailable);
  const transferRules = availableRules.filter((suggestion) => suggestion.actions.transferAccountId);
  const transferTargets = new Set(transferRules.map((entry) => entry.actions.transferAccountId));
  const first = transferTargets.size === 1 ? transferRules[0] : availableRules[0];
  const ruleId = draft?.ruleId === undefined ? first?.id : draft.ruleId;
  const rule = suggestions.find((suggestion) => suggestion.id === ruleId);
  const targets = useMemo(
    () => [
      ...(matchData?.merge ?? []).map((match) => ({ ...match, action: 'merge' as const })),
      ...(matchData?.link ?? []).map((match) => ({ ...match, action: 'merge' as const })),
      ...(matchData?.transfers ?? []).map((match) => ({
        ...match,
        action: 'transfer' as const,
      })),
    ],
    [matchData],
  );
  const payeeId = draft?.payeeId ?? rule?.actions.payeeId ?? data?.cleanup.payeeId ?? '';
  const payee = payees.data?.payees.find((payee) => payee.id === payeeId);
  const transferId =
    rule?.actions.transferAccountId ??
    (!rule && !draft && transferTargets.size === 0 ? data?.recurringTransferAccountId : undefined);
  const needsHistory =
    !transferId &&
    active &&
    payees.isSuccess &&
    Boolean(payeeId) &&
    !payee?.defaultCategoryId &&
    !rule;
  const history = useQuery({
    ...bookingsQuery({ payeeId, sort: 'date', direction: 'desc' }, undefined, 1),
    enabled: needsHistory,
    subscribed: active,
  });
  const latestSplits = history.data?.items[0]?.splits;
  const ruleTarget = Boolean(
    rule?.actions.transferAccountId || rule?.actions.splits || rule?.actions.incomeTypeId,
  );
  const categoryId =
    draft?.categoryId ??
    rule?.actions.categoryId ??
    (!ruleTarget
      ? (payee?.defaultCategoryId ??
        (latestSplits?.length === 1 ? latestSplits[0]?.categoryId : undefined))
      : undefined) ??
    '';
  const categories = pickableCategories(undefined, lookups.data).filter(
    (category) =>
      !lookups.data?.categories.find((entry) => entry.id === category.id)?.hiddenAt &&
      ((item.bankCandidate?.amountCents ?? 0) >= 0 || category.kind !== 'income'),
  );
  const category = categories.find((category) => category.id === categoryId);
  const counterAccount = accounts.data?.accounts.find((account) => account.id === transferId);
  const matchingCounterparts = counterAccount
    ? targets.filter(
        (match) => match.action === 'transfer' && match.accountId === counterAccount.id,
      )
    : [];
  const target = draft?.target
    ? targets.find((match) => `${match.action}:${match.id}` === draft.target)
    : !draft &&
        !matchData?.merge.length &&
        !matchData?.link?.length &&
        matchingCounterparts.length === 1
      ? matchingCounterparts[0]
      : undefined;
  const transferring = Boolean(counterAccount || target?.action === 'transfer');
  const canPrefillTransfer =
    counterAccount && (draft?.ruleId !== undefined || transferTargets.size <= 1);
  const ready =
    (active
      ? review.isSuccess && matches.isSuccess && !review.isFetching && !matches.isFetching
      : Boolean(preparation)) &&
    lookups.isSuccess &&
    payees.isSuccess &&
    accounts.isSuccess &&
    (!needsHistory || history.isSuccess);
  const hasMatches = Boolean(
    matchData && (matchData.merge.length || matchData.link?.length || matchData.transfers.length),
  );
  const blocked =
    review.isError ||
    matches.isError ||
    lookups.isError ||
    payees.isError ||
    accounts.isError ||
    (needsHistory && history.isError)
      ? 'Vorschläge konnten nicht geladen werden. Bitte im Formular erneut prüfen.'
      : draft && draft.revision !== data?.candidateRevision
        ? 'Bankumsatz hat sich geändert. Bitte im Formular erneut prüfen.'
        : data?.existingTransfer ||
            (hasMatches &&
              (!canPrefillTransfer ||
                Boolean(matchData?.merge.length || matchData?.link?.length)) &&
              (!target || targets.length !== 1))
          ? targets.length === 1 && !data?.existingTransfer
            ? 'Gegenbuchung unter Vorschlag wählen.'
            : 'Mehrere mögliche Gegenbuchungen. Bitte im Formular prüfen.'
          : matchingCounterparts && matchingCounterparts.length > 1
            ? 'Mehrere mögliche Gegenbuchungen. Bitte im Formular prüfen.'
            : rule?.unavailable
              ? 'Regel nicht verfügbar. Bitte im Formular prüfen.'
              : rule &&
                  draft?.ruleId === undefined &&
                  !canPrefillTransfer &&
                  (!rule.automatic ||
                    suggestions.filter((suggestion) => !suggestion.unavailable).length !== 1)
                ? 'Regelvorschlag bitte im Formular prüfen.'
                : undefined;
  const missing = bankRowMissing({
    ready: ready || Boolean(blocked),
    blocked,
    account: Boolean(data?.candidate.accountId),
    payee: Boolean(payee),
    category: Boolean(category || rule?.actions.splits?.length || rule?.actions.incomeTypeId),
    transfer: Boolean((transferId && counterAccount) || target),
    knownRule: Boolean(
      rule &&
      (rule?.automatic || draft?.ruleId === rule?.id) &&
      (rule.actions.categoryId || rule.actions.splits?.length || rule.actions.incomeTypeId),
    ),
  });
  const locked = busy || saving;
  const missingReason = missing?.reason;
  const ruleOverrides = Boolean(
    rule &&
    ((draft?.payeeId !== undefined && draft.payeeId !== rule.actions.payeeId) ||
      (categoryId && !ruleTarget && categoryId !== rule.actions.categoryId)),
  );
  const safeRule =
    ready &&
    !missing &&
    !hasMatches &&
    !ruleOverrides &&
    rule?.automatic &&
    !rule.actions.transferAccountId &&
    suggestions.filter((suggestion) => suggestion.automatic && !suggestion.unavailable).length === 1
      ? rule
      : undefined;
  useEffect(() => {
    onPrepared(
      item.id,
      formPrepared
        ? ready && formPrepared.suggestion?.candidateRevision === data?.candidateRevision
          ? formPrepared.suggestion
          : undefined
        : target?.action === 'merge' && data && ready && !missingReason
          ? {
              action: 'merge',
              bookingId: target.id,
              candidateRevision: data.candidateRevision,
              label: `Mit Buchung ${shortDay(target.date)} zusammenführen`,
            }
          : safeRule && data
            ? {
                action: 'rule',
                ruleId: safeRule.id,
                revision: safeRule.revision,
                candidateRevision: data.candidateRevision,
                label: safeRule.name,
                bulkSafe: true,
              }
            : undefined,
    );
  }, [onPrepared, item.id, safeRule, data, target, ready, missingReason, formPrepared]);
  useEffect(() => {
    if (editing)
      row.current
        ?.querySelector<HTMLInputElement | HTMLSelectElement>(
          '.bank-row-editor input, .bank-row-editor select',
        )
        ?.focus();
  }, [editing]);
  const choose = (changes: Partial<Omit<Draft, 'revision'>>) => {
    if (!data) return;
    setFormPrepared(null);
    setDraft((current) => ({ revision: data!.candidateRevision, ...current, ...changes }));
    setEditing(undefined);
    row.current?.focus();
  };
  const openFullForm = () => {
    if (!locked) {
      setActive(true);
      setFullRequest((request) => request + 1);
    }
  };
  const navigate = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (
      !row.current?.contains(event.target as Node) ||
      (event.target as HTMLElement).closest('dialog')
    )
      return;
    if (editing) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setEditing(undefined);
        row.current?.focus();
      }
      return;
    }
    if (event.key === 'Enter' && event.target === event.currentTarget) {
      event.preventDefault();
      openFullForm();
    }
    if (
      (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
      (event.target === event.currentTarget || (event.target as HTMLElement).tagName === 'BUTTON')
    ) {
      const rows = [
        ...event.currentTarget
          .closest('tbody')!
          .querySelectorAll<HTMLTableRowElement>('.bank-v1-row'),
      ];
      const next = rows[rows.indexOf(event.currentTarget) + (event.key === 'ArrowDown' ? 1 : -1)];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    }
  };
  const confirm = () => {
    if (!data || missing) return;
    setSaving(true);
    void write(
      () =>
        request<{ groupId: string; bookingId?: string }>(
          'POST',
          `/api/bank-sync/candidates/${encodeURIComponent(id)}/${target?.action ?? 'confirm'}`,
          target
            ? {
                bookingId: target.id,
                ...(!draft && counterAccount && { candidateRevision: data.candidateRevision }),
              }
            : rule
              ? {
                  categoryId: null,
                  candidateRevision: data.candidateRevision,
                  ...(counterAccount && { verifyNewTransfer: true }),
                  ...(ruleOverrides
                    ? {
                        actions: {
                          ...rule.actions,
                          ...(draft?.payeeId !== undefined ? { payeeId } : {}),
                          ...(categoryId && !ruleTarget ? { categoryId } : {}),
                        },
                      }
                    : { ruleId: rule.id, revision: rule.revision }),
                }
              : counterAccount
                ? {
                    categoryId: null,
                    candidateRevision: data.candidateRevision,
                    verifyNewTransfer: true,
                    actions: { transferAccountId: counterAccount.id },
                  }
                : {
                    categoryId,
                    candidateRevision: data.candidateRevision,
                    actions: { categoryId, payeeId },
                  },
        ),
      () => 'Bankumsatz als Buchung bestätigt.',
    )
      .then((result) => {
        if (
          result?.bookingId &&
          !target &&
          (rule
            ? rule.actions.categoryId || rule.actions.splits || (!ruleTarget && categoryId)
            : categoryId)
        )
          onConfirmed(result.bookingId);
      })
      .finally(() => setSaving(false));
  };
  const rawName = item.bankCandidate?.payeeName || item.bankCandidate?.memo || item.title;
  const confirmLabel =
    target?.action === 'transfer' || counterAccount
      ? `Überweisung an ${target?.accountName ?? counterAccount?.name}`
      : target
        ? `Zusammenführen: ${target.accountName}`
        : rule
          ? `Regel: ${rule.name}`
          : [payee?.name, category?.name].filter(Boolean).join(' · ');
  // The payee has its own button; with neither payee nor category the category comes first.
  const pickCategory =
    missing?.cell === 'category' || (missing?.cell === 'payee' && !category && !transferring);
  const PREPARING = 'Vorschläge werden geprüft.';
  // While the row is still being checked, the list's own preparation label stands in.
  const listLabel = item.bankCandidate?.suggestion?.label;
  const listLabelText =
    !listLabel || listLabel.startsWith('Kategorie prüfen') ? undefined : listLabel;
  const openEditor = (cell: 'payee' | 'suggestion' | 'category') => {
    setActive(true);
    setEditing(cell);
  };
  const editPencil = (
    <button
      type="button"
      className="bank-row-full-form"
      aria-label="Vorschlag ändern"
      title="Vorschlag ändern"
      disabled={locked}
      onClick={() =>
        openEditor(
          transferId || target || suggestions.length || targets.length ? 'suggestion' : 'category',
        )
      }
    >
      <Pencil size={16} aria-hidden="true" />
    </button>
  );
  return (
    <tr
      ref={row}
      tabIndex={0}
      className="rev-row bank-inbox-row bank-v1-row bank-editable-row"
      data-testid="inbox-row"
      data-bank-candidate-id={item.refId}
      onFocus={() => {
        if (!preparation) setActive(true);
      }}
      onKeyDown={navigate}
      onKeyDownCapture={(event) => {
        if (
          !row.current?.contains(event.target as Node) ||
          (event.target as HTMLElement).closest('dialog')
        )
          return;
        if (editing && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setEditing(undefined);
          row.current?.focus();
        }
      }}
      onDoubleClick={(event) => {
        if (!(event.target as HTMLElement).closest('button, input, select')) openFullForm();
      }}
    >
      <td className="bank-v1-select">
        {onSelect && !isPhone && (
          <label className="bank-select">
            <input
              type="checkbox"
              checked={selected}
              disabled={locked}
              aria-label={`Bankzeile auswählen: ${item.bankCandidate?.payeeName ?? item.id}`}
              onChange={(event) => onSelect(event.target.checked)}
            />
          </label>
        )}
      </td>
      <td className="bank-v1-payee">
        {transferring ? (
          <strong>{rawName}</strong>
        ) : editing === 'payee' ? (
          <div className="bank-row-editor">
            <Select
              aria-label="Empfänger"
              value=""
              onChange={(event) =>
                choose({
                  payeeId: event.target.value,
                  ruleId: null,
                  target: undefined,
                })
              }
            >
              <option value="" disabled hidden>
                Empfänger wählen
              </option>
              {payee && <option value={payee.id}>{payee.name} · Vorschlag</option>}
              {payees.data?.payees
                .filter((entry) => !entry.systemKind && entry.id !== payeeId)
                .map((payee) => (
                  <option key={payee.id} value={payee.id}>
                    {payee.name}
                  </option>
                ))}
            </Select>
          </div>
        ) : (
          <button
            type="button"
            className="bank-payee-btn"
            aria-label={payee ? `Empfänger ändern: ${payee.name}` : `Empfänger wählen: ${rawName}`}
            title={missing?.cell === 'payee' ? missing.reason : (payee?.name ?? 'Empfänger wählen')}
            disabled={locked}
            onClick={() => openEditor('payee')}
          >
            <strong>{payee?.name ?? rawName}</strong>
          </button>
        )}
        <div className="bank-v1-meta">
          <span>{item.bankCandidate ? shortDay(item.bankCandidate.date) : ''}</span>
          {!transferring && (payee ? rawName !== payee.name : editing === 'payee') && (
            <small className="bank-v1-raw" title={rawName}>
              {rawName}
            </small>
          )}
          <small className="bank-v1-phone-source">
            {item.bankCandidate?.accountName} · Bank-Sync
          </small>
        </div>
      </td>
      <td className="bank-v1-source" data-missing={missing?.cell === 'source' || undefined}>
        <span>{item.bankCandidate?.accountName ?? 'Konto fehlt'}</span>
        <small>Bank-Sync</small>
      </td>
      <td className="bank-v1-suggestion">
        {editing === 'suggestion' ? (
          <div className="bank-row-editor">
            <Select
              aria-label="Vorschlag"
              value=""
              onChange={(event) => {
                const selectedRule = suggestions.find((entry) => entry.id === event.target.value);
                choose({
                  ruleId: event.target.value === 'manual' ? null : event.target.value,
                  // An explicit rule choice adopts its values; other suggestions retain edits.
                  ...(selectedRule
                    ? {
                        categoryId:
                          selectedRule.actions.categoryId ??
                          (selectedRule.actions.transferAccountId ||
                          selectedRule.actions.splits ||
                          selectedRule.actions.incomeTypeId
                            ? undefined
                            : draft?.categoryId),
                        payeeId: selectedRule.actions.transferAccountId
                          ? undefined
                          : (selectedRule.actions.payeeId ?? draft?.payeeId),
                      }
                    : {}),
                  target: targets.some(
                    (match) => `${match.action}:${match.id}` === event.target.value,
                  )
                    ? event.target.value
                    : undefined,
                });
                // Manual assignment continues straight in the category picker.
                if (event.target.value === 'manual' && !transferring) setEditing('category');
              }}
            >
              <option value="" disabled hidden>
                Vorschlag wählen
              </option>
              {targets.map((match) => (
                <option key={`${match.action}:${match.id}`} value={`${match.action}:${match.id}`}>
                  {match.action === 'transfer' ? 'Umbuchung' : 'Mit Buchung zusammenführen'}:{' '}
                  {match.accountName} · {shortDay(match.date)} · Vorschlag
                </option>
              ))}
              {suggestions.map((suggestion) => (
                <option
                  key={suggestion.id}
                  value={suggestion.id}
                  disabled={Boolean(suggestion.unavailable)}
                >
                  Regel: {suggestion.name} · Vorschlag
                  {suggestion.unavailable ? ' · nicht verfügbar' : ''}
                </option>
              ))}
              <option value="manual">Manuell zuordnen</option>
            </Select>
          </div>
        ) : editing === 'category' && !transferring ? (
          <div className="bank-row-editor">
            <CategoryCombobox
              label="Kategorie"
              categories={categories.filter((entry) => entry.id !== category?.id)}
              capturePicker
              overlayAvoid=".konten-inbox-safe-slot:has(.inbox-safe-action), .tabbar, .toast.is-open"
              allowCreate
              selectedName={category?.name ?? ''}
              leading={category ? [{ id: category.id, label: `${category.name} · Vorschlag` }] : []}
              onSelect={(id) =>
                choose({ categoryId: id, ruleId: null, payeeId, target: undefined })
              }
            />
          </div>
        ) : (
          <div className="bank-suggestion-actions">
            {missing ? (
              <>
                <button
                  type="button"
                  className="bank-suggestion-pill is-missing"
                  // The list's own label ("Mit Buchung … zusammenführen") must not look like the
                  // dialog's action of the same name.
                  aria-label={
                    !pickCategory && missing.cell === 'suggestion' && listLabelText
                      ? `Vorschlag prüfen: ${listLabelText}`
                      : undefined
                  }
                  title={missing.reason}
                  disabled={locked || missing.cell === 'source'}
                  onClick={() =>
                    openEditor(
                      pickCategory ? 'category' : missing.cell === 'payee' ? 'payee' : 'suggestion',
                    )
                  }
                >
                  <CircleHelp size={14} aria-hidden="true" />
                  {pickCategory
                    ? 'Kategorie wählen'
                    : missing.cell === 'payee'
                      ? 'Empfänger fehlt'
                      : missing.reason === PREPARING
                        ? (listLabelText ?? 'Vorschläge prüfen')
                        : (listLabelText ?? missing.reason)}
                </button>
                {missing.cell === 'suggestion' && editPencil}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="bank-suggestion-pill is-safe bank-suggestion-confirm"
                  aria-label={`Vorschlag bestätigen: ${confirmLabel}`}
                  title={confirmLabel}
                  disabled={locked}
                  onClick={confirm}
                >
                  <Check size={14} aria-hidden="true" />
                  {confirmLabel}
                </button>
                {editPencil}
              </>
            )}
          </div>
        )}
      </td>
      <td className="bank-v1-amount num">
        {item.bankCandidate
          ? nativeCurrency(item.bankCandidate.amountCents, item.bankCandidate.currency)
          : '—'}
      </td>
      <td className="bank-v1-action">
        <div className="inbox-row-actions">
          <button
            type="button"
            className="kstatus-btn"
            aria-label="Nicht übernehmen"
            title="Nicht übernehmen"
            disabled={locked}
            onClick={onResolve}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </td>
      <td className="bank-v1-more">
        <BankCandidate
          id={id}
          openRequest={fullRequest}
          disabled={locked}
          initialDraft={draft ? { payeeId, categoryId, ruleId: ruleId ?? null } : undefined}
          description={
            item.bankCandidate
              ? `${item.bankCandidate.payeeName || item.bankCandidate.memo} · ${nativeCurrency(item.bankCandidate.amountCents, item.bankCandidate.currency)} · ${item.bankCandidate.accountName}`
              : item.title
          }
          onConfirmed={onConfirmed}
          onPrepared={prepareForm}
          renderTrigger={(open) => (
            <button
              type="button"
              className="bank-row-full-form"
              aria-label="Prüfen"
              title="Alle Felder prüfen"
              disabled={locked}
              onClick={() => {
                setActive(true);
                open();
              }}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
          )}
        />
        {isPhone && onSelect && (
          <KontenMenu
            label="Weitere Aktionen"
            icon={<MoreHorizontal size={16} aria-hidden="true" />}
            iconOnly
          >
            <label className="bank-select">
              <input
                type="checkbox"
                checked={selected}
                disabled={locked}
                aria-label={`Bankzeile auswählen: ${item.bankCandidate?.payeeName ?? item.id}`}
                onChange={(event) => onSelect(event.target.checked)}
              />
              Auswählen
            </label>
            <Button variant="ghost" disabled={locked} onClick={openFullForm}>
              Alle Felder
            </Button>
          </KontenMenu>
        )}
        {missing && <span className="sr-only">{missing.reason}</span>}
      </td>
    </tr>
  );
});
