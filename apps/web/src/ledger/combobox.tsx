import { Field, TextInput, cx } from '@budget/ui';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
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
  inputValidity?: string;
  onInvalid?: () => void;
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
  /** Mobile capture suggestions overlay following rows at the card's full width. */
  captureOverlay?: boolean;
  /** Page controls whose visible boxes must stay below the focused field and fixed list. */
  overlayAvoid?: string | undefined;
  /** Explicit action outside the selectable suggestions and their keyboard cycle. */
  action?: { label: string; onSelect: () => void } | undefined;
}

const fold = (text: string) => text.toLocaleLowerCase('de-AT').trim();
const MAX_OPTIONS = 60;
// Room for a heading and a touch-sized option, even while the keyboard is opening.
const MIN_CAPTURE_LIST_HEIGHT = 120;

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
  inputValidity,
  onInvalid,
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
  captureOverlay = false,
  overlayAvoid,
  action,
}: ComboboxProps) {
  const [isPhone, setIsPhone] = useState(
    () => window.matchMedia?.('(max-width: 767px)').matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 767px)');
    const update = () => setIsPhone(media?.matches ?? false);
    media?.addEventListener('change', update);
    return () => media?.removeEventListener('change', update);
  }, []);
  const overlayCapture = captureOverlay || (captureCategory && REDESIGN_ENABLED && isPhone);
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
    if (q !== '' && !captureCategory)
      hits.sort(
        (a, b) => Number(!fold(a.label).startsWith(q)) - Number(!fold(b.label).startsWith(q)),
      );
    return captureCategory ? hits : hits.slice(0, MAX_OPTIONS);
  }, [options, value, filter, listWhenEmpty, captureCategory]);

  const open =
    focused &&
    !dismissed &&
    (shown.length > 0 ||
      action !== undefined ||
      (emptyText !== undefined && (filter ?? value).trim() !== ''));
  // On the phone the list opens inside a scrolling sheet: bring it into view.
  useEffect(() => {
    if (
      overlayCapture ||
      captureCategory ||
      !open ||
      !window.matchMedia?.('(max-width: 767px)')?.matches
    )
      return;
    document.getElementById(listId)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, listId, captureCategory, overlayCapture]);
  useLayoutEffect(() => {
    if ((!overlayCapture && !captureCategory) || !open) return;
    const list = document.getElementById(listId);
    const field = list?.parentElement;
    if (!list || !field) return;
    const viewport = window.visualViewport;
    const updateBounds = () => {
      let top = viewport?.offsetTop ?? 0;
      let bottom = top + (viewport?.height ?? window.innerHeight);
      let left = viewport?.offsetLeft ?? 0;
      let right = left + (viewport?.width ?? window.innerWidth);
      // The fixed list escapes the form's scroll clip but stays inside its modal.
      // iOS can pan the visual viewport before the focused field has scrolled into view.
      const dialog = field.closest('dialog');
      if (dialog) {
        const box = dialog.getBoundingClientRect();
        top = Math.max(top, box.top + dialog.clientTop);
        bottom = Math.min(bottom, box.top + dialog.clientTop + dialog.clientHeight);
        left = Math.max(left, box.left + dialog.clientLeft);
        right = Math.min(right, box.left + dialog.clientLeft + dialog.clientWidth);
      }
      const anchorElement = overlayCapture ? field.querySelector('input') : field;
      let anchor = anchorElement?.getBoundingClientRect();
      if (!anchor) return;
      if (overlayAvoid && !dialog) {
        for (const obstacle of document.querySelectorAll(overlayAvoid)) {
          if (getComputedStyle(obstacle).position !== 'fixed') continue;
          const box = obstacle.getBoundingClientRect();
          if (box.width && box.height && box.left < anchor.right && box.right > anchor.left)
            bottom = Math.max(top, Math.min(bottom, box.top - 8));
        }
        if (anchor.bottom > bottom && field.contains(document.activeElement)) {
          window.scrollBy(0, anchor.bottom - bottom);
          anchor = anchorElement!.getBoundingClientRect();
        }
      }
      const card =
        (overlayCapture ? field.closest('.bk-cols') : null)?.getBoundingClientRect() ?? anchor;
      const belowOrigin = Math.max(top, Math.min(anchor.bottom + 4, bottom));
      const aboveOrigin = Math.max(top, Math.min(anchor.top - 4, bottom));
      const below = Math.max(0, bottom - belowOrigin);
      const above = Math.max(0, aboveOrigin - top);
      // Prefer the following rows; only flip when the desired list will not fit below.
      const opensAbove = overlayCapture
        ? below < Math.min(220, list.scrollHeight) && above > below
        : above > below;
      const width = Math.max(0, Math.min(card.width, right - left));
      const maxHeight = overlayCapture
        ? Math.min(220, opensAbove ? above : below)
        : Math.min(bottom - top, Math.max(MIN_CAPTURE_LIST_HEIGHT, opensAbove ? above : below));
      list.style.maxHeight = `${Math.floor(maxHeight)}px`;
      list.style.left = `${Math.max(left, Math.min(card.left, right - width))}px`;
      list.style.right = 'auto';
      list.style.width = `${width}px`;
      list.style.bottom = 'auto';
      list.style.top = `${Math.max(
        top,
        Math.min(
          opensAbove ? aboveOrigin - list.offsetHeight : belowOrigin,
          bottom - list.offsetHeight,
        ),
      )}px`;
      const activeId = field.querySelector('input')?.getAttribute('aria-activedescendant');
      if (activeId) revealOption(list, document.getElementById(activeId));
    };
    updateBounds();
    const refresh = updateBounds;
    const onScroll = (event: Event) => {
      if (event.target !== list) refresh();
    };
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', onScroll, true);
    viewport?.addEventListener('resize', refresh);
    viewport?.addEventListener('scroll', onScroll);
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(refresh);
    // Equal-count filter results can still change height through wrapping or group headings.
    observer?.observe(list);
    if (overlayAvoid)
      for (const obstacle of document.querySelectorAll(overlayAvoid)) observer?.observe(obstacle);
    for (let node: HTMLElement | null = field; node; node = node.parentElement)
      observer?.observe(node);
    // A page toast may appear or disappear without resizing the field's ancestors.
    const visibilityObserver = overlayAvoid ? new MutationObserver(refresh) : undefined;
    visibilityObserver?.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true,
    });
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', onScroll, true);
      viewport?.removeEventListener('resize', refresh);
      viewport?.removeEventListener('scroll', onScroll);
      observer?.disconnect();
      visibilityObserver?.disconnect();
      for (const property of ['max-height', 'left', 'right', 'width', 'bottom', 'top'])
        list.style.removeProperty(property);
    };
  }, [captureCategory, overlayCapture, overlayAvoid, open, listId, shown.length]);
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
    if ((!captureCategory && !overlayCapture) || !open || activeIndex < 0) return;
    const list = document.getElementById(listId);
    const option = document.getElementById(`${listId}-${activeIndex}`);
    if (list) revealOption(list, option);
  }, [captureCategory, overlayCapture, open, activeIndex, listId]);

  const pick = (option: ComboOption) => {
    onSelect(option);
    setActive(-1);
    setDismissed(true);
  };

  return (
    <Field label={label} error={error}>
      {({ id, describedBy, invalid }) => (
        <div
          className={cx(
            'combo',
            captureCategory && 'is-capture-category',
            overlayCapture && 'is-capture-overlay',
          )}
          onBlur={(e) => {
            if (e.currentTarget.contains(e.relatedTarget)) return;
            setFocused(false);
            onFocusChange?.(false);
          }}
        >
          <TextInput
            id={id}
            type={type}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${listId}-options`}
            aria-autocomplete="list"
            aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            autoComplete="off"
            value={value}
            ref={(node) => {
              node?.setCustomValidity(inputValidity ?? '');
              if (typeof inputRef === 'function') inputRef(node);
              else if (inputRef) inputRef.current = node;
            }}
            onInvalid={onInvalid}
            placeholder={overlayCapture && captureCategory ? 'Kategorie wählen' : placeholder}
            onFocus={(e) => {
              // A newly focused split row can be outside the sheet after it grows.
              if (captureCategory) {
                e.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
              }
              setFocused(true);
              setDismissed(false);
              onFocusChange?.(true);
              e.currentTarget.select();
              selectAfterRender.current = e.currentTarget;
            }}
            onChange={(e) => {
              onChange(e.target.value);
              setActive(-1);
              setDismissed(false);
            }}
            onKeyDown={(e) => {
              // Modifier shortcuts belong to the form; never consume Ctrl/Cmd+Enter as a pick.
              if (e.ctrlKey || e.metaKey || e.altKey) return;
              if (!open) {
                if (e.key === 'ArrowDown') setDismissed(false);
                return;
              }
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const n = shown.length;
                if (n === 0) return;
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
            <div className="combo-list" id={listId} tabIndex={overlayCapture ? -1 : undefined}>
              <ul
                className="combo-options"
                id={`${listId}-options`}
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
              {action && (
                <button
                  type="button"
                  className="btn btn-ghost combo-action"
                  // Matching categories keep the form's Tab order; an unmatched search exposes creation.
                  tabIndex={shown.length > 0 ? -1 : 0}
                  onMouseDown={(e) => e.preventDefault()}
                  onKeyDown={(e) => {
                    if (e.ctrlKey || e.metaKey || e.altKey) return;
                    if (e.key === 'Enter') e.stopPropagation();
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.closest('.combo')?.querySelector('input')?.focus();
                      setDismissed(true);
                    }
                  }}
                  onClick={(e) => {
                    // The dialog must restore the input, since this button disappears on close.
                    e.currentTarget.closest('.combo')?.querySelector('input')?.focus();
                    setDismissed(true);
                    action.onSelect();
                  }}
                >
                  {action.label}
                </button>
              )}
            </div>
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
