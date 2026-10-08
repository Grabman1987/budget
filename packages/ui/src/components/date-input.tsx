import { useEffect, useRef, type ComponentProps } from 'react';

/** German display; form state keeps ISO dates and incomplete input stays editable. */
export function DateInput({
  value = '',
  onChange,
  min,
  max,
  ref,
  ...rest
}: ComponentProps<'input'>) {
  const input = useRef<HTMLInputElement>(null);
  const raw = String(value);
  const iso = raw.replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, '$3-$2-$1');
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(iso) &&
    Number.isFinite(Date.parse(iso)) &&
    new Date(iso).toISOString().slice(0, 10) === iso;
  useEffect(() => {
    input.current?.setCustomValidity(
      !raw || (valid && (!min || iso >= String(min)) && (!max || iso <= String(max)))
        ? ''
        : 'Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben.',
    );
  }, [raw, iso, valid, min, max]);
  return (
    <input
      {...rest}
      ref={(node) => {
        input.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      type="text"
      inputMode="numeric"
      placeholder="TT.MM.JJJJ"
      pattern="[0-9]{2}\.[0-9]{2}\.[0-9]{4}"
      value={raw.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3.$2.$1')}
      onChange={(event) => {
        const next = event.target.value.replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, '$3-$2-$1');
        onChange?.({
          ...event,
          target: { ...event.target, value: next },
          currentTarget: { ...event.currentTarget, value: next },
        });
      }}
    />
  );
}
