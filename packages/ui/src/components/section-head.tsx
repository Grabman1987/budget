import type { ReactNode } from 'react';

/** Circled number in front of a detail section title (Detailausschnitt), or a group number. */
export function CircleNumber({ n, size = 'md' }: { n: number | string; size?: 'md' | 'sm' }) {
  return (
    <span className={size === 'sm' ? 'circle-no circle-no-sm' : 'circle-no'} aria-hidden="true">
      {n}
    </span>
  );
}

export interface SectionHeadProps {
  title: ReactNode;
  /** Detail number 1–5 shown as circled number before the title. */
  detail?: number;
  /** Right-aligned link or text in `ink-2`. */
  aside?: ReactNode;
  id?: string;
  level?: 'h2' | 'h3';
}

/** Section head: title, optional aside, hairline below. There are no cards. */
export function SectionHead({ title, detail, aside, id, level: Heading = 'h2' }: SectionHeadProps) {
  return (
    <div className="head">
      {detail !== undefined && <CircleNumber n={detail} />}
      <Heading id={id}>{title}</Heading>
      {aside && <span className="aside">{aside}</span>}
    </div>
  );
}
