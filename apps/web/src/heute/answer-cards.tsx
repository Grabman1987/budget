import { useAmountPrivacy } from '@budget/ui';
import { eur } from '../ledger/format';
import { monthLabel } from '../nav/month';
import { AppLink } from '../shell/app-link';
import type { Heute } from './api';

/** These are source figures, not new calculations of income, wealth or the Leitmaß. */
export function AnswerCards({
  data,
  onBudgetClick,
  chainOpen = false,
}: {
  data: Heute;
  onBudgetClick: () => void;
  chainOpen?: boolean;
}) {
  useAmountPrivacy();
  const net = 'unavailable' in data.netWorth ? null : data.netWorth;
  const change = net && !('unavailable' in net.monthChange) ? net.monthChange : null;
  const month = data.monthResult;
  const budget = data.budgetAnswer;
  const goal = data.nearestGoal;
  const householdMonth = data.stand.today.slice(0, 7);
  return (
    <div className="heute-answers">
      <div className="heute-answer-grid">
        <section className="heute-answer" aria-labelledby="answer-wealth-title">
          <h2 id="answer-wealth-title">Nettovermögen</h2>
          {net ? (
            <>
              <AppLink to="/vermoegen/nettovermoegen" search={{ zeitraum: '1J' }}>
                <strong
                  className={`heute-answer-value${net.totalCents <= 0 ? ' is-nonpositive' : ''}`}
                >
                  {eur(net.totalCents)}
                </strong>
              </AppLink>
              <ProportionBar
                value={net.assetsCents}
                total={net.assetsCents + net.liabilitiesCents}
                label={`Vermögen ${eur(net.assetsCents)} · Schulden ${eur(net.liabilitiesCents)}`}
                assets
              />
              <p>
                {change
                  ? `Δ Monat: ${eur(change.deltaCents, { sign: true })} davon Einzahlung ${eur(change.investmentsInCents, { sign: true })} · Markt ${eur(change.marketCents, { sign: true })}`
                  : net.monthChange && 'unavailable' in net.monthChange
                    ? net.monthChange.unavailable.message
                    : 'Monatsvergleich nicht verfügbar.'}
              </p>
              <p>
                Vermögen {eur(net.assetsCents)} · Schulden {eur(net.liabilitiesCents)}
              </p>
            </>
          ) : (
            <p>{'unavailable' in data.netWorth && data.netWorth.unavailable.message}</p>
          )}
        </section>
        <section className="heute-answer" aria-labelledby="answer-month-title">
          <h2 id="answer-month-title">Dieser Monat</h2>
          <AppLink to="/reports/onepager" search={{ monat: data.stand.today.slice(0, 7) }}>
            <strong
              className={`heute-answer-value${month.savedCents <= 0 ? ' is-nonpositive' : ''}`}
            >
              {eur(month.savedCents)}
            </strong>
          </AppLink>
          <ProportionBar
            value={month.consumptionCents}
            total={month.earnedCents}
            label={`Ausgaben ${eur(month.consumptionCents)} von Haushaltseinnahmen ${eur(month.earnedCents)}`}
          />
          <p>Haushaltseinnahmen {eur(month.earnedCents)}</p>
          <p>
            Haushaltseinnahmen im {monthLabel(householdMonth)} nach Buchungsdatum. Mit „Für nächsten
            Monat“ zählt der Zufluss im Plan erst im Folgemonat.{' '}
            <AppLink to="/plan/monat/einnahmen" search={{ monat: householdMonth }}>
              Planmonat {monthLabel(householdMonth)} ansehen
            </AppLink>
          </p>
          <p>Ausgaben {eur(month.consumptionCents)}</p>
        </section>
        <section className="heute-answer" aria-labelledby="answer-budget-title">
          <h2 id="answer-budget-title">Frei bis Gehalt</h2>
          <button
            type="button"
            className={`heute-answer-value${data.lead.freeCents < 0 ? ' heute-alert' : ''}`}
            data-testid="heute-lead-value"
            onClick={onBudgetClick}
            aria-expanded={chainOpen}
            aria-controls="heute-lead-chain"
            aria-describedby="heute-plan-rest-note"
            aria-label={`Frei verfügbar bis Gehalt: ${eur(data.lead.freeCents)}. Herleitung ${chainOpen ? 'ausblenden' : 'zeigen'}`}
          >
            {eur(data.lead.freeCents)}
          </button>
          <ProportionBar
            value={budget.spentCents}
            total={budget.plannedCents}
            label={`Ausgegeben ${eur(budget.spentCents)} von Plan ${eur(budget.plannedCents)} · Tag ${budget.day} von ${budget.daysInMonth}`}
            marker={budget.day / budget.daysInMonth}
          />
          <p>
            Ausgabenplan: {eur(budget.spentCents)} ausgegeben von {eur(budget.plannedCents)} ·
            Plan-Rest {eur(budget.remainingCents)}
          </p>
          <p>
            Tag {budget.day} von {budget.daysInMonth}
          </p>
        </section>
      </div>
      <p className="heute-answer-note" id="heute-plan-rest-note" data-testid="heute-plan-rest-note">
        Plan-Rest: geplante Monatsausgaben minus bisher ausgegeben, kein Kontoguthaben. Frei bis
        Gehalt: verfügbares Bedarf-/Wunschbudget minus offene Rechnungen.
      </p>
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

function ProportionBar({
  value,
  total,
  label,
  marker,
  assets = false,
}: {
  value: number;
  total: number;
  label: string;
  marker?: number;
  assets?: boolean;
}) {
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
