import { createHash } from 'node:crypto';
import {
  parseCardDocument,
  type CardBoundary,
  type StatementAutomationOutcome,
  type StatementCas,
} from '@budget/domain';
import {
  ConflictError,
  prepareStatementAutomation,
  performStatementAutomation,
  readStatementAutomationOutcome,
  type Db,
} from '@budget/db';
import { extractStatementText, readStatementSource } from './service';

const review = (intakeId: string, reasons: string[]): StatementAutomationOutcome => ({
  intakeId, runId: null, groupId: null, status: 'review', created: 0, matched: 0,
  credits: 0, receiptLinks: 0, pending: [], reasons: [...new Set(reasons)],
  suggestedCardTokens: [], suggestedCardHints: [], items: [],
});

/** Delivery replay is an acknowledgement, never authorization to redo an earlier action. */
export function unchangedStatementAutomation(db: Db, intakeId: string): StatementAutomationOutcome {
  const previous = readStatementAutomationOutcome(db, intakeId);
  return previous
    ? { ...previous, items: previous.items ?? [], groupId: null, status: previous.status === 'undone' ? 'undone' : 'unchanged' }
    : { ...review(intakeId, ['duplicate_source']), status: 'unchanged' };
}

/** Server-only retained-source extraction; clients cannot submit trusted parsed rows/proofs. */
export async function automateRetainedStatement(
  db: Db,
  dir: string,
  intakeId: string,
  cas: StatementCas,
  password?: string,
): Promise<StatementAutomationOutcome> {
  const priorResult = readStatementAutomationOutcome(db, intakeId);
  if (priorResult) return unchangedStatementAutomation(db, intakeId);
  const preparation = prepareStatementAutomation(db, intakeId, cas);
  const context = {
    ...preparation.context,
    cardIdentity: (raw: string) => {
      const normalized = raw.trim().replace(/\s+/g, ' ').toLowerCase();
      const digits = raw.replace(/\D/g, '');
      return {
        fingerprint: createHash('sha256').update(JSON.stringify([
          'statement-card-v1', preparation.context.accountId, normalized,
        ])).digest('hex'),
        hint: digits.length >= 4 ? `****${digits.slice(-4)}` : 'Karte',
      };
    },
  };
  let currentText: string;
  try {
    const bytes = await readStatementSource(dir, preparation.source.sha256, preparation.source.sizeBytes);
    const extracted = await extractStatementText(bytes, password);
    if (!extracted.text || extracted.error) return review(intakeId, ['source_extraction_unavailable']);
    currentText = extracted.text;
  } catch {
    // No document text/password/provider error is logged or returned.
    return review(intakeId, ['retained_source_unavailable']);
  }
  let previous: CardBoundary | null = null;
  const previousReasons: string[] = [];
  if (preparation.previous) {
    try {
      const source = preparation.previous;
      const bytes = await readStatementSource(dir, source.sha256, source.sizeBytes);
      const extracted = await extractStatementText(bytes, password);
      if (extracted.text && !extracted.error && source.accountId === preparation.source.accountId) {
        const prior = parseCardDocument(extracted.text, source.sha256, context);
        const f = prior.summary.fields;
        const tokens = [...new Set(prior.rows.map((row) => row.cardToken))];
        const printed = [f.issueDate, f.currency, f.payableCents].every((field) =>
          field.origin === 'printed' && field.value !== null && field.candidates.length === 1);
        // A historical source may lack its own earlier boundary, but skipped/malformed
        // rows or a different layout can never prove the current opening balance.
        const priorBoundaryOnly = new Set(['previous_source_required', 'row_year_unavailable', 'closing_total_unverified']);
        if (prior.layout === 'issued_card' && prior.reasons.every((reason) => priorBoundaryOnly.has(reason)) &&
            printed && f.issueDate.value === source.issueDate &&
            f.currency.value === context.currency && Number.isSafeInteger(f.payableCents.value) &&
            !prior.summary.warnings.some((reason) => reason.startsWith('ambiguous')) &&
            tokens.length > 0 && tokens.every((token) => /^[a-f0-9]{64}$/.test(token) &&
              context.mappedCardAccounts[token] === preparation.source.accountId)) {
          previous = {
            intakeId: source.intakeId, sha256: source.sha256, revision: source.revision,
            accountId: source.accountId, mappingKey: preparation.config.mappingKey,
            currency: f.currency.value!, cardTokens: tokens, issueDate: f.issueDate.value!,
            payableCents: f.payableCents.value!,
          };
        } else previousReasons.push('previous_source_needs_review');
      } else previousReasons.push('previous_source_needs_review');
    } catch { previousReasons.push('previous_source_unavailable'); }
  }
  const document = parseCardDocument(currentText, preparation.source.sha256, { ...context, previous });
  // Previous-summary evidence is required by the consumer layout, not an unrelated company invoice.
  const relevantReasons = preparation.reasons.filter((reason) =>
    !reason.startsWith('previous_') || document.layout === 'issued_card');
  document.reasons = [...new Set([...document.reasons, ...relevantReasons,
    ...(document.layout === 'issued_card' ? previousReasons : []),
  ])];
  const hints = [...new Map(document.rows.filter((row) => /^[a-f0-9]{64}$/.test(row.cardToken))
    .map((row) => [row.cardToken, { token: row.cardToken, hint: row.cardHint }] as const)).values()];
  // Read-only discovery also works before setup, without implicitly enabling/posting anything.
  if (!preparation.config.enabled || !preparation.config.revision) {
    // Extraction yields between database reads. Discovery is nonposting, but its
    // hints must still belong to the current source, lifecycle and mapping.
    const fresh = prepareStatementAutomation(db, intakeId, cas);
    if (JSON.stringify(fresh) !== JSON.stringify(preparation))
      throw new ConflictError('Quelle oder Zuordnung wurde geändert. Bitte neu laden.');
    return {
      ...review(intakeId, [...document.reasons, 'automation_not_configured']),
      suggestedCardTokens: hints.map((row) => row.token), suggestedCardHints: hints,
    };
  }
  const key = createHash('sha256').update(JSON.stringify([
    'statement-automation-v1', preparation.source.intakeId, preparation.source.sha256,
    preparation.config.revision,
  ])).digest('hex');
  // The repository rechecks source/config/mapping, prior source and actual money after I/O.
  return performStatementAutomation(db, {
    source: preparation.source, configRevision: preparation.config.revision,
    settlementConfigRevision: preparation.settlementConfigRevision, document, key,
  }, { actor: 'document-automation:card' });
}
