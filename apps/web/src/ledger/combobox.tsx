import { Field, TextInput, cx } from '@budget/ui';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';

export interface ComboOption {
  id: string;
  label: string;
  /** Right-aligned secondary text (default category, "Verfügbar 12,00 €"). */
  hint?: ReactNode;
  /** Heading the option is listed under; consecutive options with the same group share it. */
  group?: string | undefined;
}

export interface ComboboxProps {
  label: string;
  /** The text in the field. */
  value: string;
  onChange: (text: string) => void;
  options: ReadonlyArray<ComboOption>;
  onSelect: (option: ComboOption) => void;
  placeholder?: string;
  error?: string | undefined;
  /** Shown when the typed text matches nothing. */
  emptyText?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Show the whole list while the field is empty (category search); default: only when typing. */
  listWhenEmpty?: boolean;
  type?: 'text' | 'search';
  /** Text the list is filtered by when it differs from what the field shows (default: the value). */
  filter?: string;
  onFocusChange?: (focused: boolean) => void;
  /** With text typed, the first match is highlighted, so Enter picks it (category search). */
  pickFirst?: boolean;
  /** Column heading above the right-aligned hints ("Verfügbar"); shown with the list. */
  hintHeading?: string;
}

const fold = (text: string) => text.toLocaleLowerCase('de-AT').trim();
const MAX_OPTIONS = 60;

/**
 * Text field with a suggestion list (WAI-ARIA combobox, list below the field, no popover so it
 * never leaves the sheet). Arrow keys move, Enter picks the highlighted option, Esc closes the
 * list first and only then the panel. With no highlighted option Enter is left to the form
 * (which moves to the next field). `pickFirst` makes the first match the highlighted one.
 */
export function Combobox({
  label,
  value,
  onChange,
  options,
  onSelect,
  placeholder,
  error,
  emptyText,
  inputRef,
  listWhenEmpty = false,
  type = 'text',
  filter,
  onFocusChange,
  pickFirst = false,
  hintHeading,
}: ComboboxProps) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  // The text is selected on focus. A value that changes in the same moment (the payee's default
  // category, set as the payee field is left) would drop that selection, so it is redone after
  // the render.
  const selectAfterRender = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    selectAfterRender.current?.select();
    selectAfterRender.current = null;
  });

  const shown = useMemo(() => {
    const q = fold(filter ?? value);
    if (q === '' && !listWhenEmpty) return [];
    const hits = q === '' ? [...options] : options.filter((o) => fold(o.label).includes(q));
    // Prefix matches first, the order of the caller otherwise.
    if (q !== '')
      hits.sort(
        (a, b) => Number(!fold(a.label).startsWith(q)) - Number(!fold(b.label).startsWith(q)),
      );
    return hits.slice(0, MAX_OPTIONS);
  }, [options, value, filter, listWhenEmpty]);

  const open =
    focused &&
    !dismissed &&
    (shown.length > 0 || (emptyText !== undefined && (filter ?? value).trim() !== ''));
  // On the phone the list opens inside a scrolling sheet: bring it into view.
  useEffect(() => {
    if (!open || !window.matchMedia?.('(max-width: 767px)')?.matches) return;
    document.getElementById(listId)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, listId]);
  const optionId = (index: number) => `${listId}-${index}`;
  // Without arrow keys, `pickFirst` highlights the first match once something is typed.
  const activeIndex =
    active >= 0
      ? Math.min(active, shown.length - 1)
      : pickFirst && fold(filter ?? value) !== '' && shown.length > 0
        ? 0
        : -1;

  const pick = (option: ComboOption) => {
    onSelect(option);
    setActive(-1);
    setDismissed(true);
  };

  return (
    <Field label={label} error={error}>
      {({ id, describedBy, invalid }) => (
        <div className="combo">
          <TextInput
            id={id}
            ref={inputRef}
            type={type}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            onFocus={(e) => {
              setFocused(true);
              setDismissed(false);
              onFocusChange?.(true);
              e.currentTarget.select();
              selectAfterRender.current = e.currentTarget;
            }}
            onBlur={() => {
              setFocused(false);
              onFocusChange?.(false);
            }}
            onChange={(e) => {
              onChange(e.target.value);
              setActive(-1);
              setDismissed(false);
            }}
            onKeyDown={(e) => {
              if (!open) {
                if (e.key === 'ArrowDown') setDismissed(false);
                return;
              }
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const n = shown.length;
                setActive(
                  e.key === 'ArrowDown' ? (activeIndex + 1) % n : (activeIndex - 1 + n) % n,
                );
              } else if (e.key === 'Enter' && activeIndex >= 0) {
                // Picking is not "move on": the form's Enter handler must not fire as well.
                e.preventDefault();
                e.stopPropagation();
                const option = shown[activeIndex];
                if (option) pick(option);
              } else if (e.key === 'Escape') {
                // The list closes first; a second Esc closes the panel.
                e.preventDefault();
                e.stopPropagation();
                setDismissed(true);
              }
            }}
          />
          {open && (
            <ul
              className="combo-list"
              id={listId}
              role="listbox"
              aria-label={`${label}, Vorschläge`}
            >
              {hintHeading !== undefined && shown.length > 0 && (
                <li className="combo-head" role="presentation">
                  <span>{hintHeading}</span>
                </li>
              )}
              {shown.length === 0 && emptyText !== undefined && (
                <li className="combo-empty" role="presentation">
                  {emptyText}
                </li>
              )}
              {shown.map((option, index) => (
                <GroupHeading
                  key={option.id}
                  heading={option.group !== shown[index - 1]?.group ? option.group : undefined}
                >
                  {/* Keyboard picking happens in the input (arrows, Enter); the click is for the mouse. */}
                  {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
                  <li
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={cx('combo-option', index === activeIndex && 'is-active')}
                    // Keep the focus in the field: a click must not blur (and close) the list first.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(option)}
                  >
                    <span>{option.label}</span>
                    {option.hint && <span className="combo-hint">{option.hint}</span>}
                  </li>
                </GroupHeading>
              ))}
            </ul>
          )}
        </div>
      )}
    </Field>
  );
}

/** Optional group heading in front of an option (a presentation row inside the listbox). */
function GroupHeading({ heading, children }: { heading: string | undefined; children: ReactNode }) {
  return (
    <>
      {heading !== undefined && (
        <li className="combo-group" role="presentation">
          {heading}
        </li>
      )}
      {children}
    </>
  );
}
