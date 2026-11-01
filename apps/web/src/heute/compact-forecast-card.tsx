import { useAmountPrivacy } from '@budget/ui';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { expectedQuery } from '../expected/api';
import { eur, longDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { LiquidityChart } from '../reports/liquidity-chart';
import { liquidityQuery } from '../reports/liquidity-api';
import { salaryDay } from '../reports/liquidity-selection';
import { AppLink } from '../shell/app-link';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import type { Heute } from './api';

/** Stand-today forecast: exactly the same read and unmodified series as the linked detail. */
export function CompactForecastCard({
  data,
  read,
}: {
  data: Pick<Heute, 'forecast35d'> | undefined;
  read: Pick<UseQueryResult<Heute>, 'isPending' | 'isFetching' | 'isError'>;
}) {
  useAmountPrivacy();
  // A failed aggregate read must not suppress the independently usable canonical forecast.
  const savedSource = REDESIGN_ENABLED && !read.isError;
  const forecast = useQuery({ ...liquidityQuery('35d', []), enabled: !savedSource });
  const payments = useQuery(expectedQuery());
  const pending = savedSource
    ? read.isPending || read.isFetching
    : forecast.isPending || forecast.isFetching;
  const view = pending
    ? undefined
    : savedSource
      ? data?.forecast35d
      : !forecast.isError
        ? forecast.data
        : undefined;
  const unavailable = view && 'unavailable' in view ? view.unavailable : undefined;
  const report = view && !('unavailable' in view) ? view.report : undefined;
  const salaryIds = new Set(
    (!payments.isFetching && !payments.isPending && !payments.isError ? (payments.data ?? []) : [])
      .filter((payment) => payment.incomeTypeId === 'income-salary')
      .map((payment) => payment.id),
  );
  return (
    <section
      className="heute-section heute-compact-forecast"
      aria-labelledby="heute-forecast-title"
      aria-busy={pending || undefined}
    >
      <div className="heute-compact-forecast-head">
        <h2 id="heute-forecast-title">Kontoprognose · 35 Tage</h2>
        <AppLink
          className="btn btn-ghost"
          to="/plan/prognose"
          search={{ horizon: '35d', levers: '' }}
          aria-label="Details zur Kontoprognose für 35 Tage"
        >
          Details
        </AppLink>
      </div>
      <p className="heute-note">
        {view ? (
          <>Stand heute · {longDay(view.asOf)}</>
        ) : pending ? (
          'Stand wird noch geladen'
        ) : (
          'Stand nicht verfügbar'
        )}{' '}
        · ohne Stellschrauben
        {' · Budget-Konten; Kreditkarten im Budget eingeschlossen, Reservekonten ausgeschlossen.'}
      </p>
      {report ? (
        <LiquidityChart report={report} salaryDay={salaryDay(report, salaryIds)} compact />
      ) : (
        <div className="rf-chart heute-forecast-state">
          {pending ? (
            <LoadingNote what="Kontoprognose" />
          ) : unavailable ? (
            <EmptyNote>{unavailable.message}</EmptyNote>
          ) : !savedSource && forecast.isError ? (
            <ErrorNote
              what="Kontoprognose"
              error={forecast.error}
              onRetry={() => void forecast.refetch()}
            />
          ) : savedSource && !view ? (
            <EmptyNote>Die gespeicherte 35-Tage-Prognose ist nicht verfügbar.</EmptyNote>
          ) : (
            <EmptyNote>Ohne Budget-Konto gibt es keine Kontoprognose.</EmptyNote>
          )}
        </div>
      )}
      <p
        className={report ? 'heute-forecast-low' : 'heute-forecast-low-state'}
        data-day={report?.low?.day}
        data-cents={report?.low?.cents}
        aria-hidden={!report || undefined}
      >
        {report?.low ? (
          <>
            Tiefpunkt: <strong>{eur(report.low.cents)}</strong>
            {' · '}am {longDay(report.low.day)}
          </>
        ) : report ? (
          'Kein Tiefpunkt verfügbar.'
        ) : pending ? (
          'Tiefpunkt wird geladen.'
        ) : (
          'Tiefpunkt nicht verfügbar.'
        )}
      </p>
    </section>
  );
}
