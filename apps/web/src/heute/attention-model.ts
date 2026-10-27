import type { Heute } from './api';

export type AttentionData = Pick<
  Heute,
  'stand' | 'nextSteps' | 'financeCheck' | 'attention' | 'accountReminders'
>;
export type AttentionTask =
  | { id: string; kind: 'plan' | 'rules' | 'review' | 'accounts' }
  | {
      id: string;
      kind: 'contact';
      contact: NonNullable<Heute['attention']['contactReminders']>['items'][number];
    }
  | {
      id: string;
      kind: 'month-close';
      task: NonNullable<Heute['attention']['monthCloseTasks']>['tasks'][number];
    };

/** Complete source pool is deduplicated before the visible limit. */
export function attentionModel(
  data: AttentionData,
  savings: { count: number; unavailable: boolean },
) {
  const tasks: AttentionTask[] = [];
  if (data.nextSteps.items.some((item) => item.kind === 'overspent'))
    tasks.push({ id: 'plan:overspending', kind: 'plan' });
  const closeTasks = data.attention.monthCloseTasks?.tasks ?? [];
  for (const task of closeTasks.filter((item) => item.kind === 'close-changed'))
    tasks.push({ id: task.id, kind: 'month-close', task });
  if (
    !('unavailable' in data.financeCheck) &&
    data.financeCheck.actionRules.some((rule) => rule.status === 'bad')
  )
    tasks.push({ id: 'rules:action', kind: 'rules' });
  if (
    data.attention.inboxCount ||
    data.attention.pendingCount ||
    savings.count ||
    savings.unavailable
  )
    tasks.push({ id: 'review:work', kind: 'review' });
  if (
    (data.accountReminders?.length ?? 0) ||
    data.attention.quoteReview?.count ||
    data.attention.loanTermsMissing
  )
    tasks.push({ id: 'accounts:review', kind: 'accounts' });
  for (const contact of data.attention.contactReminders?.items ?? [])
    tasks.push({ id: `contact:${contact.contactId}`, kind: 'contact', contact });
  for (const task of closeTasks.filter((item) => item.kind === 'close'))
    tasks.push({ id: task.id, kind: 'month-close', task });
  const seen = new Set<string>();
  const unique = tasks.filter((task) => !seen.has(task.id) && !!seen.add(task.id));
  return { tasks: unique, visible: unique.slice(0, 4), remaining: unique.slice(4) };
}
