import type { PlanningAccuracyReport } from '@budget/db';
import { bpText } from './spending-shared';

type Summary = PlanningAccuracyReport['summary'];

export function PaceAccuracyNote({ summary }: { summary?: Summary | undefined }) {
  return summary && summary.count >= 3 ? (
    <p>
      Deine Hochrechnung lag zuletzt im Schnitt {bpText(summary.meanAbsoluteBp, { digits: 0 })}{' '}
      daneben.
    </p>
  ) : null;
}
