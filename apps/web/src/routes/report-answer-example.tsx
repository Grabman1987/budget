import { BarsAroundZero, Button, ChartSvg, setAmountsHidden, useAmountPrivacy } from '@budget/ui';
import { useState } from 'react';
import { eur } from '../ledger/format';
import { ReportAnswer, reportAnswerWindow, type ReportAnswerFacts } from '../reports/report-answer';

const GROUPS = [
  { name: 'Bedarf', valueCents: 122000 },
  { name: 'Wunsch', valueCents: 71000 },
  { name: 'Zukunft', valueCents: 20000 },
];
const TOTAL_CENTS = 213000;

/** Synthetic template example only; the route is excluded from production with all /dev routes. */
export function ReportAnswerExample() {
  const hidden = useAmountPrivacy();
  const [metric, setMetric] = useState<ReportAnswerFacts['metric']>('expenses');
  const [priorAvailable, setPriorAvailable] = useState(true);
  const label = metric === 'expenses' ? 'Ausgaben' : 'Einnahmen';
  const window = reportAnswerWindow('2026-09-01', '2026-09-17');
  const x = (index: number) => 50 + index * 100;
  return (
    <main className="report-answer-example">
      <h1>Report-Antwortvorlage</h1>
      <p>Synthetische Beispieldaten · {window.days} Kalendertage je Zeitraum.</p>
      <div className="report-answer-example-controls" role="group" aria-label="Beispiel wechseln">
        <Button
          variant="ghost"
          aria-pressed={metric === 'expenses'}
          onClick={() => setMetric('expenses')}
        >
          Ausgaben
        </Button>
        <Button
          variant="ghost"
          aria-pressed={metric === 'income'}
          onClick={() => setMetric('income')}
        >
          Einnahmen
        </Button>
        <Button variant="ghost" onClick={() => setPriorAvailable(!priorAvailable)}>
          {priorAvailable ? 'Vorzeitraum ausblenden' : 'Vorzeitraum zeigen'}
        </Button>
        <Button variant="ghost" onClick={() => setAmountsHidden(!hidden)}>
          {hidden ? 'Beträge zeigen' : 'Beträge verbergen'}
        </Button>
      </div>
      <section aria-labelledby="answer-example-title">
        <h2 id="answer-example-title">{label} im gewählten Zeitraum</h2>
        <p className="report-answer-example-lead">
          <strong data-testid="report-answer-lead">{eur(TOTAL_CENTS)}</strong>
        </p>
        <ReportAnswer
          facts={{
            totalCents: TOTAL_CENTS,
            previousCents: priorAvailable ? 183000 : null,
            metric,
            biggestRiser: { name: 'Lebensmittel', changeCents: 12000 },
          }}
        />
        <ChartSvg
          width={300}
          height={220}
          label={`${label}: ${eur(TOTAL_CENTS)}`}
          testId="answer-example-chart"
          points={GROUPS.map((group, index) => ({
            x: x(index),
            date: group.name,
            series: [{ name: label, value: eur(group.valueCents) }],
          }))}
          table
        >
          <BarsAroundZero
            bars={GROUPS.map((group, index) => ({ x: x(index), value: group.valueCents }))}
            y={(value) => 180 - value / 1000}
            barWidth={40}
          />
          {GROUPS.map((group, index) => (
            <text key={group.name} x={x(index)} y={210} textAnchor="middle" className="svg-label">
              {group.name}
            </text>
          ))}
        </ChartSvg>
      </section>
    </main>
  );
}
