import { cents, formatPercent, type VerdictMetric } from '@budget/domain';
import {
  DimensionChain,
  maskMoneyText,
  privateAmount,
  useAmountPrivacy,
  type DimensionChainTerm,
} from '@budget/ui';
import { useParams } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { eur, longDay } from '../ledger/format';
import { PageFrame as LegacyPageFrame, type PageFrameProps } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { hubReport } from './report-hub-model';
import { ReportNavigation } from './report-navigation';
import { VerdictLine } from './verdict-line';
import './report-frame.css';
import '../charts/report-heatmap.css';

/** Supplied by the existing reader. The frame never aggregates or infers missing terms. */
export interface ReportCalculation {
  label: string;
  terms: readonly DimensionChainTerm[];
  result: VerdictMetric;
  precision?: 'cent' | 'euro';
  signed?: boolean;
  /** Source-formatted non-money inputs, such as indices or percentages. */
  displayTerms?: readonly { label: string; text: string; op?: string }[];
  pointsLabel?: string;
}
export interface ReportFrameProps extends PageFrameProps {
  calculation?: ReportCalculation | undefined;
  sourceDate?: string | undefined;
  sourceReportId?: string | undefined;
}

function metricText(
  metric: VerdictMetric | undefined,
  signed = false,
  pointsLabel = 'Punkte',
): string {
  if (metric?.value === null || metric?.value === undefined) return '—';
  if (metric.unit === 'money') return eur(metric.value, { sign: signed });
  if (metric.unit === 'percent') return privateAmount(formatPercent(metric.value));
  return privateAmount(
    `${signed && metric.value > 0 ? '+' : ''}${new Intl.NumberFormat('de-AT').format(metric.value).replace('-', '−')}${metric.unit === 'points' ? ` ${pointsLabel}` : ''}`,
  );
}

/** OFF delegates unchanged. ON composes existing controls, readers and calculation facts. */
export function ReportFrame(props: ReportFrameProps) {
  if (!REDESIGN_ENABLED || props.meta.area !== 'reports') return <LegacyPageFrame {...props} />;
  return <RedesignReportFrame {...props} />;
}

