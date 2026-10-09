import {
  useAmountPrivacy,
  AmountInput,
  Button,
  Field,
  Select,
  Switch,
  TextInput,
  useToast,
  maskMoneyText,
} from '@budget/ui';
import { parseAmount, todayInVienna } from '@budget/domain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { createAccount, undoGroup, type AccountInput } from './api';
import { ACCOUNT_TYPE_LABEL, errorText } from './labels';
import { LEDGER_KEY } from './queries';
import { ACCOUNT_TYPES, type AccountType } from './types';
import { SettingsFormDialog } from '../pages/settings-form-dialog';

/** Types that can never be budget accounts (server rule); the switch is off and locked. */
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
const hasTerm = (t: AccountType) => t === 'loan';
const hasFee = (t: AccountType) => t === 'checking' || t === 'credit_card';

/** `3,5` (percent) to basis points; `null` when empty, `NaN` when not a number. */
export function percentToBp(text: string): number | null {
  const clean = text.trim().replace(',', '.');
  if (clean === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return Number.NaN;
  return Math.round(Number(clean) * 100);
}

type Errors = Partial<
  Record<'name' | 'opening' | 'date' | 'limit' | 'overdraft' | 'rate' | 'fee' | 'term', string>
> & {
  form?: string;
};

/**
 * Konto anlegen: name, type, opening balance with its date and the terms that belong to the type.
 * The role and the budget membership follow from the type (loans and depots are tracking accounts).
 */
export function AccountFormPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  useAmountPrivacy();
  return (
    <SettingsFormDialog open={open} onClose={onClose} title="Konto anlegen">
      <AccountForm onDone={onClose} />
    </SettingsFormDialog>
  );
}

function AccountForm({ onDone }: { onDone: () => void }) {
  useAmountPrivacy();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [onBudget, setOnBudget] = useState(true);
  const [opening, setOpening] = useState('');
  const [openingDate, setOpeningDate] = useState(todayInVienna());
  const [limit, setLimit] = useState('');
  const [overdraft, setOverdraft] = useState('');
  const [rate, setRate] = useState('');
  const [termEnd, setTermEnd] = useState('');
  const [fee, setFee] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const mutation = useMutation({
    mutationFn: (input: AccountInput) => createAccount(input),
    onSuccess: ({ account, groupId }) => {
      void queryClient.invalidateQueries({ queryKey: LEDGER_KEY });
      onDone();
      toast.show({
        message: `Konto „${account.name}“ angelegt.`,
        actionLabel: 'Rückgängig',
        onAction: () =>
          void undoGroup(groupId).then(() =>
            queryClient.invalidateQueries({ queryKey: LEDGER_KEY }),
          ),
      });
    },
    onError: (error) => setErrors({ form: errorText(error) }),
  });

  const changeType = (next: AccountType) => {
    setType(next);
    setOnBudget(DEFAULT_ON_BUDGET[next] ?? false);
  };

  const money = (text: string, key: keyof Errors, found: Errors, allowEmpty: boolean) => {
    if (text.trim() === '') {
      if (!allowEmpty) found[key] = 'Bitte einen Betrag eintragen.';
      return null;
    }
    const parsed = parseAmount(text);
    if (!parsed.ok) {
      found[key] = 'Das lässt sich nicht ausrechnen.';
      return null;
    }
    return parsed.cents;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Errors = {};
    if (name.trim() === '') found.name = 'Bitte einen Namen eintragen.';
    const openingCents = money(opening || '0', 'opening', found, false);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(openingDate)) found.date = 'Bitte ein Datum wählen.';
    const limitCents = hasCreditLimit(type) ? money(limit, 'limit', found, true) : null;
    const overdraftCents = hasOverdraft(type) ? money(overdraft, 'overdraft', found, true) : null;
    const feeCents = hasFee(type) ? money(fee, 'fee', found, true) : null;
    const rateBp = hasRate(type) ? percentToBp(rate) : null;
    if (Number.isNaN(rateBp)) found.rate = 'Zinssatz in Prozent, z. B. 3,5.';
    if (hasTerm(type) && termEnd !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(termEnd))
      found.term = 'Bitte ein Datum wählen.';
    for (const [key, value] of [
      ['limit', limitCents],
      ['overdraft', overdraftCents],
      ['fee', feeCents],
    ] as const) {
      if (value !== null && value < 0) found[key] = 'Der Betrag darf nicht negativ sein.';
    }
    setErrors(found);
    if (Object.keys(found).length > 0 || openingCents === null) return;

    const input: AccountInput = {
      name: name.trim(),
      type,
      onBudget,
      currency: 'EUR',
      openingBalanceCents: openingCents,
      openingDate,
      ...(limitCents !== null ? { creditLimitCents: limitCents } : {}),
      ...(overdraftCents !== null ? { overdraftLimitCents: overdraftCents } : {}),
      ...(feeCents !== null ? { monthlyFeeCents: feeCents } : {}),
      ...(rateBp !== null && !Number.isNaN(rateBp) ? { interestRateBp: rateBp } : {}),
      ...(termEnd !== '' ? { termEnd } : {}),
    };
    mutation.mutate(input);
  };

  return (
    <form className="kform" onSubmit={submit} noValidate>
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
      <Field label="Kontotyp">
        {({ id }) => (
          <Select id={id} value={type} onChange={(e) => changeType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="kform-switch">
        <span id="on-budget-label">
          Budget-Konto
          <small>
            {TRACKING_ONLY.has(type)
              ? 'Dieser Typ zählt nur zum Vermögen, nie zum verteilbaren Geld.'
              : 'Der Saldo zählt zu Zu verteilen.'}
          </small>
        </span>
        <Switch
          labelledBy="on-budget-label"
          checked={onBudget}
          disabled={TRACKING_ONLY.has(type)}
          onChange={setOnBudget}
        />
      </div>
      <AmountInput
        label="Startsaldo"
        value={opening}
        onChange={setOpening}
        error={errors.opening}
      />
      <Field label="Stichtag des Startsaldos" error={errors.date}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            id={id}
            type="date"
            value={openingDate}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(e) => setOpeningDate(e.target.value)}
          />
        )}
      </Field>
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
      {hasTerm(type) && (
        <Field label="Laufzeit bis" error={errors.term}>
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
      )}
      {hasFee(type) && (
        <AmountInput label="Monatliche Gebühr" value={fee} onChange={setFee} error={errors.fee} />
      )}
      {errors.form && (
        <p className="field-error" role="alert">
          {maskMoneyText(errors.form)}
        </p>
      )}
      <div className="panel-actions">
        <Button type="submit" disabled={mutation.isPending}>
          Konto anlegen
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
