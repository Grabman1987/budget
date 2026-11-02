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
import type { Heute, HeutePeriod } from './api';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';

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
  context,
  aggregatePending = false,
}: {
  data:
    | Pick<
        Heute,
        | 'stand'
        | 'netWorth'
        | 'budgetAnswer'
        | 'nearestGoal'
        | 'monthResult'
        | 'lead'
        | 'balance'
        | 'valuationSources'
      >
    | undefined;
  context?: { month: string; period: HeutePeriod };
  aggregatePending?: boolean;
  budget: UseQueryResult<BudgetMonthView>;
  chainOpen?: boolean;
  onLeadClick: () => void;
}) {
  useAmountPrivacy();
  const scope = data?.stand ?? context;
  if (!scope) throw new Error('Heute Kennzahlen require a selected month and period');
  const net = data && !('unavailable' in data.netWorth) ? data.netWorth : null;
  const change = net && !('unavailable' in net.monthChange) ? net.monthChange : null;
  const plan = data?.budgetAnswer;
  const householdMonth = data?.stand.today.slice(0, 7);
  const payday = scope.period === 'payday';
  const month =
    !budget.isFetching && !budget.isPending && !budget.isError ? budget.data : undefined;
  const summary = month?.summary;
  const available = month ? availableInEnvelopes(planRows(month)) : undefined;
  const goal = data?.nearestGoal;
  return (
    <div className="heute-answers heute-kennzahlen" data-testid="heute-kennzahlen">
      {data && data.stand.month && data.stand.month !== householdMonth && (
        <p className="heute-note">Stand heute · {longDay(data.stand.today)}</p>
      )}
      <div className="heute-answer-grid">
        <Kennzahl
          id="zu-verteilen"
          label="Zu verteilen"
          state={budget}
          value={summary?.toBeAssignedCents}
          reserveBar
          reserveLine
          alert={(summary?.toBeAssignedCents ?? 0) < 0}
          nonpositive={summary?.toBeAssignedCents === 0}
          href={summary ? { to: '/plan/monat', search: { monat: scope.month } } : undefined}
          bar={
            summary && {
              value: summary.assignedCents,
              total: summary.carryInCents + summary.incomeCents,
              label: `Zugewiesen ${eur(summary.assignedCents)} · Übertrag ${eur(summary.carryInCents)} · Einnahmen ${eur(summary.incomeCents)}`,
            }
          }
          line={summary && `Zugewiesen ${eurWhole(summary.assignedCents)}`}
          note={
            (summary && (
              <>
                {`Geld, das noch keinem Envelope zugewiesen ist: Übertrag ${eur(summary.carryInCents)} + Einnahmen ${eur(summary.incomeCents)} − Ungedeckt ${eur(summary.uncoveredCents)} − Zugewiesen ${eur(summary.assignedCents)} − Gehalten ${eur(summary.heldCents)}. Dieselbe Zahl wie im Plan. `}
                {data &&
                  householdMonth &&
                  `Haushaltseinnahmen ${eur(data.monthResult.earnedCents)} im ${monthLabel(householdMonth)} nach Buchungsdatum. Mit „Für nächsten Monat“ zählt der Zufluss im Plan erst im Folgemonat. `}
                <AppLink
                  to="/plan/monat/einnahmen"
                  search={{ monat: householdMonth ?? scope.month }}
                >
                  Planmonat {monthLabel(householdMonth ?? scope.month)} ansehen
                </AppLink>
              </>
            )) || (
              <span>Budgetangaben {budget.isError ? 'nicht verfügbar' : 'werden geladen'}.</span>
            )
          }
        />
        {payday ? (
          <Kennzahl
            id="frei-bis-gehalt"
            label="Frei bis Gehalt"
            value={data?.lead.freeCents}
            pending={aggregatePending}
            unavailable={!data}
            reserveBar
            reserveLine
            alert={Boolean(data && data.lead.freeCents < 0)}
            onValueClick={onLeadClick}
            expanded={chainOpen}
            controls="heute-lead-chain"
            testId="heute-lead-value"
            ariaLabel={
              data
                ? `Frei verfügbar bis Gehalt: ${eur(data.lead.freeCents)}. Herleitung ${chainOpen ? 'ausblenden' : 'zeigen'}`
                : undefined
            }
            bar={
              plan && {
                value: plan.spentCents,
                total: plan.plannedCents,
                label: `Ausgegeben ${eur(plan.spentCents)} von Plan ${eur(plan.plannedCents)} · Tag ${plan.day} von ${plan.daysInMonth}`,
                marker: plan.day / plan.daysInMonth,
              }
            }
            line={
              data
                ? `Bis ${shortDay(data.stand.payday.day)} · noch ${data.stand.payday.daysToPayday} Tage`
                : undefined
            }
            note={
              data && plan
                ? `Verfügbar in allen Envelopes für Bedarf und Wunsch, abzüglich der Rechnungen, die vor dem Gehalt noch fällig sind. Ausgabenplan: ${eur(plan.spentCents)} ausgegeben von ${eur(plan.plannedCents)} · Plan-Rest ${eur(plan.remainingCents)}. Plan-Rest: geplante Monatsausgaben minus bisher ausgegeben, kein Kontoguthaben. ${
                    data.balance.salary
                      ? `Nächster erwarteter Geldeingang: ${shortDay(data.balance.salary.day)} · ${eur(data.balance.salary.cents)}`
                      : 'Kein Geldeingang im Prognosezeitraum erwartet.'
                  }`
                : 'Diese Angabe benötigt den Heute-Abruf.'
            }
          />
        ) : (
          <Kennzahl
            id="verfuegbar"
            label="Verfügbar im Budget"
            state={budget}
            value={available}
            reserveBar
            reserveLine
            alert={(available ?? 0) < 0}
            nonpositive={available === 0}
            href={month ? { to: '/plan/monat', search: { monat: scope.month } } : undefined}
            bar={
              month && plan
                ? {
                    value: plan.spentCents,
                    total: plan.plannedCents,
                    label: `Ausgegeben ${eur(plan.spentCents)} von Plan ${eur(plan.plannedCents)} · Tag ${plan.day} von ${plan.daysInMonth}`,
                    marker: plan.day / plan.daysInMonth,
                  }
                : undefined
            }
            line={
              available === undefined || !plan
                ? undefined
                : `Ausgegeben ${eurWhole(plan.spentCents)} von ${eurWhole(plan.plannedCents)}`
            }
            note={
              month ? (
                <>
                  Summe „Verfügbar“ aller Envelopes im Monat, wie im Plan-Inspektor.
                  {plan
                    ? ` Ausgabenplan: ${eur(plan.spentCents)} ausgegeben von ${eur(plan.plannedCents)} · Plan-Rest ${eur(plan.remainingCents)}.`
                    : ''}
                </>
              ) : (
                <span>Budgetangaben {budget.isError ? 'nicht verfügbar' : 'werden geladen'}.</span>
              )
            }
          />
        )}
        <Kennzahl
          id="nettovermoegen"
          label="Nettovermögen"
          value={net?.totalCents}
          pending={aggregatePending}
          unavailable={!data}
          reserveBar
          reserveLine
          sourceHint={
            <ValuationSourceHint
              sources={data?.valuationSources}
              label="Nettovermögen · Kennzahl"
            />
          }
          nonpositive={Boolean(net && net.totalCents <= 0)}
          href={net ? { to: '/vermoegen/nettovermoegen', search: { zeitraum: '1J' } } : undefined}
          missing={
            data && !net ? (
              <p className="heute-kennzahl-missing">
                {'unavailable' in data.netWorth && data.netWorth.unavailable.message}
              </p>
            ) : undefined
          }
          bar={
            net
              ? {
                  value: net.assetsCents,
                  total: net.assetsCents + net.liabilitiesCents,
                  label: `Vermögen ${eur(net.assetsCents)} · ${REDESIGN_ENABLED ? 'Verbindlichkeiten' : 'Schulden'} ${eur(net.liabilitiesCents)}`,
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
              ? `Vermögen ${eur(net.assetsCents)} − ${REDESIGN_ENABLED ? 'Verbindlichkeiten' : 'Schulden'} ${eur(net.liabilitiesCents)}.${
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
      {!goal && <p className="heute-nearest-goal" aria-hidden="true" />}
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
  pending = false,
  unavailable = false,
  reserveBar = false,
  reserveLine = false,
}: {
  id: string;
  label: string;
  value: number | undefined;
  pending?: boolean;
  unavailable?: boolean;
  reserveBar?: boolean;
  reserveLine?: boolean;
  alert?: boolean;
  nonpositive?: boolean;
  href?: { to: string; search: Record<string, string> } | undefined;
  onValueClick?: () => void;
  expanded?: boolean;
  controls?: string;
  testId?: string;
  ariaLabel?: string | undefined;
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
  const text = value === undefined ? undefined : eur(value);
  let figure: ReactNode;
  if (state?.isPending || state?.isFetching || pending) {
    figure = (
      <span className={className} aria-busy="true">
        …
      </span>
    );
  } else if (state?.isError) {
    figure = null;
  } else if (missing) {
    figure = null;
  } else if (unavailable || value === undefined) {
    figure = (
      <span className={`${className} is-unavailable`} aria-label={`${label} nicht verfügbar`}>
        –
      </span>
    );
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
      {state?.isError && !state.isFetching && !state.isPending ? (
        <ErrorNote what={label} error={state.error} onRetry={() => void state.refetch()} />
      ) : sourceHint ? (
        <span className="heute-kennzahl-figure">
          {figure}
          {sourceHint}
        </span>
      ) : (
        figure
      )}
      {missing}
      {bar ? (
        <Bar {...bar} />
      ) : (
        reserveBar && <div className="heute-answer-bar is-empty" aria-hidden="true" />
      )}
      {line ? (
        <p className="heute-kennzahl-line">{line}</p>
      ) : (
        reserveLine && (
          <p className="heute-kennzahl-line" aria-hidden="true">
            …
          </p>
        )
      )}
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
