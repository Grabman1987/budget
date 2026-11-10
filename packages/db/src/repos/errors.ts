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

/** A budget account must use EUR because budget and allocation amounts are stored as EUR cents. */
export class AccountInvariantError extends Error {
  override readonly name = 'AccountInvariantError';
  constructor() {
    super(
      'Budgetkonten müssen in Euro geführt werden. Bitte verwenden Sie EUR oder nehmen Sie das Konto aus dem Budget.',
    );
  }
}

/** A EUR valuation needs an exchange rate that is not present on or before the requested day. */
export class MissingFxRateError extends Error {
  override readonly name = 'MissingFxRateError';
  constructor(
    readonly currency: string,
    readonly asOf: string,
  ) {
    super(`Für ${currency} ist bis einschließlich ${asOf} kein Wechselkurs gespeichert.`);
  }
}

/**
 * A reconciled booking (status `reconciled`, part of a Kontostand prüfen) is locked: only its flag
 * and memo change freely. Amount, date, account, splits, payee, status and deletion need an
 * explicit unlock (`unlockReconciled`), because the bank balance was checked against them.
 */
export class ReconciledLockedError extends Error {
  override readonly name = 'ReconciledLockedError';
  constructor(
    readonly bookingIds: string[],
    message?: string,
  ) {
    super(
      message ??
        `Booking ${bookingIds.join(', ')} is reconciled (geprüft) and locked; unlock it explicitly to change it`,
    );
  }
}

/** The write would clash with existing data (duplicate name, system row, a difference that remains). */
export class ConflictError extends Error {
  override readonly name = 'ConflictError';
}

/** A contact name or alias is taken (normalised) by another active contact or alias. */
export class ContactLabelTakenError extends ConflictError {
  constructor(
    readonly ownerContactId: string,
    readonly ownerName: string,
    readonly kind: 'name' | 'alias',
  ) {
    super(
      kind === 'name'
        ? `Der Name gehört bereits zum Kontakt „${ownerName}“.`
        : `Der Name ist bereits ein Alias des Kontakts „${ownerName}“.`,
    );
  }
}

/** A writer named an archived contact (#870): the owner reopens it first. */
export class ContactArchivedError extends Error {
  override readonly name = 'ContactArchivedError';
  constructor(readonly contactId: string) {
    super('Der Kontakt ist archiviert. Bitte zuerst wieder öffnen.');
  }
}

export interface ContactBlocker {
  kind: 'receivable' | 'credit' | 'expected' | 'payee' | 'account' | 'payslip';
  /** Cents for receivable/credit, the number of live rows otherwise. */
  count: number;
}

/** Archiving is refused while the contact still carries open money or live configuration. */
export class ContactBlockedError extends Error {
  override readonly name = 'ContactBlockedError';
  constructor(readonly blockers: ContactBlocker[]) {
    super('Der Kontakt kann nicht archiviert werden, solange noch etwas offen oder verknüpft ist.');
  }
}

/** The row changed since the client read it (`expectedUpdatedAt` differs). */
export class StaleError extends Error {
  override readonly name = 'StaleError';
  constructor(readonly current: unknown) {
    super('Der Eintrag wurde inzwischen geändert. Bitte neu laden.');
  }
}

/** A category write breaks a rule of the category system (class, kind, card, stage, icon, merge). */
export class CategoryRuleError extends Error {
  override readonly name = 'CategoryRuleError';
}
