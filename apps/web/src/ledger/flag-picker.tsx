import { cx } from '@budget/ui';
import { Flag } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { FLAG_KEY, FLAG_LABEL } from './labels';
import { BOOKING_FLAGS, type BookingFlag } from './types';

/**
 * A flag as a coloured glyph. The colour is never the only signal: the name is read out and shown
 * as a tooltip. `flag` empty draws the outline in the neutral ink (the "no flag" state).
 */
export function FlagGlyph({
  flag,
  size = 16,
  named = true,
}: {
  flag: BookingFlag | '' | null;
  size?: number;
  /** Add the screen-reader name ("Markierung Rot"); off where the surrounding control names it. */
  named?: boolean;
}) {
  return (
    <>
      <Flag
        className={cx('icon kflag-glyph', flag ? `is-${flag}` : 'is-none')}
        size={size}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      {named && flag && <span className="sr-only">Markierung {FLAG_LABEL[flag]}</span>}
    </>
  );
}

const NONE = '';

/**
 * YNAB-style flag button: shows the current flag and opens a small popover with the six colours
 * (keys 1 to 6) and "keine" (key 0). Arrow keys move, Enter picks, Esc closes the popover only
 * (the dialog around it keeps its own Esc), focus returns to the button.
 */
export function FlagPicker({
  value,
  onChange,
  disabled = false,
  context,
  className,
  title,
}: {
  value: BookingFlag | '';
  onChange: (flag: BookingFlag | '') => void;
  disabled?: boolean;
  /** In a list: what the flag belongs to; the button then reads "Markierung ändern: …". */
  context?: string;
  className?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const current = value ? FLAG_LABEL[value] : 'keine';
  const buttonLabel = context
    ? `Markierung ändern: ${context}, aktuell ${current}`
    : `Markierung: ${current}`;
  const choices: ReadonlyArray<BookingFlag | ''> = [...BOOKING_FLAGS, NONE];

  const items = () =>
    Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);

  // Focus the current choice when the popover opens.
  useEffect(() => {
    if (!open) return;
    const list = items();
    (list[Math.max(0, choices.indexOf(value))] ?? list[0])?.focus();
    // In a table near the bottom of the screen the popover is brought into view.
    if (context)
      wrap.current?.querySelector('[role="menu"]')?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A click outside closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const pick = (flag: BookingFlag | '') => {
    onChange(flag);
    setOpen(false);
    trigger.current?.focus();
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      list[e.key === 'Home' ? 0 : list.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      pick(NONE);
    } else {
      const hit = BOOKING_FLAGS.find((f) => FLAG_KEY[f] === e.key);
      if (hit) {
        e.preventDefault();
        pick(hit);
      }
    }
  };

  return (
    <div className={cx('kflagpick', context && 'in-list')} ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className={cx('kflagbtn', value && 'has-flag', className)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={buttonLabel}
        title={title ?? (context ? `Markierung ändern (${current})` : buttonLabel)}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <FlagGlyph flag={value} size={18} named={false} />
      </button>
      {open && (
        // The menu items are real buttons; the container only routes the number keys and arrows.
        <div
          id={menuId}
          className="kflagmenu"
          role="menu"
          tabIndex={-1}
          aria-label="Markierung wählen"
          onKeyDown={onMenuKey}
        >
          {choices.map((flag) => (
            <button
              key={flag || 'none'}
              type="button"
              role="menuitemradio"
              aria-checked={flag === value}
              aria-keyshortcuts={flag ? FLAG_KEY[flag] : '0'}
              className="kflagitem"
              onClick={() => pick(flag)}
            >
              <FlagGlyph flag={flag} size={16} named={false} />
              <span className="kflagitem-name">{flag ? FLAG_LABEL[flag] : 'keine'}</span>
              <kbd aria-hidden="true">{flag ? FLAG_KEY[flag] : '0'}</kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
