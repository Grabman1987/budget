import {
  AmountInput,
  Button,
  DetailPanel,
  Field,
  SectionHead,
  Select,
  Switch,
  TextInput,
  cx,
  maskMoneyText,
  useAmountPrivacy,
} from '@budget/ui';
import { cents, formatDecimal, parseAmount } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/http';
import { useBudgetWrite } from '../budget/use-category-writes';
import { AccountFormPanel, percentToBp } from '../ledger/account-form';
import { groupAccounts } from '../ledger/account-groups';
import { useOrderedAccounts, useReorder } from '../ledger/account-order';
import { closeAccount, patchAccount, reopenAccount, type AccountInput } from '../ledger/api';
import { ACCOUNT_TYPE_LABEL, errorText, groupOf, type AccountGroup } from '../ledger/labels';
import { nativeCurrency } from '../ledger/format';
import { accountsQuery } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { ACCOUNT_TYPES, type AccountRow, type AccountType } from '../ledger/types';
import { KONTEN_SETTINGS_META } from '../nav/pages';
import { PageFrame } from './placeholder-page';
import { assetClassesQuery } from '../wealth/portfolio-api';
import '../ledger/account-order.css';
import './accounts-settings.css';

/** Types that are never Budget-Konten (server rule): the switch is off and locked. */
const TRACKING_ONLY: ReadonlySet<AccountType> = new Set([
  'loan',
  'brokerage',
  'crypto',
  'p2p',
  'receivable',
  'other_asset',
  'other_liability',
]);
const DEFAULT_ON_BUDGET: Partial<Record<AccountType, boolean>> = {
  checking: true,
  cash: true,
  savings: true,
  credit_card: true,
};

const hasOverdraft = (t: AccountType) => t === 'checking';
const hasCreditLimit = (t: AccountType) => t === 'credit_card';
const hasRate = (t: AccountType) => t === 'savings' || t === 'loan' || t === 'other_liability';
const hasFee = (t: AccountType) => t === 'checking' || t === 'credit_card' || t === 'loan';
const isLoan = (t: AccountType) => t === 'loan';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const moneyText = (value: number | null) => (value === null ? '' : formatDecimal(cents(value)));
const rateText = (bp: number | null) => (bp === null ? '' : formatDecimal(cents(bp)));

/** Einstellungen › Konten: the accounts by group, their order, terms and closing. */
export function AccountsSettingsPage() {
  useAmountPrivacy();
  return (
    <PageFrame meta={KONTEN_SETTINGS_META} revealCurrentRegister>
      <AccountsSettings />
    </PageFrame>
  );
}

