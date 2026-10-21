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
  /** Booking payees: Enter accepts an unambiguous suggestion without selecting among several. */
  pickSingle?: boolean;
  /** Column heading above the right-aligned hints ("Verfügbar"); shown with the list. */
  hintHeading?: string;
  /** Capture categories retain their caller's group order and expose the entire scrollable list. */
  captureCategory?: boolean;
}

const fold = (text: string) => text.toLocaleLowerCase('de-AT').trim();
const MAX_OPTIONS = 60;

function revealOption(list: HTMLElement, option: HTMLElement | null) {
  if (!option) return;
  const frame = list.getBoundingClientRect();
  const heading = list.querySelector('.combo-head')?.getBoundingClientRect();
  const top = Math.max(frame.top + list.clientTop, heading?.bottom ?? frame.top);
  const bottom = frame.top + list.clientTop + list.clientHeight;
  const row = option.getBoundingClientRect();
  if (row.top < top) list.scrollTop = Math.floor(list.scrollTop + row.top - top);
  else if (row.bottom > bottom) list.scrollTop = Math.ceil(list.scrollTop + row.bottom - bottom);
}

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
  pickSingle = false,
  hintHeading,
  captureCategory = false,
}: ComboboxProps) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const [anchorVisible, setAnchorVisible] = useState(true);
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
    if (q !== '' && !captureCategory)
      hits.sort(
        (a, b) => Number(!fold(a.label).startsWith(q)) - Number(!fold(b.label).startsWith(q)),
      );
    return captureCategory ? hits : hits.slice(0, MAX_OPTIONS);
  }, [options, value, filter, listWhenEmpty, captureCategory]);

  const open =
    focused &&
    !dismissed &&
    (shown.length > 0 || (emptyText !== undefined && (filter ?? value).trim() !== ''));
  // On the phone the list opens inside a scrolling sheet: bring it into view.
  useEffect(() => {
    if (captureCategory || !open || !window.matchMedia?.('(max-width: 767px)')?.matches) return;
    document.getElementById(listId)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, listId, captureCategory]);
  useLayoutEffect(() => {
    if (!captureCategory || !open) return;
    const list = document.getElementById(listId);
    const field = list?.parentElement;
    if (!list || !field) return;
    const viewport = window.visualViewport;
    const updateBounds = () => {
      let top = viewport?.offsetTop ?? 0;
      let bottom = top + (viewport?.height ?? window.innerHeight);
      let left = viewport?.offsetLeft ?? 0;
      let right = left + (viewport?.width ?? window.innerWidth);
      for (let node = field.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, box.top + node.clientTop);
          bottom = Math.min(bottom, box.top + node.clientTop + node.clientHeight);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, box.left + node.clientLeft);
          right = Math.min(right, box.left + node.clientLeft + node.clientWidth);
        }
      }
      const anchor = field.getBoundingClientRect();
      const visible =
        anchor.bottom > top && anchor.top < bottom && anchor.right > left && anchor.left < right;
      const belowOrigin = Math.max(top, Math.min(anchor.bottom + 4, bottom));
      const aboveOrigin = Math.max(top, Math.min(anchor.top - 4, bottom));
      const below = Math.max(0, bottom - belowOrigin);
      const above = Math.max(0, aboveOrigin - top);
      const opensAbove = above > below;
      const width = Math.max(0, Math.min(anchor.width, right - left));
      list.style.maxHeight = `${Math.floor(opensAbove ? above : below)}px`;
      list.style.top = opensAbove ? 'auto' : `${belowOrigin - anchor.top}px`;
      list.style.bottom = opensAbove ? `${anchor.bottom - aboveOrigin}px` : 'auto';
      list.style.left = `${Math.max(left, Math.min(anchor.left, right - width)) - anchor.left}px`;
      list.style.right = 'auto';
      list.style.width = `${width}px`;
      const activeId = field.querySelector('input')?.getAttribute('aria-activedescendant');
      if (activeId) revealOption(list, document.getElementById(activeId));
      return visible;
    };
    updateBounds();
    const refresh = () => setAnchorVisible(updateBounds());
    const onScroll = (event: Event) => {
      if (event.target !== list) refresh();
    };
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', onScroll, true);
    viewport?.addEventListener('resize', refresh);
    viewport?.addEventListener('scroll', onScroll);
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(refresh);
    const intersection =
      typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(refresh);
    intersection?.observe(field);
    for (let node: HTMLElement | null = field; node; node = node.parentElement)
      observer?.observe(node);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', onScroll, true);
      viewport?.removeEventListener('resize', refresh);
      viewport?.removeEventListener('scroll', onScroll);
      observer?.disconnect();
      intersection?.disconnect();
    };
  }, [captureCategory, open, listId, shown.length]);
  const optionId = (index: number) => `${listId}-${index}`;
  // Without arrow keys, `pickFirst` highlights the first match once something is typed.
  const activeIndex =
    active >= 0
      ? Math.min(active, shown.length - 1)
      : (pickFirst || (pickSingle && shown.length === 1)) &&
          fold(filter ?? value) !== '' &&
          shown.length > 0
        ? 0
        : -1;
  useLayoutEffect(() => {
    if (!captureCategory || !open || !anchorVisible || activeIndex < 0) return;
    const list = document.getElementById(listId);
    const option = document.getElementById(`${listId}-${activeIndex}`);
    if (list) revealOption(list, option);
  }, [captureCategory, open, anchorVisible, activeIndex, listId]);

  const pick = (option: ComboOption) => {
    onSelect(option);
    setActive(-1);
    setDismissed(true);
  };

  return (
    <Field label={label} error={error}>
      {({ id, describedBy, invalid }) => (
        <div className={cx('combo', captureCategory && 'is-capture-category')}>
          <TextInput
            id={id}
            ref={inputRef}
            type={type}
            role="combobox"
            aria-expanded={open && (!captureCategory || anchorVisible)}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && (!captureCategory || anchorVisible) && activeIndex >= 0
                ? optionId(activeIndex)
                : undefined
            }
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
              // Modifier shortcuts belong to the form; never consume Ctrl/Cmd+Enter as a pick.
              if (e.ctrlKey || e.metaKey || e.altKey) return;
              if (
                captureCategory &&
                !anchorVisible &&
                (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')
              ) {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.scrollIntoView({ block: 'nearest' });
                setDismissed(false);
                return;
              }
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
              hidden={captureCategory && !anchorVisible}
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
