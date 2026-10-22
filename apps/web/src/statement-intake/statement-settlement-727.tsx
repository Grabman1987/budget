import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cents,
  formatDecimal,
  parseAmount,
  statementBonusEvidenceSchema,
  statementFactsSchema,
  type StatementFacts,
  type StatementIntakeView,
  type StatementSettlementState,
  type StatementSettlementAction,
  type StatementActionReceipt,
  type StatementBonusEvidence,
  type StatementCandidate,
  type StatementCandidatePage,
  type StatementCandidateCursor,
  type StatementOriginalCandidate,
} from '@budget/domain';
import { Button, Field, Select, TextInput, useAmountPrivacy, maskMoneyText } from '@budget/ui';
import { ApiError, queryString, request } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { accountsQuery, LEDGER_KEY, lookupsQuery } from '../ledger/queries';
import { errorText } from '../ledger/labels';
import { longDay, nativeCurrency } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { occurrencesQuery } from '../expected/api';
import { undoGroup } from '../ledger/api';
import { AppLink } from '../shell/app-link';
import './statement-settlement-727.css';

const PATH = '/api/statement-settlements';
const KEY = [...LEDGER_KEY, 'statement-settlements'] as const;
const stateQuery = (id: string) => ({
  queryKey: [...KEY, id],
  queryFn: () =>
    request<StatementSettlementState>('GET', `${PATH}?cardAccountId=${encodeURIComponent(id)}`),
});
const active = (state: string) => state !== 'withdrawn' && state !== 'superseded';
const STATUS = {
  open: 'Angenommen · noch nicht zugeordnet',
  represented: 'Buchung zugeordnet · kein Nachweis des Bankeinzugs',
  zero: 'Nullbetrag · keine Buchung',
  credit_manual: 'Guthaben · manuell prüfen',
  withdrawn: 'Zurückgenommen',
  superseded: 'Ersetzt',
  ready: 'Nachweis angenommen · noch keine Gutschrift',
  already_net: 'Bereits netto berücksichtigt · keine weitere Gutschrift',
};
const bookingStatus = (status: 'pending' | 'confirmed' | 'reconciled') =>
  status === 'reconciled' ? 'abgeglichen' : status === 'confirmed' ? 'bestätigt' : 'vorgemerkt';
const candidateId = (c: StatementCandidate) =>
  c.kind === 'original'
    ? c.selection.splitId
    : c.kind === 'credit'
      ? c.selection.bookingId
      : c.selection.transferId;
const iso = (raw: string) => raw.replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, '$3-$2-$1');
const sourceCas = (v: StatementIntakeView) => ({
  intakeId: v.id,
  revision: v.revision,
  sha256: v.sha256,
  accountId: v.accountId,
});
type SourceReviewDraft = Record<Exclude<keyof StatementFacts, 'payableCents'>, string> & {
  amount: string;
};
const sourceReviewDraftOf = (view: StatementIntakeView): SourceReviewDraft | null => {
  const fields = view.reviewed?.fields;
  if (!fields) return null;
  return {
    reference: fields.reference.value ?? '',
    issueDate: fields.issueDate.value ? longDay(fields.issueDate.value) : '',
    periodFrom: fields.periodFrom.value ? longDay(fields.periodFrom.value) : '',
    periodTo: fields.periodTo.value ? longDay(fields.periodTo.value) : '',
    amount:
      fields.payableCents.value === null ? '' : formatDecimal(cents(fields.payableCents.value)),
    currency: fields.currency.value ?? '',
    debitDate: fields.debitDate.value ? longDay(fields.debitDate.value) : '',
    accountHint: fields.accountHint.value ?? '',
  };
};
const SOURCE_REVIEW_FIELDS = [
  ['reference', 'Abrechnungsnummer', 128],
  ['issueDate', 'Ausstellungsdatum · TT.MM.JJJJ', 10],
  ['periodFrom', 'Zeitraum von · TT.MM.JJJJ', 10],
  ['periodTo', 'Zeitraum bis · TT.MM.JJJJ', 10],
  ['debitDate', 'Einzugsdatum · TT.MM.JJJJ', 10],
  ['currency', 'Währung', 3],
  ['accountHint', 'Kartenhinweis (maskiert)', 8],
] as const;