export function AccountsSettings() {
  useAmountPrivacy();
  const query = useQuery(accountsQuery());
  const ordered = useOrderedAccounts(query.data?.accounts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const accounts = ordered.accounts ?? [];
  const open = accounts.filter((a) => !a.closedAt);
  const closed = accounts.filter((a) => a.closedAt);
  const editing = accounts.find((a) => a.id === editingId) ?? null;
  const groups = groupAccounts(open);
  return (
    <section className="accounts-settings" aria-labelledby="accounts-settings-title">
      <SectionHead
        id="accounts-settings-title"
        title="Konten"
        aside={
          <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
            Konto anlegen
          </Button>
        }
      />
      <p className="accounts-purpose">
        Hier pflegst du Name, Typ, Reihenfolge und Konditionen deiner Konten. Bei Krediten bilden
        Zinssatz, Monatsrate, Laufzeit und ursprünglicher Betrag die Grundlage für den
        Schuldenrechner unter Vermögen und den Report Bank- und Zinskosten. Jede Änderung ist
        protokolliert und lässt sich rückgängig machen.
      </p>
      {query.isPending && <LoadingNote what="Konten" />}
      {query.isError && (
        <ErrorNote what="Konten" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.data && accounts.length === 0 && (
        <p className="vnote" role="status">
          Noch keine Konten angelegt.
        </p>
      )}
      {groups.map(({ group, accounts: members }) => (
        <AccountGroupList
          key={group.id}
          group={group}
          accounts={members}
          onEdit={setEditingId}
          onReorder={(ids) => ordered.save(group.id, ids)}
        />
      ))}
      {closed.length > 0 && <ClosedAccounts accounts={closed} onEdit={setEditingId} />}
      <AccountEditPanel account={editing} onClose={() => setEditingId(null)} />
      <AccountFormPanel open={creating} onClose={() => setCreating(false)} />
    </section>
  );
}

function AccountGroupList({
  group,
  accounts,
  onEdit,
  onReorder,
}: {
  group: AccountGroup;
  accounts: AccountRow[];
  onEdit: (id: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  useAmountPrivacy();
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const reorder = useReorder(
    accounts.map((a) => a.id),
    onReorder,
    (id) => names.get(id) ?? '',
  );
  const titleId = `accounts-group-${group.id}`;
  return (
    <section className="accounts-group" aria-labelledby={titleId}>
      <h3 id={titleId}>
        {group.title}
        <small>{group.sub}</small>
      </h3>
      {reorder.status}
      <ul className="accounts-list">
        {accounts.map((a) => {
          const row = reorder.rowProps(a.id);
          return (
            <li {...row} className={cx(row.className, 'accounts-row')} key={a.id}>
              <span className="accounts-name">
                <strong>{a.name}</strong>
                <small>
                  {ACCOUNT_TYPE_LABEL[a.type]} · {a.currency}
                  {a.type === 'loan' && termsSummary(a) ? ` · ${termsSummary(a)}` : ''}
                </small>
              </span>
              <span className="accounts-actions">
                {reorder.controls(a.id)}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${a.name} bearbeiten`}
                  onClick={() => onEdit(a.id)}
                >
                  Bearbeiten
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "6,32 % fix · Rate 412,00 €" for a loan row, empty without terms. */
function termsSummary(a: AccountRow): string {
  const parts = [
    a.interestRateBp !== null
      ? `${formatDecimal(cents(a.interestRateBp))} %${
          a.interestKind ? (a.interestKind === 'fixed' ? ' fix' : ' variabel') : ''
        }`
      : null,
    a.installmentCents !== null ? `Rate ${nativeCurrency(a.installmentCents, a.currency)}` : null,
  ].filter((p): p is string => p !== null);
  return parts.join(' · ');
}

function ClosedAccounts({
  accounts,
  onEdit,
}: {
  accounts: AccountRow[];
  onEdit: (id: string) => void;
}) {
  const write = useBudgetWrite();
  return (
    <section className="accounts-group" aria-labelledby="accounts-group-closed">
      <h3 id="accounts-group-closed">
        Geschlossene Konten<small>Buchungen und Verlauf bleiben erhalten</small>
      </h3>
      <ul className="accounts-list">
        {accounts.map((a) => (
          <li className="accounts-row" key={a.id}>
            <span className="accounts-name">
              <strong>{a.name}</strong>
              <small>{ACCOUNT_TYPE_LABEL[a.type]}</small>
            </span>
            <span className="accounts-actions">
              <Button variant="ghost" size="sm" onClick={() => onEdit(a.id)}>
                Bearbeiten
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`${a.name} wieder öffnen`}
                onClick={() =>
                  void write(
                    () => reopenAccount(a.id),
                    () => `Konto „${a.name}“ wieder geöffnet.`,
                  )
                }
              >
                Wieder öffnen
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AccountEditPanel({
  account,
  onClose,
}: {
  account: AccountRow | null;
  onClose: () => void;
}) {
  useAmountPrivacy();
  return (
    <DetailPanel open={account !== null} onClose={onClose} title="Konto bearbeiten">
      {account && <AccountEditForm key={account.id} account={account} onDone={onClose} />}
    </DetailPanel>
  );
}

type Errors = Partial<
  Record<
    | 'name'
    | 'limit'
    | 'overdraft'
    | 'fee'
    | 'rate'
    | 'installment'
    | 'original'
    | 'termStart'
    | 'termEnd',
    string
  >
>;

function AccountEditForm({ account, onDone }: { account: AccountRow; onDone: () => void }) {
  useAmountPrivacy();
  const write = useBudgetWrite();
  const classes = useQuery(assetClassesQuery());
  const [allocationClass, setAllocationClass] = useState(account.allocationAssetClassId ?? '');
  const [name, setName] = useState(account.name);
  const [type, setType] = useState<AccountType>(account.type);
  const [onBudget, setOnBudget] = useState(account.onBudget);
  const [limit, setLimit] = useState(moneyText(account.creditLimitCents));
  const [overdraft, setOverdraft] = useState(moneyText(account.overdraftLimitCents));
  const [fee, setFee] = useState(moneyText(account.monthlyFeeCents));
  const [rate, setRate] = useState(rateText(account.interestRateBp));
  const [kind, setKind] = useState<'' | 'fixed' | 'variable'>(account.interestKind ?? '');
  const [installment, setInstallment] = useState(moneyText(account.installmentCents));
  const [original, setOriginal] = useState(moneyText(account.originalAmountCents));
  const [termStart, setTermStart] = useState(account.termStart ?? '');
  const [termEnd, setTermEnd] = useState(account.termEnd ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [confirmClose, setConfirmClose] = useState<string>();
  const [busy, setBusy] = useState(false);
  const group = groupOf({ type, onBudget });

  const changeType = (next: AccountType) => {
    setType(next);
    setOnBudget(DEFAULT_ON_BUDGET[next] ?? false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found: Errors = {};
    const patch: Partial<AccountInput> = {};
    if ((allocationClass || null) !== (account.allocationAssetClassId ?? null))
      patch.allocationAssetClassId = allocationClass || null;
    const trimmed = name.trim();
    if (trimmed === '') found.name = 'Bitte einen Namen eintragen.';
    else if (trimmed !== account.name) patch.name = trimmed;
    if (type !== account.type) {
      patch.type = type;
      patch.onBudget = onBudget;
    } else if (onBudget !== account.onBudget) patch.onBudget = onBudget;

    /** Empty clears the term (null); a non-negative amount sets it. */
    const money = (
      text: string,
      key: keyof Errors,
      prev: number | null,
      field:
        | 'creditLimitCents'
        | 'overdraftLimitCents'
        | 'monthlyFeeCents'
        | 'installmentCents'
        | 'originalAmountCents',
    ) => {
      if (text.trim() === '') {
        if (prev !== null) patch[field] = null;
        return;
      }
      const parsed = parseAmount(text);
      if (!parsed.ok) found[key] = 'Das lässt sich nicht ausrechnen.';
      else if (parsed.cents < 0) found[key] = 'Der Betrag darf nicht negativ sein.';
      else if (parsed.cents !== prev) patch[field] = parsed.cents;
    };
    if (hasCreditLimit(type)) money(limit, 'limit', account.creditLimitCents, 'creditLimitCents');
    if (hasOverdraft(type))
      money(overdraft, 'overdraft', account.overdraftLimitCents, 'overdraftLimitCents');
    if (hasFee(type)) money(fee, 'fee', account.monthlyFeeCents, 'monthlyFeeCents');
    if (hasRate(type)) {
      const bp = percentToBp(rate);
      if (Number.isNaN(bp)) found.rate = 'Zinssatz in Prozent, z. B. 3,5.';
      else if (bp !== account.interestRateBp) patch.interestRateBp = bp;
    }
    if (isLoan(type)) {
      if ((kind || null) !== account.interestKind) patch.interestKind = kind || null;
      money(installment, 'installment', account.installmentCents, 'installmentCents');
      money(original, 'original', account.originalAmountCents, 'originalAmountCents');
      if (termStart !== '' && !DAY.test(termStart)) found.termStart = 'Bitte ein Datum wählen.';
      else if ((termStart || null) !== account.termStart) patch.termStart = termStart || null;
      if (termEnd !== '' && !DAY.test(termEnd)) found.termEnd = 'Bitte ein Datum wählen.';
      else if ((termEnd || null) !== account.termEnd) patch.termEnd = termEnd || null;
      if (termStart && termEnd && DAY.test(termStart) && DAY.test(termEnd) && termEnd < termStart)
        found.termEnd = 'Das Laufzeitende liegt vor dem Beginn.';
    }
    setErrors(found);
    setFormError(undefined);
    if (Object.keys(found).length > 0) return;
    if (Object.keys(patch).length === 0) {
      onDone();
      return;
    }
    setBusy(true);
    try {
      const result = await write(
        () => patchAccount(account.id, patch),
        () => `Konto „${patch.name ?? account.name}“ gespeichert.`,
      );
      if (result) onDone();
    } finally {
      setBusy(false);
    }
  };

  const close = async (force: boolean) => {
    setBusy(true);
    setFormError(undefined);
    try {
      await closeAccount(account.id, force).then(async (result) => {
        // Reuse the write helper's toast and refresh for the already completed call.
        await write(
          () => Promise.resolve(result),
          () => `Konto „${account.name}“ geschlossen.`,
        );
        onDone();
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'account_not_empty')
        setConfirmClose(
          'Das Konto hat noch einen Saldo, vorgemerkte oder geplante Buchungen. Trotzdem schließen? Die Buchungen bleiben erhalten, das Konto verschwindet aus den Listen.',
        );
      else setFormError(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="kform" onSubmit={(e) => void submit(e)} noValidate>
      <Field label="Name" error={errors.name}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            value={name}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <Field label="Kontotyp" hint={`Gruppe in Seitenleiste und Übersicht: ${group.title}.`}>
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={type}
            onChange={(e) => changeType(e.target.value as AccountType)}
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {group.id === 'investments' ? (
        <Field label="Anlageklasse" hint="P2P und Cash-Positionen werden dieser Klasse zugeordnet.">
          {({ id }) => (
            <Select
              id={id}
              value={allocationClass}
              disabled={classes.isPending || classes.isError}
              onChange={(e) => setAllocationClass(e.target.value)}
            >
              <option value="">Ohne Anlageklasse</option>
              {classes.data?.assetClasses
                .filter((c) => !c.isGroup)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
      ) : null}
      {classes.isError && (
        <ErrorNote
          what="Anlageklassen"
          error={classes.error}
          onRetry={() => void classes.refetch()}
        />
      )}
      <div className="kform-switch">
        <span id="settings-on-budget-label">
          Budget-Konto
          <small>
            {TRACKING_ONLY.has(type)
              ? 'Dieser Typ zählt nur zum Vermögen, nie zum verteilbaren Geld.'
              : 'Der Saldo zählt zu Zu verteilen.'}
          </small>
        </span>
        <Switch
          labelledBy="settings-on-budget-label"
          checked={onBudget}
          disabled={TRACKING_ONLY.has(type)}
          onChange={setOnBudget}
        />
      </div>
      {hasCreditLimit(type) && (
        <AmountInput label="Kartenlimit" value={limit} onChange={setLimit} error={errors.limit} />
      )}
      {hasOverdraft(type) && (
        <AmountInput
          label="Überziehungsrahmen"
          value={overdraft}
          onChange={setOverdraft}
          error={errors.overdraft}
        />
      )}
      {hasRate(type) && (
        <Field label="Zinssatz in Prozent" error={errors.rate}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              inputMode="decimal"
              value={rate}
              placeholder="3,5"
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(e) => setRate(e.target.value)}
            />
          )}
        </Field>
      )}
      {isLoan(type) && (
        <>
          <Field
            label="Zinsart"
            hint="Fix: Zinssatz gilt für die ganze Laufzeit. Variabel: der Satz kann sich ändern."
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={kind}
                onChange={(e) => setKind(e.target.value as '' | 'fixed' | 'variable')}
              >
                <option value="">keine Angabe</option>
                <option value="fixed">Fix</option>
                <option value="variable">Variabel</option>
              </Select>
            )}
          </Field>
          <AmountInput
            label="Monatsrate"
            value={installment}
            onChange={setInstallment}
            error={errors.installment}
          />
          <AmountInput
            label="Ursprünglicher Kreditbetrag"
            value={original}
            onChange={setOriginal}
            error={errors.original}
          />
          <div className="kform-pair">
            <Field label="Laufzeit ab" error={errors.termStart}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  type="date"
                  value={termStart}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  onChange={(e) => setTermStart(e.target.value)}
                />
              )}
            </Field>
            <Field label="Laufzeit bis" error={errors.termEnd}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  type="date"
                  value={termEnd}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  onChange={(e) => setTermEnd(e.target.value)}
                />
              )}
            </Field>
          </div>
        </>
      )}
      {hasFee(type) && (
        <AmountInput label="Monatliche Gebühr" value={fee} onChange={setFee} error={errors.fee} />
      )}
      {formError && (
        <p className="field-error" role="alert">
          {maskMoneyText(formError)}
        </p>
      )}
      <div className="panel-actions">
        <Button type="submit" disabled={busy}>
          {busy ? 'Speichert …' : 'Speichern'}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={busy}>
          Abbrechen
        </Button>
        {!account.closedAt && (
          <Button variant="ghost" onClick={() => void close(false)} disabled={busy}>
            Konto schließen
          </Button>
        )}
      </div>
      {confirmClose && (
        <div className="settings-confirm" role="alert">
          <p>{confirmClose}</p>
          <Button variant="ghost" onClick={() => setConfirmClose(undefined)}>
            Abbrechen
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setConfirmClose(undefined);
              void close(true);
            }}
          >
            Trotzdem schließen
          </Button>
        </div>
      )}
    </form>
  );
}
