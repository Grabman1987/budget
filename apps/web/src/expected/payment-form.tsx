import { useAmountPrivacy, AmountInput, Field, Segmented, Select, TextInput } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { accountsQuery, lookupsQuery, payeesQuery } from '../ledger/queries';
import type { DateShift, ExpectedKind, Rhythm } from './api';
import type { DraftErrors, DraftField, PaymentDraft } from './payment-draft';

const KINDS = [
  { value: 'outflow', label: 'Ausgabe' },
  { value: 'inflow', label: 'Einnahme' },
] as const;
const RHYTHMS: ReadonlyArray<{ value: Rhythm; label: string }> = [
  { value: 'monthly', label: 'monatlich' },
  { value: 'quarterly', label: 'vierteljährlich' },
  { value: 'semiannual', label: 'halbjährlich' },
  { value: 'yearly', label: 'jährlich' },
];
const SHIFTS: ReadonlyArray<{ value: DateShift; label: string }> = [
  { value: 'none', label: 'nicht verschieben' },
  { value: 'before', label: 'auf den Werktag davor' },
  { value: 'after', label: 'auf den Werktag danach' },
];
const MONTHS = [
  'Jänner',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'];

/**
 * Every field of an expected payment. Creating adds the first version (amount, optional range,
 * currency, valid from); an existing payment never edits amounts here (that is a new version).
 */
export function PaymentForm({
  draft,
  errors,
  creating,
  onChange,
}: {
  draft: PaymentDraft;
  errors: DraftErrors;
  creating: boolean;
  onChange: <K extends DraftField>(key: K, value: PaymentDraft[K]) => void;
}) {
  useAmountPrivacy();
  const accounts = useQuery(accountsQuery()).data?.accounts.filter((a) => !a.closedAt) ?? [];
  const lookups = useQuery(lookupsQuery()).data;
  const payees = useQuery(payeesQuery()).data?.payees ?? [];
  const inflow = draft.kind === 'inflow';
  const categories = (lookups?.categories ?? []).filter(
    (c) => c.kind !== 'income' && c.kind !== 'card_payment',
  );
  const text = (
    key: DraftField,
    label: string,
    extra: Partial<React.ComponentProps<'input'>> = {},
  ) => (
    <Field label={label} error={errors[key]}>
      {({ id, describedBy, invalid }) => (
        <TextInput
          id={id}
          value={draft[key]}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          onChange={(e) => onChange(key, e.target.value as never)}
          {...extra}
        />
      )}
    </Field>
  );
  const pick = (
    key: DraftField,
    label: string,
    options: ReadonlyArray<{ value: string; label: string }>,
    empty?: string,
  ) => (
    <Field label={label} error={errors[key]}>
      {({ id, describedBy, invalid }) => (
        <Select
          id={id}
          value={draft[key]}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          onChange={(e) => onChange(key, e.target.value as never)}
        >
          {empty !== undefined && <option value="">{empty}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );

  return (
    <>
      <Segmented
        label="Art der Zahlung"
        options={KINDS}
        value={draft.kind}
        onChange={(kind: ExpectedKind) => onChange('kind', kind)}
        stretch
      />
      {text('name', 'Name', { autoComplete: 'off' })}
      {creating && (
        <fieldset className="kform-set xp-set">
          <legend>Erster Betrag</legend>
          <AmountInput
            label="Betrag"
            value={draft.amount}
            onChange={(v) => onChange('amount', v)}
            sign={inflow ? '+' : '−'}
            error={errors.amount}
          />
          <AmountInput
            label="bis (optional)"
            value={draft.amountMax}
            onChange={(v) => onChange('amountMax', v)}
            error={errors.amountMax}
          />
          <div className="kform-pair">
            {pick(
              'currency',
              'Währung',
              CURRENCIES.map((c) => ({ value: c, label: c })),
            )}
            {text('validFrom', 'Gilt ab', { type: 'date' })}
          </div>
        </fieldset>
      )}
      <fieldset className="kform-set xp-set">
        <legend>Zuordnung</legend>
        {pick(
          'accountId',
          'Konto',
          accounts.map((a) => ({ value: a.id, label: a.name })),
          'Kein Konto festgelegt',
        )}
        {pick(
          'payeeId',
          inflow ? 'Absender' : 'Empfänger',
          payees.map((p) => ({ value: p.id, label: p.name })),
          'Kein Empfänger festgelegt',
        )}
        {inflow
          ? pick(
              'incomeTypeId',
              'Einkommensart',
              (lookups?.incomeTypes ?? []).map((t) => ({ value: t.id, label: t.name })),
              'Keine Einkommensart',
            )
          : pick(
              'categoryId',
              'Kategorie',
              categories.map((c) => ({ value: c.id, label: c.name })),
              'Keine Kategorie',
            )}
        <div className="kform-pair">
          {pick(
            'contactId',
            'Kontakt',
            (lookups?.contacts ?? []).map((c) => ({ value: c.id, label: c.name })),
            'Kein Kontakt',
          )}
          {text('sharePercent', 'Anteil Kontakt in %', { inputMode: 'decimal', placeholder: '0' })}
        </div>
      </fieldset>
      <fieldset className="kform-set xp-set">
        <legend>Rhythmus</legend>
        <div className="kform-pair">
          {pick('rhythm', 'Rhythmus', RHYTHMS)}
          {text('dueDay', 'Fälligkeitstag', { inputMode: 'numeric' })}
        </div>
        {draft.rhythm !== 'monthly' &&
          pick(
            'dueMonth',
            draft.rhythm === 'yearly' ? 'Fälligkeitsmonat' : 'Erster Monat im Zyklus',
            MONTHS.map((m, i) => ({ value: String(i + 1), label: m })),
            'Monat wählen',
          )}
        <p className="field-hint">Tag 31 heißt: der letzte Tag des Monats.</p>
        {pick('dateShift', 'Wochenende und Feiertag', SHIFTS)}
        <div className="kform-pair">
          {text('startDate', 'Start', { type: 'date' })}
          {text('endDate', 'Ende', { type: 'date' })}
        </div>
      </fieldset>
      <fieldset className="kform-set xp-set">
        <legend>Abgleich mit Buchungen</legend>
        <AmountInput
          label="Betragstoleranz"
          value={draft.tolerance}
          onChange={(v) => onChange('tolerance', v)}
          error={errors.tolerance}
        />
        {text('windowDays', 'Zeitfenster in Tagen', { inputMode: 'numeric' })}
      </fieldset>
      {text('note', 'Notiz')}
    </>
  );
}
