import {
  useAmountPrivacy,
  maskMoneyText,
  formatPrivateEuro as formatEuro,
} from '../amount-privacy';
import { formatDecimal, hasOperator, parseAmount, type Cents } from '@budget/domain';
import { useId, useLayoutEffect, useRef } from 'react';
import { cx } from './cx';

export interface AmountInputProps {
  /** Native unit of the input; defaults to EUR for existing budget forms. */
  currency?: string;
  /** Booking capture uses a hint instead of operator buttons. */
  showOperators?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Called with the evaluated amount when the user presses Enter or leaves the field with a valid value. */
  onCommit?: (amount: Cents) => void;
  /** Sign in front of the amount: "−" expense, "+" income, none for transfers. */
  sign?: '−' | '+' | null;
  /** Field-level error (Rotstift text below the field). */
  error?: string | undefined;
  autoFocus?: boolean;
  disabled?: boolean;
}

const OPERATORS = [
  { char: '+', name: 'Plus' },
  { char: '−', name: 'Minus' },
  { char: '×', name: 'Mal' },
  { char: '÷', name: 'Geteilt durch' },
] as const;

const HINT_DEFAULT = 'Rechnen direkt im Feld, z. B. 12,50+8,20. Enter rechnet aus.';
const HINT_INVALID = 'Das lässt sich nicht ausrechnen. Erlaubt sind Zahlen und + − × ÷.';

/**
 * Amount field with inline arithmetic (no keypad, no eval): the text is evaluated by the domain
 * parser, operator buttons insert at the caret, Enter (or leaving the field with a valid value)
 * commits the result and shows it as `1.234,56`. Invalid input is never committed.
 */
export function AmountInput({
  currency = 'EUR',
  showOperators = true,
  label,
  value,
  onChange,
  onCommit,
  sign = null,
  error,
  autoFocus,
  disabled,
}: AmountInputProps) {
  const hidden = useAmountPrivacy();
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  // Restore the caret after an operator was inserted (the value change re-renders the input).
  useLayoutEffect(() => {
    if (caret.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [value]);

  const result = parseAmount(value);
  const calculating = hasOperator(value);
  const invalid = value.trim() !== '' && !result.ok;

  const commit = () => {
    if (!result.ok) return;
    const text = formatDecimal(result.cents);
    if (text !== value) onChange(text);
    onCommit?.(result.cents);
  };

  const insert = (char: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    caret.current = start + 1;
    onChange(value.slice(0, start) + char + value.slice(end));
    input?.focus();
  };

  let hint = showOperators ? HINT_DEFAULT : 'Rechnen im Feld möglich: 12,50+3';
  if (invalid) hint = HINT_INVALID;
  else if (calculating && result.ok) {
    hint = `= ${currency === 'EUR' ? formatEuro(result.cents) : `${hidden ? '•••' : formatDecimal(result.cents)} ${currency}`}  ·  Enter übernimmt das Ergebnis`;
  }

  return (
    <div className="field-row amount">
      <label htmlFor={id}>{label}</label>
      <div className={cx('amount-box', (invalid || error) && 'is-invalid')}>
        {showOperators && (
          <div className="amount-ops" role="group" aria-label="Rechenzeichen">
            {OPERATORS.map((op) => (
              <button
                key={op.char}
                type="button"
                aria-label={op.name}
                disabled={disabled}
                // Keep the caret in the field when a button is pressed.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(op.char)}
              >
                {op.char}
              </button>
            ))}
          </div>
        )}
        {sign && (
          <span className="amount-sign" aria-hidden="true">
            {sign}
          </span>
        )}
        <input
          ref={inputRef}
          id={id}
          className="amount-input"
          type={hidden ? 'password' : 'text'}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          // Opt-in by the caller (capture dialog moves focus to the amount on open).
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          disabled={disabled}
          value={value}
          placeholder={hidden ? '•••' : '0,00'}
          aria-invalid={invalid || Boolean(error)}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
        />
        <span className="amount-cur" aria-hidden="true">
          {currency === 'EUR' ? '€' : currency}
        </span>
      </div>
      {/* Always mounted so that the calculated result is announced (polite) when it appears. */}
      <p
        id={hintId}
        className={cx('amount-hint', calculating && result.ok && 'is-result')}
        aria-live="polite"
        aria-atomic="true"
      >
        {hint}
      </p>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {maskMoneyText(error)}
        </p>
      )}
    </div>
  );
}