function CandidateChoices({
  accountId,
  kind,
  targetId,
  selected,
  onChoose,
}: {
  accountId: string;
  kind: StatementCandidate['kind'];
  targetId?: string | undefined;
  selected: ReadonlySet<string>;
  onChoose: (value: StatementCandidate) => void;
}) {
  useAmountPrivacy();
  const [cursor, setCursor] = useState<StatementCandidateCursor | null>(null);
  const lookups = useQuery(lookupsQuery()),
    accounts = useQuery(accountsQuery());
  const query = useQuery({
    queryKey: [...KEY, accountId, 'candidates', kind, targetId ?? null, cursor],
    queryFn: () =>
      request<StatementCandidatePage>(
        'GET',
        `${PATH}/candidates${queryString({
          cardAccountId: accountId,
          kind,
          limit: 25,
          bonusId: kind !== 'transfer' ? targetId : undefined,
          settlementId: kind === 'transfer' ? targetId : undefined,
          beforeDate: cursor?.date,
          beforeId: cursor?.id,
        })}`,
      ),
  });
  const names = new Map(lookups.data?.categories.map((c) => [c.id, c.name]));
  return (
    <div className="statement-candidates-727">
      {query.isPending && <LoadingNote what="Auswählbare Buchungen" />}
      {query.isError && (
        <ErrorNote
          what="Auswählbare Buchungen"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && !query.isError && !query.isFetching && (
        <>
          {query.data.kind !== kind ||
          query.data.items.some(
            (item) =>
              item.kind !== kind ||
              (item.kind === 'original'
                ? item.selection.accountId !== accountId
                : item.kind === 'credit'
                  ? item.accountId !== accountId
                  : item.toAccountId !== accountId),
          ) ? (
            <p role="alert">Die Auswahl passt nicht zu dieser Aktion. Bitte neu laden.</p>
          ) : (
            <>
              {query.data.items.length === 0 && (
                <p>In diesem Ausschnitt gibt es keine auswählbare Buchung.</p>
              )}
              <ul>
                {query.data.items.map((item) => (
                  <li key={candidateId(item)}>
                    <label className="statement-choice-727">
                      <input
                        type="checkbox"
                        checked={selected.has(candidateId(item))}
                        onChange={() => onChoose(item)}
                      />
                      <span>
                        {longDay(item.date)} ·{' '}
                        {item.kind === 'original'
                          ? `${names.get(item.selection.categoryId) ?? 'Ausgabenkategorie'} · ${nativeCurrency(item.selection.splitAmountCents, item.selection.currency)} · ${bookingStatus(item.status)}`
                          : item.kind === 'credit'
                            ? `${nativeCurrency(item.amountCents, item.currency)} · ${bookingStatus(item.status)}`
                            : `${accounts.data?.accounts.find((a) => a.id === item.fromAccountId)?.name ?? 'Gegenkonto'}: ${nativeCurrency(item.fromCents, item.currency, true)} · ${bookingStatus(item.fromStatus)} / ${accounts.data?.accounts.find((a) => a.id === item.toAccountId)?.name ?? 'Kreditkarte'}: ${nativeCurrency(item.toCents, item.currency, true)} · ${bookingStatus(item.toStatus)}`}
                      </span>
                    </label>
                    {item.kind === 'credit' && (
                      <ul aria-label="Kategorieanteile der bestehenden Gutschrift">
                        {item.allocations.map((a, index) => (
                          <li key={index}>
                            {a.categoryId
                              ? (names.get(a.categoryId) ?? 'Kategorie nicht verfügbar')
                              : 'Keine Ausgabenkategorie'}{' '}
                            · {nativeCurrency(a.amountCents, item.currency)} ·{' '}
                            {lookups.data?.incomeTypes.find((kind) => kind.id === a.incomeTypeId)
                              ?.name ?? 'Einnahmenart nicht verfügbar'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              {Object.values(query.data.omitted).some((count) => count && count > 0) && (
                <p>
                  Einträge dieses Ausschnitts sind nicht auswählbar. Das ist keine Gesamtzahl des
                  Kontos.
                </p>
              )}
            </>
          )}
          <div className="statement-actions-727">
            {cursor && (
              <Button variant="ghost" onClick={() => setCursor(null)}>
                Ersten Ausschnitt anzeigen
              </Button>
            )}
            {query.data.nextCursor && (
              <Button variant="ghost" onClick={() => setCursor(query.data!.nextCursor)}>
                Weitere Buchungen anzeigen
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Parent owns the existing dialog and navigation guard; account/source changes are explicit. */
export function StatementSettlementReview({
  accountId,
  initialSource,
  onDirty,
  onBusy,
  onBack,
  onManual,
  onSourceAdopt,
  canSourceHistoryChange,
  onSourceHistoryConflict,
}: {
  accountId: string;
  initialSource: StatementIntakeView;
  onDirty: (value: boolean) => void;
  onBusy: (value: boolean) => void;
  onBack: () => void;
  onManual: () => boolean;
  onSourceAdopt: (source: StatementIntakeView) => void;
  canSourceHistoryChange: () => boolean;
  onSourceHistoryConflict: () => void;
}) {
  useAmountPrivacy();
  const qc = useQueryClient(),
    write = useBudgetWrite();
  const accounts = useQuery(accountsQuery()),
    lookups = useQuery(lookupsQuery());
  const current = useQuery(stateQuery(accountId));
  const [source, setSource] = useState(initialSource);
  const [captured, setCaptured] = useState<StatementSettlementState | null>(null);
  const [configDirty, setConfigDirty] = useState(false),
    [bonusDirty, setBonusDirty] = useState(false),
    [choiceDirty, setChoiceDirty] = useState(false);
  const [sourceReviewDraft, setSourceReviewDraft] = useState<SourceReviewDraft | null>(null);
  const [sourceReviewAcknowledged, setSourceReviewAcknowledged] = useState(false);
  const dirty = configDirty || bonusDirty || choiceDirty || sourceReviewDraft !== null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''),
    [conflict, setConflict] = useState(false);
  const [retry, setRetry] = useState<StatementSettlementAction | null>(null);
  const [fundingId, setFundingId] = useState(''),
    [enabled, setEnabled] = useState(false);
  const [intent, setIntent] = useState<'pending' | 'confirmed'>('pending');
  const [legacyKey, setLegacyKey] = useState('');
  const [bonusAmount, setBonusAmount] = useState(''),
    [creditDate, setCreditDate] = useState('');
  const [treatment, setTreatment] = useState<StatementBonusEvidence['treatment'] | ''>('');
  const [reviewedCredits, setReviewedCredits] = useState(false),
    [reviewedFees, setReviewedFees] = useState(false);
  const [originals, setOriginals] = useState<StatementOriginalCandidate[]>([]);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [chosenTransfer, setChosenTransfer] = useState<Extract<
    StatementCandidate,
    { kind: 'transfer' }
  > | null>(null);
  const [chosenCredit, setChosenCredit] = useState<Extract<
    StatementCandidate,
    { kind: 'credit' }
  > | null>(null);
  const [editingBonus, setEditingBonus] = useState<string | null>(null);
  const running = useRef(false);
  const historyGuard = useRef({ busy: false, dirty: false, retry: false, conflict: false });
  useEffect(() => {
    onDirty(dirty || retry !== null);
  }, [dirty, retry, onDirty]);
  useEffect(() => {
    onBusy(busy);
  }, [busy, onBusy]);
  useEffect(
    () => () => {
      onDirty(false);
      onBusy(false);
    },
    [onDirty, onBusy],
  );
  if (captured === null && current.data) {
    setCaptured(current.data);
    setFundingId(current.data.config?.fundingAccountId ?? '');
    setEnabled(current.data.config?.enabled ?? false);
  }
  const changed = (part: 'config' | 'bonus' | 'choice') => {
    if (part === 'config') setConfigDirty(true);
    else if (part === 'bonus') setBonusDirty(true);
    else setChoiceDirty(true);
  };
  const card = accounts.data?.accounts.find((a) => a.id === accountId);
  const eligibleFunding =
    accounts.data?.accounts.filter(
      (a) =>
        a.id !== accountId &&
        !a.closedAt &&
        ['checking', 'savings'].includes(a.type) &&
        a.currency === card?.currency &&
        a.onBudget === card?.onBudget,
    ) ?? [];
  const eligible = Boolean(
    card &&
    !card.closedAt &&
    card.type === 'credit_card' &&
    (!card.onBudget || card.currency === 'EUR') &&
    !accounts.isError &&
    !accounts.isFetching,
  );
  const stale = Boolean(
    captured && current.data && JSON.stringify(captured) !== JSON.stringify(current.data),
  );
  const blocked =
    busy ||
    conflict ||
    retry !== null ||
    stale ||
    !eligible ||
    current.isError ||
    current.isFetching;
  historyGuard.current = { busy, dirty, retry: retry !== null, conflict };
  const configRevision = captured?.config?.revision;
  const settlement = captured?.settlements.find(
    (r) => r.sourceIntakeId === source.id && active(r.state),
  );
  const bonus = captured?.bonuses.find((r) => r.sourceIntakeId === source.id && active(r.state));
  const fields = source.reviewed?.fields;
  const reviewed = Boolean(
    source.accountId === accountId &&
    source.status === 'reviewed' &&
    !source.deletedAt &&
    fields &&
    fields.reference.value?.trim() &&
    fields.issueDate.value &&
    fields.currency.value &&
    fields.debitDate.value &&
    fields.payableCents.value !== null,
  );
  const canConfirm =
    reviewed &&
    fields?.currency.value === card?.currency &&
    captured?.config?.enabled &&
    !!configRevision &&
    !blocked &&
    !configDirty;
  const occurrences = useQuery({
    ...occurrencesQuery(fields?.debitDate.value ?? '', fields?.debitDate.value ?? ''),
    enabled:
      Boolean(settlement?.fundingAccountId ?? captured?.config?.fundingAccountId) &&
      Boolean(fields?.debitDate.value),
  });
  const legacy =
    occurrences.data?.filter(
      (o) =>
        o.accountId === (settlement?.fundingAccountId ?? captured?.config?.fundingAccountId) &&
        o.kind === 'outflow' &&
        o.currency === fields?.currency.value,
    ) ?? [];
  const chosenLegacy = legacy.find((o) => `${o.paymentId}|${o.dueDate}` === legacyKey);
  const affectedCategories = [...new Set(originals.map((o) => o.selection.categoryId))];
  const categoryName = (id: string) =>
    lookups.data?.categories.find((c) => c.id === id)?.name ?? 'Ausgabenkategorie';
  const amount = parseAmount(bonusAmount);
  const evidenceResult = statementBonusEvidenceSchema.safeParse({
    origin: 'owner',
    bonusCents: amount.ok ? amount.cents : null,
    creditDate: iso(creditDate),
    treatment,
    existingCreditsReviewed: reviewedCredits,
    feesAdjustmentsReviewed: reviewedFees,
    selectedOriginals: originals.map((o) => o.selection),
    allocations: affectedCategories.flatMap((categoryId) => {
      const value = parseAmount(allocationAmounts[categoryId] ?? '');
      return value.ok && value.cents !== 0 ? [{ categoryId, amountCents: value.cents }] : [];
    }),
  });
  const sourceAmount = sourceReviewDraft?.amount.trim()
    ? parseAmount(sourceReviewDraft.amount)
    : null;
  const sourceReviewFacts = sourceReviewDraft
    ? statementFactsSchema.safeParse({
        reference: sourceReviewDraft.reference.trim() || null,
        issueDate: iso(sourceReviewDraft.issueDate) || null,
        periodFrom: iso(sourceReviewDraft.periodFrom) || null,
        periodTo: iso(sourceReviewDraft.periodTo) || null,
        payableCents: sourceAmount?.ok ? sourceAmount.cents : null,
        currency: sourceReviewDraft.currency.trim() || null,
        debitDate: iso(sourceReviewDraft.debitDate) || null,
        accountHint: sourceReviewDraft.accountHint.trim() || null,
      })
    : null;
  const sourceReviewComplete = Boolean(
    sourceReviewFacts?.success &&
    sourceReviewFacts.data.reference &&
    sourceReviewFacts.data.issueDate &&
    sourceReviewFacts.data.payableCents !== null &&
    sourceReviewFacts.data.currency === card?.currency &&
    sourceReviewFacts.data.debitDate &&
    sourceAmount?.ok,
  );
  const sourceFieldError = (field: keyof StatementFacts) => {
    if (!sourceReviewDraft) return undefined;
    if (
      (field === 'reference' && !sourceReviewDraft.reference.trim()) ||
      (field === 'issueDate' && !sourceReviewDraft.issueDate) ||
      (field === 'debitDate' && !sourceReviewDraft.debitDate) ||
      (field === 'payableCents' && !sourceReviewDraft.amount.trim())
    )
      return 'Diese Angabe ist für die erneute Prüfung erforderlich.';
    if (field === 'currency' && sourceReviewDraft.currency !== card?.currency)
      return 'Die Währung muss zur Kreditkarte passen.';
    if (sourceReviewFacts && !sourceReviewFacts.success) {
      if (sourceReviewFacts.error.issues.some((issue) => issue.path[0] === field))
        return 'Bitte diese Angabe anhand des Originals prüfen.';
      if (
        field === 'periodTo' &&
        sourceReviewFacts.error.issues.some((issue) => issue.path.length === 0)
      )
        return 'Das Ende des Zeitraums muss nach dem Beginn liegen.';
    }
    return undefined;
  };
  function clearDraft() {
    setConfigDirty(false);
    setBonusDirty(false);
    setChoiceDirty(false);
    setRetry(null);
    setOriginals([]);
    setAllocationAmounts({});
    setBonusAmount('');
    setCreditDate('');
    setTreatment('');
    setReviewedCredits(false);
    setReviewedFees(false);
    setChosenCredit(null);
    setChosenTransfer(null);
    setEditingBonus(null);
    setSourceReviewDraft(null);
    setSourceReviewAcknowledged(false);
    setLegacyKey('');
  }
  const canApplyHistory = () => {
    const guard = historyGuard.current;
    return (
      !guard.busy &&
      !guard.dirty &&
      !guard.retry &&
      !guard.conflict &&
      !running.current &&
      canSourceHistoryChange()
    );
  };
  async function adoptLatestSource(sourceId = source.id, canAdopt: () => boolean = () => true) {
    const [next, document] = await Promise.all([
      request<StatementSettlementState>(
        'GET',
        `${PATH}?cardAccountId=${encodeURIComponent(accountId)}`,
      ),
      request<{ intake: StatementIntakeView }>(
        'GET',
        `/api/statement-intake/${encodeURIComponent(sourceId)}`,
      ),
    ]);
    if (document.intake.accountId !== accountId || document.intake.id !== sourceId)
      throw new Error('Die Quelle passt nicht zur ausgewählten Abrechnung dieses Kontos.');
    if (!canAdopt())
      throw new Error('Der Dokumentstand konnte wegen neuer ungespeicherter Angaben nicht übernommen werden.');
    setSource(document.intake);
    onSourceAdopt(document.intake);
    setCaptured(next);
    qc.setQueryData(stateQuery(accountId).queryKey, next);
    setFundingId(next.config?.fundingAccountId ?? '');
    setEnabled(next.config?.enabled ?? false);
    clearDraft();
    setConflict(false);
    await qc.invalidateQueries({ queryKey: [...KEY, accountId, 'candidates'] });
  }
  const markHistoryConflict = (cause: unknown) => {
    setConflict(true);
    setError(errorText(cause));
    onSourceHistoryConflict();
  };
  const sourceHistory = {
    canApply: canApplyHistory,
    afterApply: async () => {
      try {
        if (!canApplyHistory())
          throw new Error('Der aktuelle Dokumentstand muss erneut geladen werden.');
        await adoptLatestSource(source.id, canApplyHistory);
      } catch (cause) {
        markHistoryConflict(cause);
        throw cause;
      }
    },
  };
  async function reload(sourceId = source.id) {
    if (
      busy ||
      ((dirty || retry) &&
        !window.confirm('Ungespeicherte Auswahl verwerfen und den aktuellen Stand laden?'))
    )
      return;
    setBusy(true);
    setError('');
    try {
      await adoptLatestSource(sourceId);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function run(action: StatementSettlementAction) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    let cause: unknown;
    const sourceReassessed = action.operation === 'amend_bonus' && !!action.sourceReview;
    try {
      const result = await write(
        async () => {
          try {
            const receipt = await request<StatementActionReceipt>(
              'POST',
              `${PATH}/actions`,
              action,
            );
            return {
              ...receipt,
              groupId: receipt.groupId ?? '',
              ...(!receipt.groupId ? { changedCount: 0 } : {}),
            };
          } catch (e) {
            cause = e;
            throw e;
          }
        },
        () =>
          action.operation === 'confirm' || action.operation === 'confirm_bonus'
            ? 'Nachweis angenommen. Es wurde nichts gebucht.'
            : 'Ausgleich aktualisiert.',
        sourceReassessed ? sourceHistory : undefined,
      );
      if (!result) {
        if (!(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500)
          setRetry(action);
        if (cause instanceof ApiError && cause.status === 409) setConflict(true);
        setError(cause ? errorText(cause) : 'Aktion nicht gespeichert. Bitte den Stand prüfen.');
        return;
      }
      // Ordinary actions keep the captured source CAS. A represented-source review changes it.
      setRetry(null);
      setConflict(false);
      if (action.operation === 'configure') setConfigDirty(false);
      if (action.operation === 'confirm_bonus' || action.operation === 'amend_bonus') {
        setBonusDirty(false);
        setOriginals([]);
        setAllocationAmounts({});
        setBonusAmount('');
        setCreditDate('');
        setTreatment('');
        setReviewedCredits(false);
        setReviewedFees(false);
        setEditingBonus(null);
      }
      if (
        [
          'confirm',
          'amend',
          'create_transfer',
          'link_transfer',
          'create_bonus',
          'link_bonus',
        ].includes(action.operation)
      ) {
        setChoiceDirty(false);
        setChosenCredit(null);
        setChosenTransfer(null);
        setLegacyKey('');
      }
      const [next, document] = await Promise.all([
        request<StatementSettlementState>(
          'GET',
          `${PATH}?cardAccountId=${encodeURIComponent(accountId)}`,
        ),
        sourceReassessed
          ? request<{ intake: StatementIntakeView }>(
              'GET',
              `/api/statement-intake/${encodeURIComponent(source.id)}`,
            )
          : Promise.resolve(null),
      ]);
      if (document) {
        if (document.intake.id !== source.id || document.intake.accountId !== accountId)
          throw new Error('Die neu geprüfte Quelle passt nicht zu diesem Konto. Bitte neu laden.');
        setSource(document.intake);
        onSourceAdopt(document.intake);
        setSourceReviewDraft(null);
        setSourceReviewAcknowledged(false);
      }
      setCaptured(next);
      qc.setQueryData(stateQuery(accountId).queryKey, next);
      if (action.operation === 'configure' || !configDirty) {
        setFundingId(next.config?.fundingAccountId ?? '');
        setEnabled(next.config?.enabled ?? false);
      }
      await qc.invalidateQueries({ queryKey: [...KEY, accountId, 'candidates'] });
    } catch (cause) {
      setConflict(true);
      setError(errorText(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const key = () => crypto.randomUUID();
  const withSource = () => (configRevision ? { source: sourceCas(source), configRevision } : null);
  function confirmSettlement(amend = false) {
    const tuple = withSource();
    if (!tuple || !canConfirm || (legacyKey && !chosenLegacy)) return;
    const base = {
      ...tuple,
      key: key(),
      ...(chosenLegacy
        ? { legacy: { paymentId: chosenLegacy.paymentId, dueDate: chosenLegacy.dueDate } }
        : {}),
    };
    if (amend && settlement?.revision)
      void run({
        ...base,
        operation: 'amend',
        settlementId: settlement.id,
        expectedRevision: settlement.revision,
      });
    else if (!amend) void run({ ...base, operation: 'confirm' });
  }
  function confirmBonus() {
    const tuple = withSource();
    if (!tuple || !canConfirm || !evidenceResult.success) return;
    if (editingBonus && bonus?.revision)
      void run({
        ...tuple,
        key: key(),
        operation: 'amend_bonus',
        bonusId: bonus.id,
        expectedRevision: bonus.revision,
        evidence: evidenceResult.data,
      });
    else
      void run({ ...tuple, key: key(), operation: 'confirm_bonus', evidence: evidenceResult.data });
  }
  function reassessRepresentedBonus() {
    const tuple = withSource();
    if (
      !tuple ||
      !canConfirm ||
      settlement ||
      bonus?.state !== 'represented' ||
      !bonus.revision ||
      !sourceReviewDraft ||
      !sourceReviewAcknowledged ||
      !sourceReviewComplete ||
      !sourceReviewFacts?.success
    )
      return;
    void run({
      ...tuple,
      key: key(),
      operation: 'amend_bonus',
      bonusId: bonus.id,
      expectedRevision: bonus.revision,
      evidence: bonus.evidence,
      sourceReview: { acknowledged: true, facts: sourceReviewFacts.data },
    });
  }
  async function undo(groupId: string) {
    if (
      blocked ||
      dirty ||
      retry ||
      !window.confirm(
        'Diese ganze Aktion rückgängig machen? Unabhängige andere Buchungen bleiben erhalten.',
      )
    )
      return;
    setBusy(true);
    try {
      const undone = await write(
        () => undoGroup(groupId),
        () => 'Aktion rückgängig gemacht. Aktueller Stand wird geladen.',
        sourceHistory,
      );
      if (undone) {
        try {
          await adoptLatestSource();
        } catch (cause) {
          markHistoryConflict(cause);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  if (source.accountId !== accountId)
    return <p role="alert">Die Quelle passt nicht zu diesem Konto.</p>;
  return (
    <section
      className="statement-settlement-727"
      aria-label="Abrechnungsausgleich"
      aria-busy={busy}
    >
      <div className="statement-actions-727">
        <Button variant="ghost" disabled={busy} onClick={onBack}>
          Zur Dokumentprüfung
        </Button>
      </div>
      <p>
        Nur die bereits ausgestellte Abrechnung wird ausgeglichen. Neuere Käufe bleiben offen.
        Angenommene Beträge, Bonus und Zahlungen bleiben getrennt nachvollziehbar.
      </p>
      {accounts.isError && (
        <ErrorNote what="Konten" error={accounts.error} onRetry={() => void accounts.refetch()} />
      )}
      {lookups.isError && (
        <ErrorNote
          what="Ausgabenkategorien"
          error={lookups.error}
          onRetry={() => void lookups.refetch()}
        />
      )}
      {current.isPending && <LoadingNote what="Abrechnungsausgleich" />}
      {current.isError && (
        <ErrorNote
          what="Abrechnungsausgleich"
          error={current.error}
          onRetry={() => void current.refetch()}
        />
      )}
      {(stale || conflict) && (
        <p role="alert">
          Der Stand hat sich geändert. Ihre Angaben bleiben erhalten. Bitte neu laden und
          ausdrücklich prüfen.
        </p>
      )}
      {error && <p role="alert">{maskMoneyText(error)}</p>}
      {retry && (
        <Button disabled={busy} onClick={() => void run(retry)}>
          Dieselbe Aktion erneut senden
        </Button>
      )}
      <Button variant="ghost" disabled={busy} onClick={() => void reload()}>
        Aktuellen Ausgleichsstand laden
      </Button>
      {!eligible && !accounts.isPending && (
        <p role="alert">
          Offene Kreditkarte erforderlich. Das Gegenkonto muss ein offenes Giro- oder Sparkonto
          derselben Währung und Budgetzuordnung sein.
        </p>
      )}
      {captured && (
        <>
          <h3>Abrechnung und Quelle</h3>
          <p>
            {fields?.reference.value ?? 'Abrechnungsnummer fehlt'} ·{' '}
            {fields?.issueDate.value ? longDay(fields.issueDate.value) : 'Ausstellungsdatum fehlt'}
          </p>
          <p>
            Ausgestellter Zahlbetrag:{' '}
            {fields?.payableCents.value === null || !fields?.currency.value
              ? 'nicht verfügbar'
              : nativeCurrency(fields.payableCents.value, fields.currency.value)}{' '}
            · Einzug: {fields?.debitDate.value ? longDay(fields.debitDate.value) : 'nicht bekannt'}
          </p>
          <p>
            Zahlbetrag:{' '}
            {fields?.payableCents.origin === 'owner'
              ? 'manuell geprüft'
              : fields?.payableCents.origin === 'printed'
                ? 'im PDF erkannt'
                : 'nicht verfügbar'}
            . Einzug:{' '}
            {fields?.debitDate.origin === 'owner'
              ? 'manuell geprüft'
              : fields?.debitDate.origin === 'printed'
                ? 'im PDF erkannt'
                : 'nicht verfügbar'}
            .
          </p>
          <a
            className="btn btn-ghost"
            href={`/api/receipts/${encodeURIComponent(source.receiptId)}/download`}
          >
            Original-PDF herunterladen
          </a>
          {!reviewed && (
            <p role="status">
              Zuerst vollständige Dokumentangaben einschließlich Referenz und Einzugstermin
              ausdrücklich prüfen. Es wurde nichts gebucht.
            </p>
          )}
          <fieldset disabled={busy || conflict || retry !== null || stale || !eligible}>
            <legend>Abrechnungsausgleich ausdrücklich einrichten</legend>
            <p>
              Diese Auswahl allein erstellt keine Buchung. Angenommene Abrechnungen behalten ihr
              ursprüngliches Gegenkonto.
            </p>
            <Field label="Ausgleich von Konto">
              {({ id }) => (
                <Select
                  id={id}
                  value={fundingId}
                  onChange={(e) => {
                    setFundingId(e.target.value);
                    changed('config');
                  }}
                >
                  <option value="">Giro- oder Sparkonto wählen</option>
                  {eligibleFunding.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <label className="statement-choice-727">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => {
                  setEnabled(e.target.checked);
                  changed('config');
                }}
              />
              Ausgleich für neue Abrechnungen aktivieren
            </label>
            <Button
              disabled={
                !eligibleFunding.some((a) => a.id === fundingId) ||
                Boolean(captured.config && !captured.config.revision)
              }
              onClick={() =>
                void run({
                  operation: 'configure',
                  key: key(),
                  cardAccountId: accountId,
                  fundingAccountId: fundingId,
                  enabled,
                  expectedRevision: captured.config?.revision ?? null,
                })
              }
            >
              Ausgleichseinstellung speichern
            </Button>
          </fieldset>
          {configDirty && (
            <p role="status">
              Die Kontoeinstellung ist noch nicht gespeichert. Vor dem Annehmen oder Buchen
              speichern oder den aktuellen Stand laden.
            </p>
          )}
          <fieldset disabled={!canConfirm}>
            <legend>Ausgestellten Zahlbetrag annehmen</legend>
            <Field label="Ersetzt genau eine wiederkehrende Zahlung (optional)">
              {({ id }) => (
                <Select
                  id={id}
                  value={legacyKey}
                  onChange={(e) => {
                    setLegacyKey(e.target.value);
                    changed('choice');
                  }}
                >
                  <option value="">Keine Zahlung ersetzen</option>
                  {legacy.map((o) => (
                    <option
                      key={`${o.paymentId}|${o.dueDate}`}
                      value={`${o.paymentId}|${o.dueDate}`}
                    >
                      {o.name} · {longDay(o.dueDate)} · {nativeCurrency(o.amountCents, o.currency)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {occurrences.isError && (
              <ErrorNote
                what="Wiederkehrende Zahlungen"
                error={occurrences.error}
                onRetry={() => void occurrences.refetch()}
              />
            )}
            {legacyKey && !chosenLegacy && (
              <p role="alert">
                Die gewählte Zahlung ist nicht mehr verfügbar. Auswahl ausdrücklich neu prüfen.
              </p>
            )}
            {!settlement && (
              <Button
                disabled={Boolean(legacyKey && !chosenLegacy)}
                onClick={() => confirmSettlement()}
              >
                Abrechnung annehmen · ohne Buchung
              </Button>
            )}
            {settlement && settlement.state !== 'represented' && (
              <Button
                disabled={Boolean(legacyKey && !chosenLegacy)}
                onClick={() => confirmSettlement(true)}
              >
                Abrechnung durch geprüfte Quelle ersetzen
              </Button>
            )}
          </fieldset>
          <fieldset disabled={blocked}>
            <legend>Status für neue Buchungen</legend>
            <Field label="Status der neuen Buchung">
              {({ id }) => (
                <Select
                  id={id}
                  value={intent}
                  onChange={(e) => {
                    setIntent(e.target.value === 'confirmed' ? 'confirmed' : 'pending');
                    changed('choice');
                  }}
                >
                  <option value="pending">Vorgemerkt</option>
                  <option value="confirmed">Bestätigt</option>
                </Select>
              )}
            </Field>
          </fieldset>
          {settlement && (
            <section aria-label="Angenommener Ausgleich">
              <h3>{STATUS[settlement.state]}</h3>
              <p>
                {nativeCurrency(settlement.payableCents, settlement.currency)} ·{' '}
                {longDay(settlement.debitDate)} ·{' '}
                {accounts.data?.accounts.find((a) => a.id === settlement.fundingAccountId)?.name ??
                  'Ursprüngliches Gegenkonto'}
              </p>
              {settlement.state === 'zero' && <p>Der bekannte Nullbetrag erzeugt keine Zahlung.</p>}
              {settlement.state === 'credit_manual' && (
                <p>
                  Dieses Guthaben wird nicht automatisch ausgezahlt.{' '}
                  <AppLink
                    className="btn btn-ghost"
                    to={`/konten/${accountId}`}
                    search={{ panel: 'buchung' }}
                    onClick={(event) => {
                      if (!onManual()) event.preventDefault();
                    }}
                  >
                    Manuelle Buchung öffnen
                  </AppLink>
                </p>
              )}
              {settlement.state === 'open' && (
                <fieldset disabled={blocked || !canConfirm || !settlement.revision}>
                  <legend>Separate Zahlungsbuchung</legend>
                  <p>
                    Der Betrag ist fest angenommen. Kein erneuter Abzug eines Bonus. Eine Buchung
                    ist kein Nachweis des Bankeinzugs.
                  </p>

                  <Button
                    onClick={() => {
                      const tuple = withSource();
                      if (tuple && settlement.revision)
                        void run({
                          ...tuple,
                          key: key(),
                          operation: 'create_transfer',
                          settlementId: settlement.id,
                          expectedRevision: settlement.revision,
                          status: intent,
                        });
                    }}
                  >
                    Umbuchung erstellen
                  </Button>
                  <CandidateChoices
                    key={`transfer:${settlement.id}`}
                    accountId={accountId}
                    kind="transfer"
                    targetId={settlement.id}
                    selected={new Set(chosenTransfer ? [candidateId(chosenTransfer)] : [])}
                    onChoose={(c) => {
                      if (c.kind === 'transfer') {
                        setChosenTransfer(
                          chosenTransfer?.selection.transferId === c.selection.transferId
                            ? null
                            : c,
                        );
                        changed('choice');
                      }
                    }}
                  />
                  <Button
                    disabled={!chosenTransfer}
                    onClick={() => {
                      const tuple = withSource();
                      if (tuple && settlement.revision && chosenTransfer)
                        void run({
                          ...tuple,
                          key: key(),
                          operation: 'link_transfer',
                          settlementId: settlement.id,
                          expectedRevision: settlement.revision,
                          ...chosenTransfer.selection,
                        });
                    }}
                  >
                    Ausgewählte Umbuchung zuordnen
                  </Button>
                </fieldset>
              )}
              {settlement.state !== 'represented' && settlement.revision && (
                <Button
                  disabled={blocked}
                  variant="ghost"
                  onClick={() =>
                    void run({
                      operation: 'withdraw',
                      key: key(),
                      settlementId: settlement.id,
                      expectedRevision: settlement.revision!,
                    })
                  }
                >
                  Annahme zurücknehmen · Bonus bleibt getrennt
                </Button>
              )}
              {settlement.state === 'represented' && settlement.actionGroupId && (
                <Button
                  variant="ghost"
                  disabled={blocked || dirty}
                  onClick={() => void undo(settlement.actionGroupId!)}
                >
                  {settlement.representationKind === 'linked'
                    ? 'Zahlungszuordnung aufheben'
                    : 'Erstellte Zahlung rückgängig machen'}
                </Button>
              )}
            </section>
          )}
          <fieldset disabled={blocked || !canConfirm || lookups.isError || lookups.isFetching}>
            <legend>Bonus separat prüfen</legend>
            <p>
              Nur ausdrücklich nachgewiesene Gutschriften. Bruttokäufe bleiben unverändert; ein
              bereits enthaltener Rabatt wird nicht nochmals gutgeschrieben. Aus Differenzen wird
              kein Bonus berechnet.
            </p>
            <Field label="Geprüfter Bonusbetrag">
              {({ id }) => (
                <TextInput
                  id={id}
                  inputMode="decimal"
                  money
                  value={bonusAmount}
                  onChange={(e) => {
                    setBonusAmount(e.target.value);
                    changed('bonus');
                  }}
                />
              )}
            </Field>
            <Field
              label="Datum der Gutschrift"
              error={
                bonusDirty &&
                !evidenceResult.success &&
                evidenceResult.error.issues.some((issue) => issue.path[0] === 'creditDate')
                  ? 'Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben.'
                  : undefined
              }
              hint="TT.MM.JJJJ; keine Übernahme von Ausstellungs- oder Einzugsdatum."
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  type="text"
                  inputMode="text"
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  value={creditDate}
                  placeholder="TT.MM.JJJJ"
                  onChange={(e) => {
                    setCreditDate(e.target.value);
                    changed('bonus');
                  }}
                />
              )}
            </Field>
            <Field label="Behandlung des Bonus">
              {({ id }) => (
                <Select
                  id={id}
                  value={treatment}
                  onChange={(e) => {
                    setTreatment(
                      e.target.value === 'already_net'
                        ? 'already_net'
                        : e.target.value === 'gross_then_credit'
                          ? 'gross_then_credit'
                          : '',
                    );
                    changed('bonus');
                  }}
                >
                  <option value="">Behandlung ausdrücklich wählen</option>
                  <option value="gross_then_credit">Bruttokäufe und separate Gutschrift</option>
                  <option value="already_net">
                    Bereits im Nettobetrag enthalten · nicht buchen
                  </option>
                </Select>
              )}
            </Field>
            <h4>Ursprüngliche Käufe ausdrücklich auswählen</h4>
            <CandidateChoices
              key={`original:${bonus?.id ?? 'new'}:${editingBonus ?? 'none'}`}
              accountId={accountId}
              kind="original"
              targetId={editingBonus ?? undefined}
              selected={new Set(originals.map(candidateId))}
              onChoose={(c) => {
                if (c.kind !== 'original') return;
                if (
                  originals.length >= 50 &&
                  !originals.some((o) => candidateId(o) === candidateId(c))
                ) {
                  setError(
                    'Höchstens 50 Originale auswählen. Kein weiterer Eintrag wurde übernommen.',
                  );
                  return;
                }
                setOriginals((old) =>
                  old.some((o) => candidateId(o) === candidateId(c))
                    ? old.filter((o) => candidateId(o) !== candidateId(c))
                    : [...old, c],
                );
                changed('bonus');
              }}
            />
            <p>
              Ausgewählte Originale: {originals.length} von höchstens 50. Auswahl bleibt beim
              Seitenwechsel erhalten.
            </p>
            {originals.map((c) => (
              <p key={candidateId(c)}>
                {longDay(c.date)} · {categoryName(c.selection.categoryId)} · unverändert{' '}
                {nativeCurrency(c.selection.splitAmountCents, c.selection.currency)}
              </p>
            ))}
            {affectedCategories.map((id) => (
              <Field key={id} label={`Bonusanteil · ${categoryName(id)}`}>
                {({ id: input }) => (
                  <TextInput
                    id={input}
                    inputMode="decimal"
                    money
                    value={allocationAmounts[id] ?? ''}
                    onChange={(e) => {
                      setAllocationAmounts({ ...allocationAmounts, [id]: e.target.value });
                      changed('bonus');
                    }}
                  />
                )}
              </Field>
            ))}
            <label className="statement-choice-727">
              <input
                type="checkbox"
                checked={reviewedCredits}
                onChange={(e) => {
                  setReviewedCredits(e.target.checked);
                  changed('bonus');
                }}
              />
              Bestehende Gutschriften geprüft; keine doppelte Zuordnung
            </label>
            <label className="statement-choice-727">
              <input
                type="checkbox"
                checked={reviewedFees}
                onChange={(e) => {
                  setReviewedFees(e.target.checked);
                  changed('bonus');
                }}
              />
              Gebühren und andere Anpassungen ausdrücklich geprüft
            </label>
            {!evidenceResult.success && dirty && (
              <p role="status">
                Positiven Betrag, gültiges Datum, Originale und ausdrücklich zugeordnete
                Kategorieanteile vollständig prüfen. Es wurde nichts berechnet oder gebucht.
              </p>
            )}
            <Button
              disabled={!evidenceResult.success || (Boolean(bonus) && !editingBonus)}
              onClick={confirmBonus}
            >
              {editingBonus
                ? 'Bonusnachweis ausdrücklich ersetzen'
                : 'Bonusnachweis annehmen · ohne Buchung'}
            </Button>
          </fieldset>
          {bonus && (
            <section aria-label="Angenommener Bonus">
              <h3>{STATUS[bonus.state]}</h3>
              <p>
                {nativeCurrency(bonus.bonusCents, bonus.currency)} · {longDay(bonus.creditDate)} ·
                manuell anhand der Quelle geprüft
              </p>
              <ul aria-label="Angenommener unveränderter Originalaufwand">
                {bonus.evidence.selectedOriginals.map((o) => (
                  <li key={o.splitId}>
                    {categoryName(o.categoryId)} · {nativeCurrency(o.splitAmountCents, o.currency)}
                  </li>
                ))}
              </ul>
              <ul aria-label="Angenommene Gutschriftanteile">
                {bonus.evidence.allocations.map((a) => (
                  <li key={a.categoryId}>
                    {categoryName(a.categoryId)} · {nativeCurrency(a.amountCents, bonus.currency)}
                  </li>
                ))}
              </ul>
              {bonus.state === 'ready' && (
                <fieldset disabled={blocked || !canConfirm || !bonus.revision}>
                  <legend>Separate Gutschrift buchen oder zuordnen</legend>
                  <p>
                    Neue Gutschrift mit dem oben gewählten Status:{' '}
                    {intent === 'pending' ? 'vorgemerkt' : 'bestätigt'}. Originalkäufe werden nicht
                    geändert.
                  </p>
                  <Button
                    onClick={() => {
                      const tuple = withSource();
                      if (tuple && bonus.revision)
                        void run({
                          ...tuple,
                          key: key(),
                          operation: 'create_bonus',
                          bonusId: bonus.id,
                          expectedRevision: bonus.revision,
                          selectedOriginals: bonus.evidence.selectedOriginals.map(
                            ({ bookingId, bookingRevision, splitId, splitRevision }) => ({
                              bookingId,
                              bookingRevision,
                              splitId,
                              splitRevision,
                            }),
                          ),
                          status: intent,
                        });
                    }}
                  >
                    Gutschrift erstellen
                  </Button>
                  <CandidateChoices
                    key={`credit:${bonus.id}`}
                    accountId={accountId}
                    kind="credit"
                    targetId={bonus.id}
                    selected={new Set(chosenCredit ? [candidateId(chosenCredit)] : [])}
                    onChoose={(c) => {
                      if (c.kind === 'credit') {
                        setChosenCredit(
                          chosenCredit?.selection.bookingId === c.selection.bookingId ? null : c,
                        );
                        changed('choice');
                      }
                    }}
                  />
                  <Button
                    disabled={!chosenCredit}
                    onClick={() => {
                      const tuple = withSource();
                      if (tuple && bonus.revision && chosenCredit)
                        void run({
                          ...tuple,
                          key: key(),
                          operation: 'link_bonus',
                          bonusId: bonus.id,
                          expectedRevision: bonus.revision,
                          selectedOriginals: bonus.evidence.selectedOriginals.map(
                            ({ bookingId, bookingRevision, splitId, splitRevision }) => ({
                              bookingId,
                              bookingRevision,
                              splitId,
                              splitRevision,
                            }),
                          ),
                          ...chosenCredit.selection,
                        });
                    }}
                  >
                    Ausgewählte Gutschrift zuordnen
                  </Button>
                </fieldset>
              )}
              {bonus.state === 'already_net' && (
                <p>Keine zusätzliche Gutschrift. Ungeklärte Differenzen bleiben offen.</p>
              )}
              {bonus.state !== 'represented' && bonus.revision && (
                <div className="statement-actions-727">
                  <Button
                    variant="ghost"
                    disabled={blocked}
                    onClick={() =>
                      void run({
                        operation: 'withdraw_bonus',
                        key: key(),
                        bonusId: bonus.id,
                        expectedRevision: bonus.revision!,
                      })
                    }
                  >
                    Bonusnachweis zurücknehmen · Zahlung bleibt getrennt
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={blocked}
                    onClick={() => {
                      setEditingBonus(bonus.id);
                      setBonusAmount(formatDecimal(cents(bonus.bonusCents)));
                      setCreditDate(longDay(bonus.creditDate));
                      setTreatment(bonus.evidence.treatment);
                      setOriginals([]);
                      setAllocationAmounts(
                        Object.fromEntries(
                          bonus.evidence.allocations.map((a) => [
                            a.categoryId,
                            formatDecimal(cents(a.amountCents)),
                          ]),
                        ),
                      );
                      setReviewedCredits(false);
                      setReviewedFees(false);
                      changed('bonus');
                    }}
                  >
                    Bonusnachweis erneut prüfen
                  </Button>
                </div>
              )}
              {bonus.state === 'represented' && (
                <>
                  <p>
                    Nur die Dokumentangaben können hier erneut geprüft werden. Die zugeordnete
                    Gutschrift, ihr Datum, ihre Kategorieanteile und die ursprünglichen Käufe
                    bleiben unverändert. Aus Differenzen wird kein neuer Bonus berechnet.
                  </p>
                  {settlement && (
                    <p role="status">
                      Diese Quelle hat auch eine angenommene Abrechnung. Deren Zuordnung oder
                      Annahme muss vor einer erneuten Quellenprüfung getrennt geprüft werden.
                    </p>
                  )}
                  {!sourceReviewDraft ? (
                    <Button
                      variant="ghost"
                      disabled={
                        !canConfirm ||
                        !!settlement ||
                        !bonus.revision ||
                        lookups.isError ||
                        lookups.isFetching ||
                        bonusDirty ||
                        choiceDirty
                      }
                      onClick={() => {
                        setSourceReviewDraft(sourceReviewDraftOf(source));
                        setSourceReviewAcknowledged(false);
                      }}
                    >
                      Quelle des zugeordneten Bonus erneut prüfen
                    </Button>
                  ) : (
                    <fieldset
                      disabled={
                        blocked ||
                        !canConfirm ||
                        !!settlement ||
                        lookups.isError ||
                        lookups.isFetching
                      }
                    >
                      <legend>Dokumentangaben erneut prüfen</legend>
                      <p>
                        Angaben am gespeicherten Original-PDF prüfen. Der ausgestellte Zahlbetrag
                        kommt aus der Abrechnung, nicht aus dem aktuellen Kartensaldo. Die
                        zugeordnete Gutschrift wird nicht erneut gebucht.
                      </p>
                      {SOURCE_REVIEW_FIELDS.map(([name, label, maxLength]) => (
                        <Field key={name} label={label} error={sourceFieldError(name)}>
                          {({ id, describedBy, invalid }) => (
                            <TextInput
                              id={id}
                              aria-describedby={describedBy}
                              aria-invalid={invalid}
                              value={sourceReviewDraft[name]}
                              maxLength={maxLength}
                              onChange={(event) =>
                                setSourceReviewDraft((old) =>
                                  old
                                    ? {
                                        ...old,
                                        [name]:
                                          name === 'currency'
                                            ? event.target.value.toUpperCase()
                                            : event.target.value,
                                      }
                                    : old,
                                )
                              }
                            />
                          )}
                        </Field>
                      ))}
                      <Field
                        label="Ausgestellter Zahlbetrag"
                        error={
                          sourceReviewDraft.amount.trim() && !sourceAmount?.ok
                            ? 'Bitte einen gültigen Betrag eingeben.'
                            : sourceFieldError('payableCents')
                        }
                        hint="Betrag der ausgestellten Abrechnung; 0 ist eine ausdrückliche Angabe."
                      >
                        {({ id, describedBy, invalid }) => (
                          <TextInput
                            id={id}
                            money
                            inputMode="decimal"
                            aria-describedby={describedBy}
                            aria-invalid={invalid}
                            value={sourceReviewDraft.amount}
                            onChange={(event) =>
                              setSourceReviewDraft((old) =>
                                old ? { ...old, amount: event.target.value } : old,
                              )
                            }
                          />
                        )}
                      </Field>
                      {!sourceReviewComplete && (
                        <p role="status">
                          Abrechnungsnummer, gültiges Ausstellungs- und Einzugsdatum, Zahlbetrag
                          und passende Währung sind erforderlich. Weitere Angaben leer lassen,
                          wenn sie im Original nicht belegt sind.
                        </p>
                      )}
                      <label className="statement-choice-727">
                        <input
                          type="checkbox"
                          checked={sourceReviewAcknowledged}
                          onChange={(event) =>
                            setSourceReviewAcknowledged(event.target.checked)
                          }
                        />
                        Original erneut geprüft; bestehende Gutschrift und Käufe bleiben unverändert.
                      </label>
                      <div className="statement-actions-727">
                        <Button
                          disabled={!sourceReviewComplete || !sourceReviewAcknowledged}
                          onClick={reassessRepresentedBonus}
                        >
                          Dokumentnachweis ausdrücklich ersetzen
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setSourceReviewDraft(null);
                            setSourceReviewAcknowledged(false);
                          }}
                        >
                          Prüfung abbrechen
                        </Button>
                      </div>
                    </fieldset>
                  )}
                </>
              )}
              {bonus.state === 'represented' && bonus.actionGroupId && (
                <Button
                  variant="ghost"
                  disabled={blocked || dirty}
                  onClick={() => void undo(bonus.actionGroupId!)}
                >
                  Letzte Bonusaktion rückgängig machen
                </Button>
              )}
            </section>
          )}
          <details>
            <summary>Frühere Annahmen und Nachweise</summary>
            {[...(current.data?.settlements ?? []), ...(current.data?.bonuses ?? [])].map((r) => (
              <p key={r.id}>
                {r.reference} · {longDay(r.issueDate)} · {STATUS[r.state]}{' '}
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void reload(r.sourceIntakeId)}
                >
                  Quelle dieser Annahme prüfen
                </Button>
              </p>
            ))}
          </details>
          <p>
            Nettoabrechnungen, unklare Differenzen und teilweise Gutschriften werden hier nicht
            automatisch abgestimmt.
          </p>
        </>
      )}
    </section>
  );
}
