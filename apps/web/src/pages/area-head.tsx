import { Segmented, StandValue, TitleBlock, type TitleBlockField } from '@budget/ui';
import { ChevronLeft, ChevronRight, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { monthLabel } from '../nav/month';
import type { PageMeta } from '../nav/pages';
import { useMonth } from '../shell/use-month';
import { useWealthPeriod, type WealthPeriod } from '../wealth/portfolio-period';

type Period = 'month' | 'payday';

const PERIODS = [
  { value: 'month', label: 'Monat' },
  { value: 'payday', label: 'Bis Gehalt' },
] as const;
const RANGES = ['1M', '3M', 'YTD', '1J', '3J', 'Alles'].map((value) => ({ value, label: value }));

export interface AreaHeadProps {
  meta: PageMeta;
  /** Replaces the title text (single account, single report). */
  title?: string | undefined;
  /** Short line next to the title; used by Reports only. */
  subtitle?: string | undefined;
  /** Cells after the area's own fields. */
  extraFields?: TitleBlockField[] | undefined;
  /** Placeholder pages say which package fills them. */
  placeholder?: boolean | undefined;
  /** Plan: the month's income in the title block. */
  income?: React.ReactNode;
  /** Replaces the value of the "Stand" cell. */
  stand?: React.ReactNode;
}

/** Areas whose title cell stays visible on the phone (it carries the month switch). */
export const TITLE_ON_MOBILE_AREAS: ReadonlySet<string> = new Set(['plan']);

const packageOf = (fills: string) => fills.split(/[\s;,]/)[0] ?? fills;

/**
 * Title block of a page, one per area exactly as in the prototype: Heute and Plan show the month
 * (Plan with previous/next), Konten and Vermögen the area name, then the area's fields (Stand,
 * Zeitraum, Einnahmen, Bank-Sync, Profil). There is no question or tagline on area pages.
 */
export function AreaHead({
  meta,
  title,
  subtitle,
  extraFields = [],
  placeholder,
  income,
  stand: standValue,
}: AreaHeadProps) {
  const [month, shift] = useMonth();
  const [period, setPeriod] = useState<Period>('month');
  const [range, setRange] = useWealthPeriod();
  const stand: TitleBlockField = { label: 'Stand', value: standValue ?? <StandValue /> };

  let heading: string | undefined;
  let titleNode: React.ReactNode;
  let fields: TitleBlockField[];
  let titleOnMobile = false;

  switch (meta.area) {
    case 'heute':
      heading = monthLabel(month);
      fields = [
        stand,
        {
          label: 'Zeitraum',
          value: (
            <Segmented
              label="Zeitraum"
              options={PERIODS}
              value={period}
              onChange={(value) => setPeriod(value)}
            />
          ),
        },
      ];
      break;
    case 'plan':
      titleNode = (
        <div className="month-switch">
          <button
            type="button"
            className="icon-btn"
            aria-label="Vormonat"
            onClick={() => shift(-1)}
          >
            <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <h1>{monthLabel(month)}</h1>
          <button
            type="button"
            className="icon-btn"
            aria-label="Nächster Monat"
            onClick={() => shift(1)}
          >
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      );
      titleOnMobile = TITLE_ON_MOBILE_AREAS.has('plan');
      fields = [
        { ...stand, hideOnMobile: true },
        { label: 'Einnahmen', value: income ?? '–', labelOnMobile: true },
      ];
      break;
    case 'konten':
      heading = 'Konten';
      fields = [stand, { label: 'Bank-Sync', value: 'nicht eingerichtet', labelOnMobile: true }];
      break;
    case 'vermoegen':
      heading = 'Vermögen';
      fields = [
        // Six range buttons need the whole strip on the phone, as in the prototype.
        { ...stand, hideOnMobile: true },
        {
          label: 'Zeitraum',
          value: (
            <Segmented
              label="Zeitraum"
              options={RANGES}
              value={range}
              onChange={(value) => setRange(value as WealthPeriod)}
            />
          ),
        },
      ];
      break;
    case 'einstellungen':
      heading = 'Einstellungen';
      fields = [
        {
          label: 'Profil',
          value: (
            <>
              <KeyRound className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
              Passkey · dieses Gerät
            </>
          ),
        },
      ];
      break;
    case 'reports':
      heading = 'Reports';
      // As in the prototype; the phone shows the registers right under the header.
      fields = [
        { ...stand, hideOnMobile: true },
        { label: 'Datenbasis', value: 'Okt 2023 bis heute', hideOnMobile: true },
      ];
      break;
  }

  const all = [
    ...fields,
    ...extraFields,
    ...(placeholder
      ? [
          {
            label: 'Gefüllt in',
            value: `Paket ${packageOf(meta.fills)}`,
            // The page body says the same in a sentence; the phone strip stays short.
            hideOnMobile: true,
          },
        ]
      : []),
  ];
  return (
    <TitleBlock
      title={titleNode ?? title ?? heading ?? meta.title}
      {...(subtitle ? { subtitle } : {})}
      fields={all}
      compactOnMobile
      titleOnMobile={titleOnMobile}
    />
  );
}
