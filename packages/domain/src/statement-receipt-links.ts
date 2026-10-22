import type { StatementCas } from './statement-intake';

export type StatementReceiptBooking = {
  bookingId: string;
  bookingRevision: string;
  accountId: string;
  accountName: string;
  date: string;
  description: string;
  amountCents: number;
  currency: string;
  attached: boolean;
  managed: boolean;
};
export type StatementReceiptLinksPage = {
  source: StatementCas & {
    intakeId: string;
    receiptId: string;
    currency: string | null;
    accountName: string;
  };
  linksRevision: string;
  items: StatementReceiptBooking[];
  attached: StatementReceiptBooking[];
  nextOffset: number | null;
  nextAttachedOffset: number | null;
  unavailableReason: 'source_currency_required' | null;
};
export type StatementReceiptLinksInput = {
  sourceCas: StatementCas;
  linksRevision: string;
  attach: { bookingId: string; bookingRevision: string }[];
  detach: { bookingId: string; bookingRevision: string }[];
};
export type StatementReceiptLinksReply = {
  groupId: string | null;
  changedCount: number;
  attachedIds: string[];
  detachedIds: string[];
};
