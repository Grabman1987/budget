import { useLayoutEffect, useRef } from 'react';
import { cx } from './cx';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  description?: string;
}

export interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  /** Segments share the width equally (dialogs, mobile). */
  stretch?: boolean;
  className?: string;
  /** Selected segment is a filled pill that slides to the new selection. */
  slide?: boolean;
}

/** Segmented switch: 8 px frame with 4 px padding, active segment as ink fill. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  stretch = false,
  className,
  slide = false,
}: SegmentedProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const selected = options.some((option) => option.value === value);

  // The pill is placed from the selected button's own offsets (relative to the group, which is
  // its offset parent and the pill's containing block), so unequal segment widths work. It is
  // re-placed on every render and whenever the group or a button changes size (resize, font
  // load, sheet open animation), so it can never be left at a stale size.
  useLayoutEffect(() => {
    if (!slide) return;
    const group = groupRef.current;
    const thumb = thumbRef.current;
    if (!group || !thumb) return;
    const place = () => {
      const button = group.querySelector<HTMLElement>('button[aria-pressed="true"]');
      if (!button) return;
      thumb.style.width = `${button.offsetWidth}px`;
      thumb.style.height = `${button.offsetHeight}px`;
      thumb.style.transform = `translate(${button.offsetLeft}px, ${button.offsetTop}px)`;
    };
    place();
    // Animate only after the first placement.
    const frame = requestAnimationFrame(() => {
      thumb.dataset['animate'] = '1';
    });
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(place);
      observer.observe(group);
      for (const button of group.querySelectorAll('button')) observer.observe(button);
    }
    void document.fonts?.ready.then(place);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  });

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={label}
      className={cx('seg', stretch && 'seg-stretch', slide && 'seg-slide', className)}
    >
      {slide && selected && <span ref={thumbRef} className="seg-thumb" aria-hidden="true" />}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          disabled={option.disabled}
          title={option.description}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
