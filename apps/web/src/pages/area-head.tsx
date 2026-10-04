import { useParams } from '@tanstack/react-router';
import { ReportNavigation } from '../reports/report-navigation';
import { Segmented, StandValue, TitleBlock, type TitleBlockField } from '@budget/ui';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { monthLabel, monthRangeLabel } from '../nav/month';
import { useMonthSpan } from '../budget/month-span';
import { MonthSwitch } from '../shell/month-switch';
import { VermoegenStand, ZeitraumSwitch } from '../wealth/frame';
import type { PageMeta } from '../nav/pages';
import { currentMonth, useMonth } from '../shell/use-month';
import type { HeutePeriod } from '../heute/api';

type Period = 'month' | 'payday';

const PERIODS = [
  { value: 'month', label: 'Monat' },
  { value: 'payday', label: 'Bis Gehalt' },
] as const;

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
  heutePeriod?: HeutePeriod;
  onHeutePeriodChange?: (period: HeutePeriod) => void;
  standDay?: string | undefined;
  reportDataBasis?: React.ReactNode | undefined;
  reportStand?: TitleBlockField | undefined;
}

/** Areas whose title cell stays visible on the phone (it carries the month switch). */
export const TITLE_ON_MOBILE_AREAS: ReadonlySet<string> = new Set(['plan', 'heute']);

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
  heutePeriod,
  onHeutePeriodChange,
  standDay,
  reportDataBasis,
  reportStand,
}: AreaHeadProps) {
  const { reportId } = useParams({ strict: false }) as { reportId?: string };
  const [month] = useMonth();
  const span = useMonthSpan();
  const [period, setPeriod] = useState<Period>('month');
  const paydayAvailable = month === (standDay?.slice(0, 7) ?? currentMonth());
  const periods = PERIODS.map((option) =>
    option.value === 'payday' && !paydayAvailable
      ? {
          ...option,
          disabled: true,
          description: 'Bis Gehalt ist nur im aktuellen Monat verfügbar.',
        }
      : option,
  );
  const stand: TitleBlockField = { label: 'Stand', value: <StandValue /> };

  let heading: string | undefined;
  let titleNode: React.ReactNode;
  let fields: TitleBlockField[];
  let titleOnMobile = false;

  switch (meta.area) {
    case 'heute':
      titleNode = <MonthSwitch heading={monthLabel(month)} />;
      titleOnMobile = TITLE_ON_MOBILE_AREAS.has('heute');
      fields = [
        {
          label: 'Stand',
          hideOnMobile: true,
          value: <StandValue day={standDay} label={standDay ? 'Heute' : undefined} none="…" />,
        },
        {
          label: 'Zeitraum',
          value: (
            <Segmented
              label="Zeitraum"
              options={periods}
              value={paydayAvailable ? (heutePeriod ?? period) : 'month'}
              onChange={(value) =>
                onHeutePeriodChange ? onHeutePeriodChange(value) : setPeriod(value)
              }
            />
          ),
        },
      ];
      break;
    case 'plan':
      titleNode = <MonthSwitch heading={monthRangeLabel(month, span)} />;
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
        { label: 'Stand', value: <VermoegenStand />, hideOnMobile: true },
        { label: 'Zeitraum', value: <ZeitraumSwitch /> },
      ];
      if (meta.register === 'freiheit' || meta.register === 'schulden')
        fields = fields.filter((field) => field.label !== 'Zeitraum');
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
      if (reportId) {
        titleNode = (
          <div className="report-heading">
            <h1>{title ?? meta.title}</h1>
            <ReportNavigation id={reportId} />
          </div>
        );
        titleOnMobile = true;
      }
      // As in the prototype; the phone shows the registers right under the header.
      fields = [
        { ...(reportStand ?? stand), hideOnMobile: true },
        {
          label: 'Datenbasis',
          value: reportDataBasis ?? 'Okt 2023 bis heute',
          hideOnMobile: true,
        },
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
      {...(meta.area === 'heute' ? { className: 'titleblock-stack' } : {})}
    />
  );
}
