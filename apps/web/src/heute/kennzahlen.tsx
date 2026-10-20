import { useAmountPrivacy } from '@budget/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { availableInEnvelopes, planRows } from '../budget/plan-model';
import type { BudgetMonthView } from '../budget/budget-api';
import { eur, eurWhole, longDay, shortDay } from '../ledger/format';
import { monthLabel } from '../nav/month';
import { ErrorNote } from '../ledger/states';
import { ValuationSourceHint } from '../ledger/valuation-hint';
import { AppLink } from '../shell/app-link';
import type { Heute } from './api';

/**
 * The three Kennzahlen of Heute (#571): Zu verteilen · Verfügbar im Budget · Nettovermögen, each
 * with the value, a bar and one context line of at most 40 characters. In the mode "Bis Gehalt" the
 * middle one is "Frei bis Gehalt". All values are figures that exist elsewhere (Plan, Plan
 * inspector, Vermögen, Heute lead); nothing is calculated here. Explanations sit behind ⓘ.
 */
export function Kennzahlen({
  data,
  budget,
  chainOpen = false,
  onLeadClick,
}: {
  data: Pick<
    Heute,
    | 'stand'
    | 'netWorth'
    | 'budgetAnswer'
    | 'nearestGoal'
    | 'monthResult'
    | 'lead'
    | 'balance'
    | 'valuationSources'
  >;
  budget: UseQueryResult<BudgetMonthView>;
  chainOpen?: boolean;
  onLeadClick: () => void;
}) {
  useAmountPrivacy();
  const net = 'unavailable' in data.netWorth ? null : data.netWorth;
  const change = net && !('unavailable' in net.monthChange) ? net.monthChange : null;
  const plan = data.budgetAnswer;
  const householdMonth = data.stand.today.slice(0, 7);
  const payday = data.stand.period === 'payday';
  const month = budget.data;
  const summary = month?.summary;
  const available = month ? availableInEnvelopes(planRows(month)) : null;
  const goal = data.nearestGoal;
  return (
    <div className="heute-answers heute-kennzahlen" data-testid="heute-kennzahlen">
      {data.stand.month && data.stand.month !== householdMonth && (
        <p className="heute-note">Stand heute · {longDay(data.stand.today)}</p>
      )}
      <div className="heute-answer-grid">
        <Kennzahl
          id="zu-verteilen"
          label="Zu verteilen"
          state={budget}
          value={summary?.toBeAssignedCents ?? 0}
          alert={(summary?.toBeAssignedCents ?? 0) < 0}
          nonpositive={summary?.toBeAssignedCents === 0}
          href={{ to: '/plan/monat', search: { monat: data.stand.month } }}
          bar={
            summary && {
              value: summary.assignedCents,
              total: summary.carryInCents + summary.incomeCents,
              label: `Zugewiesen ${eur(summary.assignedCents)} · Übertrag ${eur(summary.carryInCents)} · Einnahmen ${eur(summary.incomeCents)}`,
            }
          }
          line={summary && `Zugewiesen ${eurWhole(summary.assignedCents)}`}
          note={
            summary && (
              <>
                {`Geld, das noch keinem Envelope zugewiesen ist: Übertrag ${eur(summary.carryInCents)} + Einnahmen ${eur(summary.incomeCents)} − Ungedeckt ${eur(summary.uncoveredCents)} − Zugewiesen ${eur(summary.assignedCents)} − Gehalten ${eur(summary.heldCents)}. Dieselbe Zahl wie im Plan. `}
                {`Haushaltseinnahmen ${eur(data.monthResult.earnedCents)} im ${monthLabel(householdMonth)} nach Buchungsdatum. Mit „Für nächsten Monat“ zählt der Zufluss im Plan erst im Folgemonat. `}
                <AppLink to="/plan/monat/einnahmen" search={{ monat: householdMonth }}>
                  Planmonat {monthLabel(householdMonth)} ansehen
                </AppLink>
              </>
            )
          }
        />
        {payday ? (
          <Kennzahl
            id="frei-bis-gehalt"
            label="Frei bis Gehalt"
            value={data.lead.freeCents}
            alert={data.lead.freeCents < 0}
            onValueClick={onLeadClick}
            expanded={chainOpen}
            controls="heute-lead-chain"
            testId="heute-lead-value"
            ariaLabel={`Frei verfügbar bis Gehalt: ${eur(data.lead.freeCents)}. Herleitung ${chainOpen ? 'ausblenden' : 'zeigen'}`}
            bar={{
              value: plan.spentCents,
              total: plan.plannedCents,
              label: `Ausgegeben ${eur(plan.spentCents)} von Plan ${eur(plan.plannedCents)} · Tag ${plan.day} von ${plan.daysInMonth}`,
              marker: plan.day / plan.daysInMonth,
            }}
            line={`Bis ${shortDay(data.stand.payday.day)} · noch ${data.stand.payday.daysToPayday} Tage`}
            note={`Verfügbar in allen Envelopes für Bedarf und Wunsch, abzüglich der Rechnungen, die vor dem Gehalt noch fällig sind. Ausgabenplan: ${eur(plan.spentCents)} ausgegeben von ${eur(plan.plannedCents)} · Plan-Rest ${eur(plan.remainingCents)}. Plan-Rest: geplante Monatsausgaben minus bisher ausgegeben, kein Kontoguthaben. ${
              data.balance.salary
                ? `Nächster erwarteter Geldeingang: ${shortDay(data.balance.salary.day)} · ${eur(data.balance.salary.cents)}`
                : 'Kein Geldeingang im Prognosezeitraum erwartet.'
            }`}
          />
        ) : (
          <Kennzahl
            id="verfuegbar"
            label="Verfügbar im Budget"
            state={budget}
            value={available ?? 0}
            alert={(available ?? 0) < 0}
            nonpositive={available === 0}
            href={{ to: '/plan/monat', search: { monat: data.stand.month } }}
            bar={{
              value: plan.spentCents,
              total: plan.plannedCents,
              label: `Ausgegeben ${eur(plan.spentCents)} von Plan ${eur(plan.plannedCents)} · Tag ${plan.day} von ${plan.daysInMonth}`,
              marker: plan.day / plan.daysInMonth,
            }}
            line={
              available === null
                ? undefined
                : `Ausgegeben ${eurWhole(plan.spentCents)} von ${eurWhole(plan.plannedCents)}`
            }
            note={`Summe „Verfügbar“ aller Envelopes im Monat, wie im Plan-Inspektor. Ausgabenplan: ${eur(plan.spentCents)} ausgegeben von ${eur(plan.plannedCents)} · Plan-Rest ${eur(plan.remainingCents)}.`}
          />
        )}
        <Kennzahl
          id="nettovermoegen"
          label="Nettovermögen"
          value={net?.totalCents ?? 0}
          sourceHint={
            <ValuationSourceHint sources={data.valuationSources} label="Nettovermögen · Kennzahl" />
          }
          nonpositive={Boolean(net && net.totalCents <= 0)}
          href={net ? { to: '/vermoegen/nettovermoegen', search: { zeitraum: '1J' } } : undefined}
          missing={
            net ? undefined : (
              <p className="heute-kennzahl-missing">
                {'unavailable' in data.netWorth && data.netWorth.unavailable.message}
              </p>
            )
          }
          bar={
            net
              ? {
                  value: net.assetsCents,
                  total: net.assetsCents + net.liabilitiesCents,
                  label: `Vermögen ${eur(net.assetsCents)} · Schulden ${eur(net.liabilitiesCents)}`,
                  assets: true,
                }
              : undefined
          }
          line={
            net
              ? change
                ? `Δ Monat ${eurWhole(change.deltaCents, true)}`
                : 'Monatsvergleich nicht verfügbar.'
              : undefined
          }
          note={
            net
              ? `Vermögen ${eur(net.assetsCents)} − Schulden ${eur(net.liabilitiesCents)}.${
                  change
                    ? ` Δ Monat ${eur(change.deltaCents, { sign: true })}: Einzahlung ${eur(change.investmentsInCents, { sign: true })} · Markt ${eur(change.marketCents, { sign: true })}.`
                    : ` ${'unavailable' in net.monthChange ? net.monthChange.unavailable.message : ''}`
                }`
              : undefined
          }
        />
      </div>
      {goal && (
        <p className="heute-nearest-goal">
          <AppLink to="/plan/sparziele">
            {goal.name} · gespart {eur(goal.savedCents)} · fehlt {eur(goal.remainingCents)}
          </AppLink>
        </p>
      )}
    </div>
  );
}

