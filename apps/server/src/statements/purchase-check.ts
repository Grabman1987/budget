import {
  checkStatementPurchases,
  statementPurchaseTotal,
  parseCardDocument,
  type StatementCas,
  type StatementFacts,
} from '@budget/domain';
import {
  assertStatementCas,
  getReceipt,
  readStatementPurchaseBookings,
  statementAccount,
  account,
  type Db,
} from '@budget/db';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { extractStatementForReview } from './automation-service';
import { readStatementSource } from './service';
import { ApiError } from '../api/http';

/** Explicit preview only. No automation planner or ledger writer is called. */
export async function statementPurchaseCheck(
  db: Db,
  dir: string,
  intakeId: string,
  cas: StatementCas,
  facts: StatementFacts,
  password?: string,
) {
  const view = assertStatementCas(db, intakeId, cas);
  statementAccount(db, view.accountId);
  const a = db.select().from(account).where(eq(account.id, view.accountId)).get()!;
  if (a.type !== 'credit_card' || a.currency !== 'EUR' || facts.currency !== 'EUR')
    throw new ApiError(
      400,
      'unsupported',
      'Der Abgleich benötigt ein EUR-Kreditkartenkonto und eine EUR-Abrechnung.',
    );
  const source = getReceipt(db, view.receiptId);
  let extracted: { text?: string; error?: string };
  try {
    const bytes = await readStatementSource(dir, view.sha256, source.sizeBytes);
    extracted = await extractStatementForReview(db, bytes, password);
  } catch {
    throw new ApiError(409, 'conflict', 'Abrechnungsquelle fehlt oder ist beschädigt.');
  }
  // Source edits during PDF I/O must not produce a result for a stale source.
  assertStatementCas(db, intakeId, cas);
  const period =
    facts.periodFrom && facts.periodTo ? { from: facts.periodFrom, to: facts.periodTo } : null;
  const doc =
    extracted.text === undefined
      ? null
      : parseCardDocument(extracted.text, view.sha256, {
          accountId: view.accountId,
          currency: 'EUR',
          mappingKey: 'read-only',
          mappedCardAccounts: {},
          period,
          cardIdentity: (raw) => ({
            fingerprint: createHash('sha256').update(raw).digest('hex'),
            hint: 'Karte',
          }),
        });
  // Missing historical closing-balance proof is irrelevant to this independent cycle check.
  // Structural extraction failures, unknown rows and undated positions are not ignored.
  const informational = new Set([
    'previous_source_required',
    'card_mapping_required',
    'closing_total_unverified',
    'issue_date_required',
  ]);
  const incomplete = !doc || doc.reasons.some((r) => !informational.has(r));
  const lines =
    doc?.rows
      .filter((r) => r.kind !== 'payment')
      .map((r) => ({
        id: r.key,
        date: r.bookingDate,
        description: r.description,
        amountCents: r.amountCents,
      })) ?? [];
  const booked = readStatementPurchaseBookings(db, view.accountId, period);
  const check = checkStatementPurchases(
    {
      period,
      // Payable includes carried debt and repayments; only complete cycle positions
      // establish a purchase total. The printed closing balance stays in the review facts.
      statementPurchaseCents: incomplete ? null : statementPurchaseTotal(lines),
      lines: doc ? lines : null,
      linesComplete: !incomplete,
    },
    booked.bookings,
  );
  if (booked.omitted) {
    check.sumMatches = null;
    check.bookedPurchaseCents = null;
    check.differenceCents = null;
    // An omitted mixed booking may already contain a readable statement purchase.
    check.statementOnly = check.statementOnly.map((item) => ({ ...item, ambiguous: true }));
  }
  return {
    intakeId,
    accountId: view.accountId,
    revision: view.revision,
    check,
    omittedBookings: booked.omitted,
    extractionIncomplete: incomplete,
  };
}
