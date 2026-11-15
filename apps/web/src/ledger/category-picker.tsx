import { useAmountPrivacy, amountsHidden, cx } from '@budget/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PickCategory } from './capture-model';
import { Combobox, type ComboOption } from './combobox';
import { eur } from './format';
import { CREATE_CATEGORY, CreatePickerCategory } from './create-picker-category';

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
  trailing = [],
  capturePicker = false,
  selectedName,
  onSelect,
  error,
  placeholder = 'Kategorie suchen',
  pickFirst = true,
  allowCreate = false,
  excludeIncome = false,
}: {
  label: string;
  categories: ReadonlyArray<PickCategory>;
  leading?: ReadonlyArray<ComboOption>;
  trailing?: ReadonlyArray<ComboOption>;
  /** Capture only: retain group order and fit the complete list inside its dialog. */
  capturePicker?: boolean;
  /** Text shown while nothing is being typed. */
  selectedName: string;
  onSelect: (id: string) => void;
  error?: string | undefined;
  placeholder?: string;
  pickFirst?: boolean;
  /** Mutating category fields only; filters never offer creation. */
  allowCreate?: boolean;
  excludeIncome?: boolean;
}) {
  const hidden = useAmountPrivacy();
  // What is being typed to search; `null` shows the chosen name and the whole list.
  const [typing, setTyping] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const created = useRef<{ id: string; seen: boolean } | null>(null);
  useEffect(() => {
    const tracked = created.current;
    if (!tracked) return;
    if (categories.some((category) => category.id === tracked.id)) tracked.seen = true;
    else if (tracked.seen) {
      created.current = null;
      // The category's audited Undo can remove an unused category while the draft stays open.
      if (selectedName === '') onSelect('');
    }
  }, [categories, selectedName, onSelect]);
  const options = useMemo(
    () => [
      ...leading,
      ...categoryOptions(categories, hidden),
      ...trailing,
      ...(allowCreate
        ? [{ id: CREATE_CATEGORY, label: 'Neue Kategorie …', alwaysVisible: true }]
        : []),
    ],
    [leading, categories, hidden, trailing, allowCreate],
  );
  const showsAvailable = categories.some((c) => c.availableCents !== null);
  return (
    <>
      <Combobox
        label={label}
        value={typing ?? selectedName}
        filter={typing ?? ''}
        placeholder={placeholder}
        error={error}
        listWhenEmpty
        captureCategory={capturePicker}
        pickFirst={pickFirst}
        emptyText="Keine Kategorie gefunden."
        options={options}
        {...(showsAvailable ? { hintHeading: 'Verfügbar' } : {})}
        onChange={setTyping}
        onFocusChange={(focused) => !focused && setTyping(null)}
        onSelect={(o) => {
          if (o.id === CREATE_CATEGORY) setCreating(true);
          else {
            created.current = null;
            onSelect(o.id);
          }
          setTyping(null);
        }}
      />
      {creating && (
        <CreatePickerCategory
          excludeIncome={excludeIncome}
          onSelect={(id) => {
            created.current = { id, seen: false };
            onSelect(id);
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
