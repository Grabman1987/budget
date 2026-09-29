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
