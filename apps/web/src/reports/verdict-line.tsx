import { reportVerdict, type VerdictFacts } from '@budget/domain';
import { useAmountPrivacy } from '@budget/ui';
import './verdict-line.css';

export function VerdictLine({
  facts,
  testId = 'report-verdict',
}: {
  facts: VerdictFacts;
  testId?: string;
}) {
  const hidden = useAmountPrivacy();
  return (
    <p className="report-verdict" data-testid={testId}>
      {reportVerdict(facts, { hidden }).text}
    </p>
  );
}
