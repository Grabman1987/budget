import { useAmountPrivacy, amountsHidden, cx } from '@budget/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PickCategory } from './capture-model';
import { Combobox, type ComboOption } from './combobox';
import { eur } from './format';
import { CreatePickerCategory } from './create-picker-category';

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
  overlayAvoid,
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
  overlayAvoid?: string | undefined;
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
  const [invalid, setInvalid] = useState(false);
  const [creating, setCreating] = useState(false);
  const input = useRef<HTMLInputElement>(null);
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
    () => [...leading, ...categoryOptions(categories, hidden), ...trailing],
    [leading, categories, hidden, trailing],
  );
  const showsAvailable = categories.some((c) => c.availableCents !== null);
  const typedOption =
    typing === null
      ? undefined
      : options.filter(
          (option) =>
            option.label.trim().toLocaleLowerCase('de-AT') ===
            typing.trim().toLocaleLowerCase('de-AT'),
        );
  const unresolved = capturePicker && typing !== null;
  const invalidMessage = 'Bitte eine Kategorie aus der Liste wählen.';
  return (
    <>
      <Combobox
        label={label}
        inputRef={input}
        value={typing ?? selectedName}
        filter={typing ?? ''}
        placeholder={placeholder}
        error={invalid && unresolved ? invalidMessage : error}
        inputValidity={capturePicker && typing !== null ? invalidMessage : ''}
        onInvalid={() => setInvalid(true)}
        listWhenEmpty
        captureCategory={capturePicker}
        overlayAvoid={overlayAvoid}
        pickFirst={pickFirst}
        emptyText="Keine Kategorie gefunden."
        options={options}
        action={
          allowCreate ? { label: 'Neue Kategorie …', onSelect: () => setCreating(true) } : undefined
        }
        {...(showsAvailable ? { hintHeading: 'Verfügbar' } : {})}
        onChange={(text) => {
          setTyping(text);
        }}
        onFocusChange={(focused) => {
          if (focused) return;
          if (capturePicker && typing !== null) {
            if (typing.trim() === '') {
              onSelect('');
              setTyping(null);
              setInvalid(false);
            } else if (typedOption?.length === 1) {
              onSelect(typedOption[0]!.id);
              setTyping(null);
              setInvalid(false);
            } else if (selectedName) {
              setTyping(null);
              setInvalid(false);
            } else setInvalid(typing.trim() !== '');
          } else setTyping(null);
        }}
        onSelect={(o) => {
          created.current = null;
          onSelect(o.id);
          setTyping(null);
          setInvalid(false);
        }}
      />
      {creating && (
        <CreatePickerCategory
          excludeIncome={excludeIncome}
          onSelect={(id) => {
            created.current = { id, seen: false };
            onSelect(id);
            setTyping(null);
            setInvalid(false);
          }}
          onClose={() => {
            setCreating(false);
            // The nested modal must be gone before its parent input can receive focus.
            requestAnimationFrame(() => input.current?.focus());
          }}
        />
      )}
    </>
  );
}
