import { useAmountPrivacy, amountsHidden, cx } from '@budget/ui';
import { useMemo, useState } from 'react';
import type { PickCategory } from './capture-model';
import { Combobox, type ComboOption } from './combobox';
import { eur } from './format';

/** "Verfügbar" of an option: the amount only (the list has a column heading), red when overspent. */
export const availableHint = (availableCents: number | null, hidden = amountsHidden()) =>
  availableCents === null ? undefined : (
    <span className={cx('combo-avail', availableCents < 0 && 'is-neg')}>
      <span className="sr-only">Verfügbar </span>
      {hidden ? '••• €' : eur(availableCents)}
    </span>
  );

/** Combobox options of the categories: group headers (the groups of the budget) and Verfügbar. */
export const categoryOptions = (
  categories: ReadonlyArray<PickCategory>,
  hidden = amountsHidden(),
): ComboOption[] =>
  categories.map((c) => ({
    id: c.id,
    label: c.name,
    group: c.group,
    hint: availableHint(c.availableCents, hidden),
  }));

/**
 * Category field as a searchable list grouped by category group, archived categories left out,
 * with the month's Available right-aligned on every option (as in YNAB). `leading` options
 * (Zu verteilen, Alle Kategorien, ohne Kategorie) come first, without a group heading.
 */
export function CategoryCombobox({
  label,
  categories,
  leading = [],
  selectedName,
  onSelect,
  error,
  placeholder = 'Kategorie suchen',
  pickFirst = true,
}: {
  label: string;
  categories: ReadonlyArray<PickCategory>;
  leading?: ReadonlyArray<ComboOption>;
  /** Text shown while nothing is being typed. */
  selectedName: string;
  onSelect: (id: string) => void;
  error?: string | undefined;
  placeholder?: string;
  pickFirst?: boolean;
}) {
  const hidden = useAmountPrivacy();
  // What is being typed to search; `null` shows the chosen name and the whole list.
  const [typing, setTyping] = useState<string | null>(null);
  const options = useMemo(
    () => [...leading, ...categoryOptions(categories, hidden)],
    [leading, categories, hidden],
  );
  const showsAvailable = categories.some((c) => c.availableCents !== null);
  return (
    <Combobox
      label={label}
      value={typing ?? selectedName}
      filter={typing ?? ''}
      placeholder={placeholder}
      error={error}
      listWhenEmpty
      pickFirst={pickFirst}
      emptyText="Keine Kategorie gefunden."
      options={options}
      {...(showsAvailable ? { hintHeading: 'Verfügbar' } : {})}
      onChange={setTyping}
      onFocusChange={(focused) => !focused && setTyping(null)}
      onSelect={(o) => {
        onSelect(o.id);
        setTyping(null);
      }}
    />
  );
}
