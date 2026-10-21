export type StatementScheduledPayment = null | { mode: 'none' } | { mode: 'existing'; paymentId: string };
import type { CardDocument, CardParseContext } from './statement-automation';
import type { StatementCas } from './statement-intake';

export type StatementAutomationConfig = {
  accountId: string;
  enabled: boolean;
  revision: string | null;
  mappingKey: string;
  mappedCards: { token: string; accountId: string }[];
  scheduledPayment: StatementScheduledPayment;
};
export type StatementAutomationConfigInput = {
  accountId: string;
  expectedRevision: string | null;
  enabled: boolean;
  mappedCards: { token: string; accountId: string }[];
  scheduledPayment: StatementScheduledPayment;
};
export type StatementAutomationSource = StatementCas & {
  intakeId: string;
  receiptId: string;
  sizeBytes: number;
  issueDate: string | null;
};
export type StatementAutomationPreparation = {
  source: StatementAutomationSource;
  config: StatementAutomationConfig;
  settlementConfigRevision: string | null;
  context: Omit<CardParseContext, 'previous'>;
  previous: StatementAutomationSource | null;
  reasons: string[];
};
export type StatementAutomationOutcome = {
  intakeId: string;
  runId: string | null;
  groupId: string | null;
  status: 'saved' | 'review' | 'unchanged' | 'undone';
  created: number;
  matched: number;
  credits: number;
  receiptLinks: number;
  pending: { rowKey: string; line: number; reason: string }[];
  reasons: string[];
  items?: { bookingId: string; accountId: string; role: 'created' | 'matched' | 'credit' | 'original' | 'settlement' }[];
  suggestedCardTokens: string[];
  suggestedCardHints: { token: string; hint: string }[];
};
/** Internal server → DB only; public API never accepts trusted parsed/machine evidence. */
export type StatementAutomationExecution = {
  source: StatementAutomationSource;
  configRevision: string;
  settlementConfigRevision: string | null;
  document: CardDocument;
  key: string;
};
