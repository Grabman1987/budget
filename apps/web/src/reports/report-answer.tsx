import { addDays, daysBetween } from '@budget/domain';
import { maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { eur } from '../ledger/format';
import './report-answer.css';

export interface ReportAnswerFacts {
  totalCents: number;
  /** null means unavailable coverage, not a zero-valued prior period. */
  previousCents: number | null;
  metric: 'expenses' | 'income';
  /** Supplied by the report's complete breakdown, not inferred from a chart's top-N rows. */
  biggestRiser?: { name: string; changeCents: number } | undefined;
}

/** A separate inclusive civil-day window; existing monthly report periods stay unchanged. */
export function reportAnswerWindow(from: string, to: string) {
  const valid = (day: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const date = new Date(`${day}T00:00:00Z`);
    return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === day;
  };
  if (!valid(from) || !valid(to) || from > to)
    throw new RangeError('Report answer requires an ordered calendar-day window');
  const days = daysBetween(from, to) + 1;
  const previousFrom = addDays(from, -days);
  const previousTo = addDays(from, -1);
  if (!valid(previousFrom) || !valid(previousTo))
    throw new RangeError('Report answer prior window is outside the calendar range');
  return { from, to, previousFrom, previousTo, days };
}

/** Presentation of supplied integer-cent facts; no ledger aggregation or comparison query. */
export function reportAnswer(facts: ReportAnswerFacts) {
  const amounts = [facts.totalCents];
  if (facts.previousCents !== null) amounts.push(facts.previousCents);
  if (facts.biggestRiser) amounts.push(facts.biggestRiser.changeCents);
  if (!amounts.every(Number.isSafeInteger))
    throw new RangeError('Report answer requires safe integer cents');
  if (facts.previousCents === null) return null;
  const changeCents = facts.totalCents - facts.previousCents;
  if (!Number.isSafeInteger(changeCents))
    throw new RangeError('Report answer change exceeds safe integer cents');
  return {
    totalCents: facts.totalCents,
    previousCents: facts.previousCents,
    changeCents,
    direction: changeCents > 0 ? 'mehr' : changeCents < 0 ? 'weniger' : 'gleich viel',
    favourable: changeCents !== 0 && (facts.metric === 'income' ? changeCents > 0 : changeCents < 0),
    neutral: changeCents === 0,
  };
}

/** The caller keeps its lead/chart visible even when no answer can be compared. */
export function ReportAnswer({ facts }: { facts: ReportAnswerFacts }) {
  useAmountPrivacy();
  const answer = reportAnswer(facts);
  if (!answer) return null;
  return (
    <div className="report-answer">
      <p data-testid="report-answer">
        Du hast {eur(answer.totalCents)}{' '}
        {facts.metric === 'expenses' ? 'netto ausgegeben' : 'eingenommen'},{' '}
        {answer.changeCents === 0
          ? 'gleich viel'
          : `${eur(Math.abs(answer.changeCents))} ${answer.direction}`}{' '}
        als im gleich langen Vorzeitraum.
        {facts.biggestRiser && facts.biggestRiser.changeCents > 0 && (
          <>
            {' '}
            Den größten Anstieg gab es bei {maskMoneyText(facts.biggestRiser.name)}:{' '}
            {eur(facts.biggestRiser.changeCents, { sign: true })}.
          </>
        )}
      </p>
      <span
        className={`report-answer-chip${answer.neutral ? '' : answer.favourable ? ' is-favourable' : ' is-unfavourable'}`}
      >
        Vorzeitraum {eur(answer.previousCents)} · {eur(answer.changeCents, { sign: true })}
      </span>
    </div>
  );
}
