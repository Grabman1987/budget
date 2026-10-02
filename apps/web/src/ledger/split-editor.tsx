import { cents } from '@budget/domain';
import {
  AmountInput,
  Button,
  DimensionChain,
  Field,
  Segmented,
  Select,
  type SegmentedOption,
} from '@budget/ui';
import { Plus, Trash2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import {
  newSplit,
  splitChain,
  type BookingDraft,
  type SplitDraft,
  type SplitType,
} from './booking-model';
import type { PickCategory } from './capture-model';
import { ContactSelect } from './contact-select';
import { eur } from './format';
import type { AccountRow } from './types';

const TYPES: ReadonlyArray<SegmentedOption<SplitType>> = [
  { value: 'category', label: 'Kategorie' },
  { value: 'contact', label: 'Kontakt' },
  { value: 'transfer', label: 'Umbuchung' },
];

/** Options grouped by category group (consecutive categories of one group share an `optgroup`). */
function categoryOptions(categories: ReadonlyArray<PickCategory>) {
  const groups: { name: string; items: PickCategory[] }[] = [];
  for (const c of categories) {
    const last = groups[groups.length - 1];
    if (last && last.name === c.group) last.items.push(c);
    else groups.push({ name: c.group, items: [c] });
  }
  return groups.map((g) => (
    <optgroup key={g.name} label={g.name}>
      {g.items.map((c) => (
        <option key={c.id} value={c.id}>
          {c.availableCents === null ? c.name : `${c.name} · ${eur(c.availableCents)}`}
        </option>
      ))}
    </optgroup>
  ));
}

export interface SplitEditorProps {
  draft: BookingDraft;
  setDraft: Dispatch<SetStateAction<BookingDraft>>;
  categories: ReadonlyArray<PickCategory>;
  /** Open accounts, for the target of a transfer line. */
  accounts: ReadonlyArray<AccountRow>;
  accountId: string;
  contacts: ReadonlyArray<{ id: string; name: string }>;
  /** Contact shares run through the Auslagen category; the first share creates it if missing. */
  hasAdvanceCategory: boolean;
  /** An existing booking with transfer lines: they cannot be changed, only deleted and re-created. */
  locked: boolean;
  error: string | undefined;
}

/**
 * Split editor: lines of category, contact share (Auslage) or transfer. A small dimension chain
 * (Betrag − Verteilt = Rest) shows what is left while typing; saving waits until it is 0.
 */
export function SplitEditor({
  draft,
  setDraft,
  categories,
  accounts,
  accountId,
  contacts,
  hasAdvanceCategory,
  locked,
  error,
}: SplitEditorProps) {
  const { totalCents, distributedCents, restCents } = splitChain(draft);
  const types = draft.kind === 'expense' ? TYPES : TYPES.filter((t) => t.value !== 'transfer');
  const change = (key: string, patch: Partial<SplitDraft>) =>
    setDraft((d) => ({
      ...d,
      splits: d.splits.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    }));

  return (
    <fieldset className="ksplits" disabled={locked}>
      <legend className="tech">Aufteilung</legend>
      <DimensionChain
        label="Aufteilung: Betrag minus Verteilt ergibt den Rest"
        precision="cent"
        terms={[
          { label: 'Betrag', value: cents(totalCents) },
          { label: 'Verteilt', value: cents(distributedCents), op: '-' },
          { label: 'Rest', value: cents(restCents), op: '=' },
        ]}
      />
      {locked && (
        <p className="khint">
          Diese Aufteilung enthält eine Umbuchung. Zum Ändern die Buchung löschen und neu erfassen.
        </p>
      )}
      {draft.splits.map((s, index) => {
        const n = index + 1;
        return (
          <div className="ksplit" key={s.key} role="group" aria-label={`Zeile ${n}`}>
            <Segmented
              label={`Art der Zeile ${n}`}
              options={types}
              value={s.type}
              // A hidden category of the old type must not travel with the new one.
              onChange={(type) => change(s.key, { type, categoryId: '' })}
              stretch
            />
            {s.type === 'category' && (
              <Field label={`Kategorie ${n}`}>
                {({ id }) => (
                  <Select
                    id={id}
                    value={s.categoryId}
                    onChange={(e) => change(s.key, { categoryId: e.target.value })}
                  >
                    <option value="">
                      {draft.kind === 'income' ? 'Zu verteilen' : 'Kategorie wählen'}
                    </option>
                    {categoryOptions(categories)}
                  </Select>
                )}
              </Field>
            )}
            {s.type === 'contact' && (
              <ContactSelect
                label={`Kontakt ${n}`}
                value={s.contactId ?? ''}
                onChange={(contactId) => change(s.key, { contactId: contactId || null })}
                contacts={contacts}
                noneLabel="Kontakt wählen"
                hint={
                  (draft.kind === 'income'
                    ? 'Zahlt zurück, läuft über Auslagen.'
                    : 'Ausgelegt für den Kontakt, läuft über Auslagen.') +
                  (hasAdvanceCategory ? '' : ' Die Kategorie wird beim ersten Mal angelegt.')
                }
              />
            )}
            {s.type === 'transfer' && (
              <Field label={`Nach Konto ${n}`}>
                {({ id }) => (
                  <Select
                    id={id}
                    value={s.toAccountId}
                    onChange={(e) => change(s.key, { toAccountId: e.target.value })}
                  >
                    <option value="">Konto wählen</option>
                    {accounts
                      .filter((a) => a.id !== accountId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
            )}
            {s.type === 'transfer' &&
              accounts.some((a) => a.id === s.toAccountId && !a.onBudget) && (
                <Field
                  label={`Kategorie ${n}`}
                  hint="Umbuchungen auf Tracking-Konten brauchen eine Kategorie."
                >
                  {({ id, describedBy }) => (
                    <Select
                      id={id}
                      aria-describedby={describedBy}
                      value={s.categoryId}
                      onChange={(e) => change(s.key, { categoryId: e.target.value })}
                    >
                      <option value="">Kategorie wählen</option>
                      {categoryOptions(categories)}
                    </Select>
                  )}
                </Field>
              )}
            <AmountInput
              label={`Betrag ${n}`}
              value={s.amount}
              onChange={(v) => change(s.key, { amount: v })}
            />
            <div className="ksplit-actions">
              {restCents > 0 && s.amount.trim() === '' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    change(s.key, { amount: (restCents / 100).toFixed(2).replace('.', ',') })
                  }
                >
                  Rest einsetzen
                </Button>
              )}
              {draft.splits.length > 2 && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Zeile ${n} entfernen`}
                  onClick={() =>
                    setDraft((d) => ({ ...d, splits: d.splits.filter((x) => x.key !== s.key) }))
                  }
                >
                  <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
      <p className={restCents === 0 ? 'kdiff is-ok' : 'kdiff is-bad'} aria-live="polite">
        {restCents === 0 ? 'Aufteilung geht auf.' : `Rest: ${eur(restCents)}`}
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="panel-actions">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDraft((d) => ({ ...d, splits: [...d.splits, newSplit()] }))}
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          Zeile hinzufügen
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDraft((d) => ({ ...d, splitOn: false, splits: [] }))}
        >
          Nicht aufteilen
        </Button>
      </div>
    </fieldset>
  );
}
