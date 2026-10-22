import { maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { eur } from '../ledger/format';
import './report-answer.css';

export interface ReportAnswerFacts {
  totalCents: number;
  previousCents: number | null;
  favourable: 'up' | 'down';
  metric: 'expenses' | 'income';
  biggestRiser?: { name: string; changeCents: number } | undefined;
}

/** Presentation from supplied integer-cent figures; an unavailable prior period is not zero. */
export function reportAnswer(facts: ReportAnswerFacts) {
  if (facts.previousCents === null) return null;
  const changeCents = facts.totalCents - facts.previousCents;
  if (![facts.totalCents, facts.previousCents, changeCents].every(Number.isSafeInteger))
    throw new RangeError('Report answer requires safe integer cents');
  const direction = changeCents > 0 ? 'mehr' : changeCents < 0 ? 'weniger' : 'gleich viel';
  return {
    totalCents: facts.totalCents,
    previousCents: facts.previousCents,
    changeCents,
    direction,
    favourable: changeCents !== 0 && (facts.favourable === 'up' ? changeCents > 0 : changeCents < 0),
    neutral: changeCents === 0,
  };
}

export function ReportAnswer({ facts }: { facts: ReportAnswerFacts }) {
  useAmountPrivacy();
  const answer = reportAnswer(facts);
  if (!answer) return null;
  return (
    <div className="report-answer">
      <p data-testid="report-answer">
        Du hast {eur(answer.totalCents)} {facts.metric === 'expenses' ? 'netto ausgegeben' : 'eingenommen'}, {' '}
        {answer.changeCents === 0 ? 'gleich viel' : `${eur(Math.abs(answer.changeCents))} ${answer.direction}`} als im gleich langen Vorzeitraum.
        {facts.biggestRiser && facts.biggestRiser.changeCents > 0 && <> Den größten Anstieg gab es bei {maskMoneyText(facts.biggestRiser.name)}: {eur(facts.biggestRiser.changeCents, { sign: true })}.</>}
      </p>
      <span className={`report-answer-chip${answer.neutral ? '' : answer.favourable ? ' is-favourable' : ' is-unfavourable'}`}>
        Vorzeitraum {eur(answer.previousCents)} · {eur(answer.changeCents, { sign: true })}
      </span>
    </div>
  );
}
