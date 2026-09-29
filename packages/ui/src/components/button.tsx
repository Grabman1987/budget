import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `alert` (Rotstift) is only for the one urgent action of a revision. */
  variant?: 'primary' | 'ghost' | 'alert';
  size?: 'md' | 'sm' | 'xs';
}

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, className)}
      {...rest}
    />
  );
}