function RedesignReportFrame({
  meta,
  title,
  subtitle,
  extraFields = [],
  reportControls,
  reportDataBasis,
  reportStand,
  calculation: suppliedCalculation,
  sourceDate,
  sourceReportId,
  verdict,
  verdictTestId,
  children,
}: ReportFrameProps) {
  useAmountPrivacy();
  const params = useParams({ strict: false }) as { reportId?: string };
  const id =
    sourceReportId ?? params.reportId ?? verdict?.reportId ?? location.pathname.split('/')[2] ?? '';
  const catalog = hubReport(id);
  const name = catalog?.id === id ? catalog.name : (title ?? meta.title);
  const calculation = verdict?.unavailable ? undefined : suppliedCalculation;
  const result = verdict?.unavailable ? undefined : (calculation?.result ?? verdict?.metric);
  const inputs =
    calculation?.terms.at(-1)?.result || calculation?.terms.at(-1)?.op === '='
      ? calculation.terms.slice(0, -1)
      : calculation?.terms;
  const explanation: ReactNode = subtitle?.replace(/^[\d.]+\s*·\s*/, '');
  return (
    <div className="redesign-report-frame">
      <header className="redesign-report-head" data-testid="redesign-report-head">
        <div className="redesign-report-heading">
          <AppLink className="redesign-report-back" to="/reports">
            <ChevronLeft size={16} aria-hidden="true" />
            Reports
          </AppLink>
          <div className="redesign-report-title">
            <h1>{maskMoneyText(name)}</h1>
            {id && <ReportNavigation id={id} />}
          </div>
          {catalog && <p className="redesign-report-number">Report {catalog.no}</p>}
          <div className="redesign-report-controls">
            {extraFields.map((field) => (
              <div key={field.label} className="redesign-report-control">
                <span className="sr-only">{field.label}</span>
                {field.value}
              </div>
            ))}
          </div>
        </div>
        <div className="redesign-report-calculation" data-testid="report-calculation">
          {calculation && (
            <div className="redesign-report-equation">
              {calculation.displayTerms ? (
                <div className="chain-inline" role="group" aria-label={calculation.label}>
                  {calculation.displayTerms.map((term, index) => (
                    <span className="ct-pair" key={index}>
                      {term.op && <span className="ct-op">{term.op}</span>}
                      <span className="ct-term">
                        <span className="ct-label">{term.label}</span>
                        <span className="ct-val">{privateAmount(term.text)}</span>
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <DimensionChain
                  label={calculation.label}
                  terms={inputs ?? []}
                  precision={calculation.precision ?? 'cent'}
                />
              )}
              <span aria-hidden="true">=</span>
            </div>
          )}
          <strong className="redesign-report-result" data-testid="report-frame-result">
            {metricText(result, calculation?.signed, calculation?.pointsLabel)}
          </strong>
          {result && (
            <span className="redesign-report-result-label">{maskMoneyText(result.label)}</span>
          )}
          {verdict?.partial && <span className="redesign-report-result-label">Teilzeitraum</span>}
          {verdict?.estimated && (
            <span className="redesign-report-result-label">≈ Bewertung teilweise geschätzt</span>
          )}
        </div>
        <div className="redesign-report-source" data-testid="report-frame-source">
          <span>
            Datenbasis:{' '}
            <span data-testid="report-frame-basis">{reportDataBasis ?? 'wird geladen'}</span>
          </span>
          {sourceDate && <span>Stand {longDay(sourceDate)}</span>}
          {reportStand && (
            <span>
              {reportStand.label}: <span data-testid="report-frame-stand">{reportStand.value}</span>
            </span>
          )}
        </div>
        {reportControls && <div className="redesign-report-extra-controls">{reportControls}</div>}
      </header>
      {(explanation || verdict || calculation) && (
        <details className="redesign-report-detail">
          <summary>Berechnung und Einordnung</summary>
          {explanation && (
            <p>{typeof explanation === 'string' ? maskMoneyText(explanation) : explanation}</p>
          )}
          {calculation && (
            <dl>
              {inputs?.map((term, index) => (
                <div key={`${term.label}-${index}`}>
                  <dt>
                    {term.op && (
                      <span className="sr-only">
                        {{ '+': 'Plus ', '-': 'Minus ', '=': 'Gleich ' }[term.op]}
                      </span>
                    )}
                    {maskMoneyText(term.label)}
                  </dt>
                  <dd>{eur(cents(term.value))}</dd>
                </div>
              ))}
              {calculation.displayTerms?.map((term, index) => (
                <div key={`display-${index}`}>
                  <dt>
                    {term.op} {term.label}
                  </dt>
                  <dd>{privateAmount(term.text)}</dd>
                </div>
              ))}
              <div>
                <dt>{maskMoneyText(calculation.result.label)}</dt>
                <dd>
                  {metricText(calculation.result, calculation.signed, calculation.pointsLabel)}
                </dd>
              </div>
            </dl>
          )}
          {verdict && (
            <VerdictLine facts={verdict} {...(verdictTestId ? { testId: verdictTestId } : {})} />
          )}
        </details>
      )}
      {children}
    </div>
  );
}

/** Keep wide financial tables readable and keyboard-scrollable on small screens. */
export function ReportTableScroll({ label, children }: { label: string; children: ReactNode }) {
  if (!REDESIGN_ENABLED) return <>{children}</>;
  return (
    <div
      className="redesign-report-table-scroll"
      role="region"
      aria-label={`${label}, bei Bedarf horizontal verschiebbar`}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users need to scroll the complete financial table.
      tabIndex={0}
    >
      {children}
    </div>
  );
}
