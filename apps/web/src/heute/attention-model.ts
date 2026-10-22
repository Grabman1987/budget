import type { Heute } from './api';

export type AttentionData = Pick<
  Heute,
  'stand' | 'nextSteps' | 'financeCheck' | 'attention' | 'accountReminders'
>;

type MonthCloseTasks = NonNullable<Heute['attention']['monthCloseTasks']>;

export type AttentionTask =
  | { id: string; kind: 'plan' | 'rules' | 'review' | 'accounts' }
  | { id: string; kind: 'month-close'; task: MonthCloseTasks['tasks'][number] };

export type AttentionAvailability =
  | { kind: 'finance'; message: string }
  | { kind: 'rules'; count: number }
  | { kind: 'month-close-unknown' }
  | { kind: 'month-close'; comparison: MonthCloseTasks['unavailable'][number] };

/** Presentation only: preserve server facts and source order before deduplication and the limit. */
export function attentionModel(
  data: AttentionData,
  savings: { count: number; unavailable: boolean },
) {
  const candidates: AttentionTask[] = [];
  const availability: AttentionAvailability[] = [];
  if (data.nextSteps.items.some((item) => item.kind === 'overspent')) {
    candidates.push({ id: 'plan:overspending', kind: 'plan' });
  }
  if ('unavailable' in data.financeCheck) {
    availability.push({ kind: 'finance', message: data.financeCheck.unavailable.message });
  } else {
    if (data.financeCheck.actionRules.length > 0) {
      candidates.push({ id: 'rules:action', kind: 'rules' });
    }
    if (data.financeCheck.counts.notEvaluated > 0) {
      availability.push({ kind: 'rules', count: data.financeCheck.counts.notEvaluated });
    }
  }
  if (
    data.attention.inboxCount > 0 || data.attention.pendingCount > 0 ||
    savings.count > 0 || savings.unavailable
  ) {
    candidates.push({ id: 'review:work', kind: 'review' });
  }
  if (
    (data.accountReminders?.length ?? 0) > 0 ||
    (data.attention.quoteReview?.count ?? 0) > 0 || data.attention.loanTermsMissing
  ) {
    candidates.push({ id: 'accounts:review', kind: 'accounts' });
  }
  const closes = data.attention.monthCloseTasks;
  if (closes) {
    for (const task of closes.tasks) {
      candidates.push({ id: task.id, kind: 'month-close', task });
    }
    for (const comparison of closes.unavailable) {
      availability.push({ kind: 'month-close', comparison });
    }
  } else {
    availability.push({ kind: 'month-close-unknown' });
  }
  const seen = new Set<string>();
  const tasks = candidates.filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
  return { tasks, visible: tasks.slice(0, 4), remaining: tasks.slice(4), availability };
}
