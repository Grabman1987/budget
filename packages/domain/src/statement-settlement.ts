import { z } from 'zod';
import { statementFactsSchema } from './statement-intake';

const id = z.string().uuid();
const revision = id;
const day = statementFactsSchema.shape.issueDate.unwrap();
const cents = z.number().int().safe();
const positive = cents.positive();
const key = z.string().regex(/^[a-zA-Z0-9-]{16,80}$/);
const status = z.enum(['pending', 'confirmed']).default('confirmed');
export const settlementSourceSchema = z
  .object({
    intakeId: id,
    revision,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    accountId: id,
  })
  .strict();
const legacy = z.object({ paymentId: id, dueDate: day }).strict();
const originalCas = z
  .object({ bookingId: id, bookingRevision: revision, splitId: id, splitRevision: revision })
  .strict();
export const statementBonusEvidenceSchema = z
  .object({
    origin: z.literal('owner'),
    bonusCents: positive,
    creditDate: day,
    locator: z
      .object({
        page: z.number().int().min(1).max(30).nullable(),
        line: z.number().int().min(1).max(200000).nullable(),
      })
      .strict()
      .optional(),
    treatment: z.enum(['gross_then_credit', 'already_net']),
    existingCreditsReviewed: z.literal(true),
    feesAdjustmentsReviewed: z.literal(true),
    selectedOriginals: z
      .array(
        originalCas
          .extend({
            accountId: id,
            currency: z.string().regex(/^[A-Z]{3}$/),
            bookingAmountCents: cents.negative(),
            splitAmountCents: cents.negative(),
            categoryId: id,
          })
          .strict(),
      )
      .min(1)
      .max(50),
    allocations: z
      .array(z.object({ categoryId: id, amountCents: positive }).strict())
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((v, ctx) => {
    const sum = v.allocations.reduce((n, a) => n + BigInt(a.amountCents), 0n);
    const gross = v.selectedOriginals.reduce((n, a) => n - BigInt(a.splitAmountCents), 0n);
    if (sum !== BigInt(v.bonusCents) || gross < BigInt(v.bonusCents))
      ctx.addIssue({
        code: 'custom',
        message: 'Explicit allocations must equal the bonus within selected gross purchases.',
      });
    for (const values of [
      v.selectedOriginals.map((x) => x.splitId),
      v.allocations.map((x) => x.categoryId),
    ])
      if (new Set(values).size !== values.length)
        ctx.addIssue({ code: 'custom', message: 'Duplicate evidence identity.' });
  });
const common = { key };
const source = { source: settlementSourceSchema, configRevision: revision };
const settlement = { settlementId: id, expectedRevision: revision };
const bonus = { bonusId: id, expectedRevision: revision };
const originals = z.array(originalCas).min(1).max(50);
export const statementSettlementActionSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('configure'),
      ...common,
      cardAccountId: id,
      fundingAccountId: id,
      expectedRevision: revision.nullable(),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({ operation: z.literal('confirm'), ...common, ...source, legacy: legacy.optional() })
    .strict(),
  z
    .object({
      operation: z.literal('create_transfer'),
      ...common,
      ...settlement,
      ...source,
      status,
    })
    .strict(),
  z
    .object({
      operation: z.literal('link_transfer'),
      ...common,
      ...settlement,
      ...source,
      transferId: id,
      fromBookingId: id,
      fromRevision: revision,
      toBookingId: id,
      toRevision: revision,
    })
    .strict(),
  z.object({ operation: z.literal('withdraw'), ...common, ...settlement }).strict(),
  z
    .object({
      operation: z.literal('amend'),
      ...common,
      ...settlement,
      ...source,
      legacy: legacy.optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('confirm_bonus'),
      ...common,
      ...source,
      evidence: statementBonusEvidenceSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('create_bonus'),
      ...common,
      ...bonus,
      ...source,
      selectedOriginals: originals,
      status,
    })
    .strict(),
  z
    .object({
      operation: z.literal('link_bonus'),
      ...common,
      ...bonus,
      ...source,
      selectedOriginals: originals,
      bookingId: id,
      bookingRevision: revision,
      splitRevisions: z
        .array(z.object({ splitId: id, revision }).strict())
        .min(1)
        .max(50),
    })
    .strict(),
  z.object({ operation: z.literal('withdraw_bonus'), ...common, ...bonus }).strict(),
  z
    .object({
      operation: z.literal('amend_bonus'),
      ...common,
      ...bonus,
      ...source,
      evidence: statementBonusEvidenceSchema,
      sourceReview: z
        .object({ acknowledged: z.literal(true), facts: statementFactsSchema })
        .strict()
        .optional(),
    })
    .strict(),
]);
export type StatementSettlementAction = z.infer<typeof statementSettlementActionSchema>;
export type SettlementSource = z.infer<typeof settlementSourceSchema>;
export type StatementBonusEvidence = z.infer<typeof statementBonusEvidenceSchema>;
export type StatementActionReceipt = {
  operation: StatementSettlementAction['operation'];
  groupId: string | null;
  configRevision?: string;
  settlementId?: string;
  settlementRevision?: string;
  bonusId?: string;
  bonusRevision?: string;
  transferId?: string;
  bookingId?: string;
};

