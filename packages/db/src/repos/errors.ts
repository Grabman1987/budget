/** Errors thrown by the repositories. All extend `Error`, so callers may also catch generically. */

/** Undo refused or impossible (entity changed since, unknown entry, no soft delete on the table). */
export class AuditError extends Error {
  override readonly name = 'AuditError';
}

/** The addressed row does not exist (or is soft-deleted and `includeDeleted` was not requested). */
export class EntityNotFoundError extends Error {
  override readonly name = 'EntityNotFoundError';
  constructor(
    readonly entityType: string,
    readonly entityId: string,
  ) {
    super(`${entityType} ${entityId} not found`);
  }
}

/** A booking or transfer input/patch violates a SPEC §5 invariant. */
export class BookingInvariantError extends Error {
  override readonly name = 'BookingInvariantError';
}

/**
 * A reconciled booking (status `reconciled`, part of a Kontostand prüfen) is locked: only its flag
 * and memo change freely. Amount, date, account, splits, payee, status and deletion need an
 * explicit unlock (`unlockReconciled`), because the bank balance was checked against them.
 */
export class ReconciledLockedError extends Error {
  override readonly name = 'ReconciledLockedError';
  constructor(readonly bookingIds: string[]) {
    super(
      `Booking ${bookingIds.join(', ')} is reconciled (geprüft) and locked; unlock it explicitly to change it`,
    );
  }
}

/** The write would clash with existing data (duplicate name, system row, a difference that remains). */
export class ConflictError extends Error {
  override readonly name = 'ConflictError';
}

/** A category write breaks a rule of the category system (class, kind, card, stage, icon, merge). */
export class CategoryRuleError extends Error {
  override readonly name = 'CategoryRuleError';
}