interface BarSpec {
  value: number;
  total: number;
  label: string;
  marker?: number;
  assets?: boolean;
}

function Kennzahl({
  id,
  label,
  value,
  alert = false,
  nonpositive = false,
  href,
  onValueClick,
  expanded,
  controls,
  testId,
  ariaLabel,
  state,
  bar,
  line,
  note,
  missing,
  sourceHint,
}: {
  id: string;
  label: string;
  value: number;
  alert?: boolean;
  nonpositive?: boolean;
  href?: { to: string; search: Record<string, string> } | undefined;
  onValueClick?: () => void;
  expanded?: boolean;
  controls?: string;
  testId?: string;
  ariaLabel?: string;
  /** The source query of a tile that waits for its own data (errors stay in that tile). */
  state?: UseQueryResult<unknown>;
  bar?: BarSpec | undefined;
  line?: string | undefined;
  note?: ReactNode | undefined;
  missing?: ReactNode | undefined;
  sourceHint?: ReactNode | undefined;
}) {
  const [info, setInfo] = useState(false);
  const titleId = `kennzahl-${id}-title`;
  const noteId = `kennzahl-${id}-note`;
  const className = `heute-answer-value${alert ? ' heute-alert' : ''}${nonpositive ? ' is-nonpositive' : ''}`;
  const describedBy = info && note ? noteId : undefined;
  const text = eur(value);
  let figure: ReactNode;
  if (state?.isError) {
    figure = null;
  } else if (state?.isPending) {
    figure = (
      <span className={className} aria-busy="true">
        …
      </span>
    );
  } else if (missing) {
    figure = null;
  } else if (onValueClick) {
    figure = (
      <button
        type="button"
        className={className}
        data-testid={testId}
        data-kennzahl={id}
        onClick={onValueClick}
        aria-expanded={expanded}
        aria-controls={controls}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
      >
        {text}
      </button>
    );
  } else if (href) {
    figure = (
      <AppLink to={href.to} search={href.search}>
        <strong
          className={className}
          data-testid="kennzahl-value"
          data-kennzahl={id}
          aria-describedby={describedBy}
        >
          {text}
        </strong>
      </AppLink>
    );
  } else {
    figure = (
      <strong
        className={className}
        data-testid="kennzahl-value"
        data-kennzahl={id}
        aria-describedby={describedBy}
      >
        {text}
      </strong>
    );
  }
  return (
    <section className="heute-answer heute-kennzahl" aria-labelledby={titleId}>
      <h2 id={titleId}>{label}</h2>
      {note && (
        <button
          type="button"
          className="heute-info"
          aria-expanded={info}
          aria-controls={noteId}
          aria-label={`Herleitung ${label}`}
          onClick={() => setInfo((open) => !open)}
        >
          <Info size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
      {state?.isError ? (
        <ErrorNote what={label} error={state.error} onRetry={() => void state.refetch()} />
      ) : sourceHint ? (
        <span className={`${className} heute-kennzahl-figure`}>
          {figure}
          {sourceHint}
        </span>
      ) : (
        figure
      )}
      {missing}
      {bar && <Bar {...bar} />}
      {line && <p className="heute-kennzahl-line">{line}</p>}
      {info && note && (
        <p id={noteId} className="heute-kennzahl-note">
          {line && <span className="heute-phone-only">{line} · </span>}
          {note}
        </p>
      )}
    </section>
  );
}

function Bar({ value, total, label, marker, assets = false }: BarSpec) {
  const scale = Math.max(0, value, total);
  const width = scale > 0 ? (Math.max(0, value) / scale) * 100 : 0;
  return (
    <div
      role="img"
      aria-label={label}
      className={`heute-answer-bar${assets ? ' is-assets' : ''}${scale === 0 ? ' is-empty' : ''}`}
    >
      <span className="heute-answer-fill" style={{ width: `${width}%` }} />
      {marker !== undefined && (
        <span
          className="heute-answer-marker"
          aria-hidden="true"
          style={{ left: `${marker * 100}%` }}
        />
      )}
    </div>
  );
}