/** Schema declaration order, including nested CAS/defaults, is the versioned wire order. */
export function canonicalStatementAction(input: unknown) {
  return JSON.stringify({ version: 1, request: statementSettlementActionSchema.parse(input) });
}
export function statementPayableState(value: number | null) {
  return value === null
    ? 'incomplete'
    : value === 0
      ? 'zero'
      : value < 0
        ? 'credit_manual'
        : 'open';
}

export type StatementAcceptedSource = {
  id: string;
  sourceIntakeId: string;
  receiptId: string;
  sourceSha256: string;
  sourceRevision: string;
  cardAccountId: string;
  reference: string | null;
  issueDate: string;
  currency: string;
  originsJson: string;
  representationKind: 'created' | 'linked' | null;
  actionGroupId: string | null;
  revision: string | null;
};
export type StatementSettlementState = {
  config: {
    cardAccountId: string;
    fundingAccountId: string;
    enabled: boolean;
    revision: string | null;
  } | null;
  settlements: (StatementAcceptedSource & {
    fundingAccountId: string;
    debitDate: string;
    payableCents: number;
    state: 'open' | 'represented' | 'zero' | 'credit_manual' | 'withdrawn' | 'superseded';
    supersedesId: string | null;
    legacyPaymentId: string | null;
    legacyDueDate: string | null;
    transferId: string | null;
    fromBookingId: string | null;
    toBookingId: string | null;
  })[];
  bonuses: (StatementAcceptedSource & {
    bonusCents: number;
    creditDate: string;
    state: 'ready' | 'represented' | 'already_net' | 'withdrawn' | 'superseded';
    supersedesId: string | null;
    bookingId: string | null;
    evidenceJson: string;
    evidence: StatementBonusEvidence;
  })[];
};
export type StatementCandidateCursor = { date: string; id: string };
export type StatementCandidateKind = 'original' | 'credit' | 'transfer';
export type StatementCandidateOmission =
  'missing_history' | 'invalid_identity' | 'consumed' | 'unsupported' | 'too_many_splits';
export type StatementOriginalCandidate = {
  kind: 'original';
  date: string;
  status: 'pending' | 'confirmed' | 'reconciled';
  selection: StatementBonusEvidence['selectedOriginals'][number];
};
export type StatementCreditCandidate = {
  kind: 'credit';
  date: string;
  status: 'pending' | 'confirmed' | 'reconciled';
  accountId: string;
  currency: string;
  amountCents: number;
  allocations: { categoryId: string | null; amountCents: number; incomeTypeId: string | null }[];
  selection: Pick<
    Extract<StatementSettlementAction, { operation: 'link_bonus' }>,
    'bookingId' | 'bookingRevision' | 'splitRevisions'
  >;
};
export type StatementTransferCandidate = {
  kind: 'transfer';
  date: string;
  fromStatus: 'pending' | 'confirmed' | 'reconciled';
  toStatus: 'pending' | 'confirmed' | 'reconciled';
  fromAccountId: string;
  toAccountId: string;
  currency: string;
  fromCents: number;
  toCents: number;
  selection: Pick<
    Extract<StatementSettlementAction, { operation: 'link_transfer' }>,
    'transferId' | 'fromBookingId' | 'fromRevision' | 'toBookingId' | 'toRevision'
  >;
};
export type StatementCandidate =
  StatementOriginalCandidate | StatementCreditCandidate | StatementTransferCandidate;
export type StatementCandidatePage = {
  kind: StatementCandidateKind;
  items: StatementCandidate[];
  nextCursor: StatementCandidateCursor | null;
  omitted: Partial<Record<StatementCandidateOmission, number>>;
};

export const statementCandidateQuerySchema = z
  .object({
    cardAccountId: id,
    kind: z.enum(['original', 'credit', 'transfer']),
    limit: z.coerce.number().int().min(1).max(25).default(25),
    beforeDate: day.optional(),
    beforeId: id.optional(),
    bonusId: id.optional(),
    settlementId: id.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      Boolean(v.beforeDate) !== Boolean(v.beforeId) ||
      (v.kind === 'credit' && !v.bonusId) ||
      (v.kind === 'transfer' && !v.settlementId) ||
      (v.kind !== 'transfer' && v.settlementId) ||
      (v.kind === 'transfer' && v.bonusId)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Explicit matching target and complete cursor required.',
      });
  });
export type StatementCandidateQuery = z.infer<typeof statementCandidateQuerySchema>;
