import { useMemo } from 'react';
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
  const text = useMemo(() => reportVerdict(facts, { hidden }).text, [facts, hidden]);
  return (
    <p className="report-verdict" data-testid={testId}>
      {text}
    </p>
  );
}
