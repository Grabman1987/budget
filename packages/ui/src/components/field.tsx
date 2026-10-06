import { useId, type ComponentProps, type ReactNode } from 'react';
import { cx } from './cx';
import { maskMoneyText, useAmountPrivacy } from '../amount-privacy';
import { DateInput } from './date-input';

export interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Label above, control, optional hint and error (Rotstift text) below. */
export function Field({ label, error, hint, children }: FieldProps) {
  useAmountPrivacy();
  const id = useId();
  const messageId = `${id}-msg`;
  const describedBy = error || hint ? messageId : undefined;
  return (
    <div className="field-row">
      <label htmlFor={id}>{label}</label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={messageId} className="field-error" role="alert">
          {maskMoneyText(error)}
        </p>
      ) : hint ? (
        <p id={messageId} className="field-hint">
          {typeof hint === 'string' ? maskMoneyText(hint) : hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  className,
  money = false,
  ...rest
}: ComponentProps<'input'> & { money?: boolean }) {
  const hidden = useAmountPrivacy();
  if (rest.type === 'date') return <DateInput className={cx('input', className)} {...rest} />;
  return (
    <input
      className={cx('input', className)}
      {...rest}
      {...(money && hidden ? { type: 'password' } : {})}
    />
  );
}

export function Select({ className, ...rest }: ComponentProps<'select'>) {
  return <select className={cx('select', className)} {...rest} />;
}
