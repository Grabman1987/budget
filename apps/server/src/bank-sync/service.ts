import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt, gte, isNull, lte, or, sql } from 'drizzle-orm';
import {
  bookedBalance,
  ConflictError,
  createBooking,
  assignmentPatch,
  learnBankPayee,
  learnInboxAssignment,
  markBankBookingTransfer,
  readAssignmentCandidate,
  bookingIncomeDefault,
  importBooking,
  linkBankReference,
  unlinkedBankTargets,
  createEntity,
  getEntity,
  updateEntity,
  EntityNotFoundError,
  insertTracked as insertUnwrapped,
  restoreBooking,
  updateBooking,
  schema,
  updateTracked as updateUnwrapped,
  runInTransaction,
  withGroup,
  writesHeld,
  type Db,
  type Executor,
} from '@budget/db';
import {
  bankTransactionKeys,
  bankFetchFrom,
  addDays,
  BANK_AUTO_LINK_DAYS,
  type BankLineMatch,
  matchBankLines,
  cents,
  consentNeedsAttention,
  formatEuro,
  nextBankRun,
  todayInVienna,
  assignmentActionsSchema,
  type AssignmentActions,
} from '@budget/domain';
import { BankError, type BankProvider } from './provider';
import type { bankSecretBox } from './secrets';

const {
  bankSyncConsent: consent,
  bankSyncAccount: link,
  bankSyncCandidate: candidate,
  inboxItem,
  account,
  booking,
} = schema;
/** Longest consent we ever request (180 days); a longer reported validity is capped to it. */
const MAX_CONSENT_SECONDS = 15_552_000;
/** ISO 4217 "no currency": a multi-currency account (e.g. PayPal); each line carries its own. */
const MULTI_CURRENCY = 'XXX';
const AMBIGUOUS_NOTE = ' · Mehrere passende vorhandene Buchungen, bitte eine auswählen';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const system = { actor: 'bank-sync' };
// Standalone protocol/status writes need the same atomic row+audit contract as grouped ledger writes.
const insertTracked: typeof insertUnwrapped = (db, table, values, ctx) =>
  runInTransaction(db, (tx) => insertUnwrapped(tx, table, values, ctx));
const updateTracked: typeof updateUnwrapped = (db, table, key, patch, ctx, action) =>
  runInTransaction(db, (tx) => updateUnwrapped(tx, table, key, patch, ctx, action));
export class BankSync {
  constructor(
    readonly db: Db,
    readonly provider: BankProvider,
    readonly box: ReturnType<typeof bankSecretBox>,
    readonly origin: string,
    readonly clock: () => Date = () => new Date(),
  ) {}

  private bookedToLedger(db: Executor, id: string) {
    return getEntity(db, schema.appSetting, 'bank.booked_to_ledger:' + id)?.value !== 'false';
  }

  setPolicy(id: string, bookedToLedger: boolean) {
    return this.db.transaction((tx) => {
      const row = tx.select().from(consent).where(eq(consent.id, id)).get();
      if (!row) throw new EntityNotFoundError('bank_sync_consent', id);
      if (row.leaseUntil && row.leaseUntil > this.clock().toISOString())
        throw new ConflictError('Der Abruf läuft noch.');
      const key = 'bank.booked_to_ledger:' + id;
      const ctx = withGroup({ actor: 'owner' });
      const value = String(bookedToLedger);
      if (getEntity(tx, schema.appSetting, key))
        updateEntity(tx, schema.appSetting, key, { value }, ctx);
      else createEntity(tx, schema.appSetting, { id: key, value }, ctx);
      return { groupId: ctx.groupId };
    });
  }

  /**
   * Post booked bank lines to the ledger. A line first looks for the booking the owner (or the
   * migration) already made; only without any match it becomes a new unchecked booking.
   * Ambiguity leaves the line open in the inbox for the owner. Separates the replayable ledger
   * audit from the irreversible provider protocol history.
   */
  private postBooked(tx: Executor, ids: readonly string[], sourceId: string) {
    // Without the opt-in a line is still tied to a booking that already exists, but never posted.
    const post = this.bookedToLedger(tx, sourceId);
    const ctx = withGroup(system);
    const resolve = (id: string, resolution: string) =>
      updateTracked(
        tx,
        inboxItem,
        [id],
        { resolvedAt: this.clock().toISOString(), resolution },
        ctx,
      );
    const fresh: (typeof candidate.$inferSelect)[] = [];
    for (const id of new Set(ids)) {
      const row = tx.select().from(candidate).where(eq(candidate.id, id)).get();
      const item = tx.select().from(inboxItem).where(eq(inboxItem.id, id)).get();
      if (!row || row.bankStatus !== 'booked' || !item || item.resolvedAt) continue;
      const known = tx
        .select({ id: booking.id })
        .from(booking)
        .where(
          and(
            eq(booking.accountId, row.accountId),
            eq(booking.importKey, 'bank-sync:' + row.dedupeKey),
          ),
        )
        .get();
      if (known) resolve(id, 'Kontowirksam übernommen: ' + known.id);
      else fresh.push(row);
    }
    const matches = new Map<string, BankLineMatch>();
    for (const accountId of new Set(fresh.map((r) => r.accountId))) {
      const rows = fresh.filter((r) => r.accountId === accountId);
      const dates = rows.map((r) => r.date).sort();
      const found = matchBankLines(
        rows.map((r) => ({
          key: r.id,
          accountId: r.accountId,
          date: r.date,
          amountCents: r.amountCents,
          currency: r.currency,
        })),
        unlinkedBankTargets(
          tx,
          accountId,
          addDays(dates[0]!, -BANK_AUTO_LINK_DAYS),
          addDays(dates[dates.length - 1]!, BANK_AUTO_LINK_DAYS),
        ),
      );
      for (const [key, value] of found) matches.set(key, value);
    }
    for (const row of fresh) {
      const match = matches.get(row.id) ?? { kind: 'none' as const };
      if (match.kind === 'linked') {
        linkBankReference(tx, match.bookingId, row, ctx);
        resolve(row.id, 'Mit vorhandener Buchung verknüpft: ' + match.bookingId);
      } else if (match.kind === 'ambiguous') {
        // Stays open: the owner picks the booking (inbox: "Passende Buchung").
        const item = tx.select().from(inboxItem).where(eq(inboxItem.id, row.id)).get()!;
        if (!(item.detail ?? '').endsWith(AMBIGUOUS_NOTE))
          updateTracked(
            tx,
            inboxItem,
            [row.id],
            { detail: (item.detail ?? '') + AMBIGUOUS_NOTE },
            ctx,
          );
      } else if (post) {
        const result = importBooking(
          tx,
          {
            accountId: row.accountId,
            date: row.date,
            amountCents: row.amountCents,
            currency: row.currency,
            memo: row.memo,
            source: 'bank',
            importKey: 'bank-sync:' + row.dedupeKey,
            status: 'pending',
            incomeNextMonth: false,
            splits: [{ amountCents: row.amountCents, categoryId: null }],
          },
          ctx,
        );
        // The unchecked booking is itself the open task (inbox booking row with confirm / merge).
        resolve(row.id, 'Als ungeprüfte Buchung angelegt, bitte prüfen: ' + result.id);
      }
    }
  }

  status() {
    const connections = this.db
      .select()
      .from(consent)
      .all()
      .filter((c) => c.status !== 'abandoned')
      .map((c) => ({
        id: c.id,
        bookedToLedger: this.bookedToLedger(this.db, c.id),
        label: c.label,
        status:
          c.status !== 'paused' && c.validUntil && c.validUntil <= this.clock().toISOString()
            ? 'expired'
            : c.status,
        validUntil: c.validUntil,
        lastAttemptAt: c.lastAttemptAt,
        lastSuccessAt: c.lastSuccessAt,
        nextRunAt: c.nextRunAt,
        accounts: this.db
          .select()
          .from(link)
          .where(eq(link.consentId, c.id))
          .all()
          .map((a) => ({
            id: a.id,
            label: a.label,
            currency: a.currency,
            accountId: a.accountId,
            fromDate: a.fromDate,
            locked: a.lastSyncAt !== null,
          })),
      }));
    const accounts = this.db
      .select({
        id: account.id,
        name: account.name,
        currency: account.currency,
        openingDate: account.openingDate,
        type: account.type,
        onBudget: account.onBudget,
        sortOrder: account.sortOrder,
        closedAt: account.closedAt,
      })
      .from(account)
      .where(and(isNull(account.deletedAt), isNull(account.closedAt), eq(account.currency, 'EUR')))
      .all();
    return { configured: true, connections, accounts };
  }

  async start(name: string, country: string, initiator: string) {
    const now = this.clock();
    const recent = this.db
      .select()
      .from(consent)
      .where(and(eq(consent.initiator, initiator), gt(consent.expiresAt, now.toISOString())))
      .all();
    if (recent.length >= 5)
      throw new ConflictError('Bitte vor einer weiteren Verbindung kurz warten.');
    const institution = (await this.provider.institutions()).find(
      (a) => a.name === name && a.country === country,
    );
    if (!institution) throw new ConflictError('Dieses Institut ist nicht verfügbar.');
    const state = randomBytes(32).toString('base64url');
    const id = randomUUID();
    insertTracked(
      this.db,
      consent,
      {
        id,
        initiator,
        stateHash: hash(state),
        label: name + ' · ' + country,
        expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
        nextRunAt: now.toISOString(),
      },
      withGroup({ actor: 'owner' }),
    );
    try {
      return {
        url: await this.provider.authorize(
          institution,
          state,
          this.origin + '/einstellungen/datenquellen',
        ),
      };
    } catch (error) {
      this.failure(id, error);
      throw new BankError('unavailable');
    }
  }

  async callback(code: string, state: string, initiator: string) {
    const now = this.clock().toISOString();
    // Consume atomically before the external POST; replay and concurrent callbacks fail closed.
    const row = this.db
      .update(consent)
      .set({ usedAt: now })
      .where(
        and(
          eq(consent.stateHash, hash(state)),
          eq(consent.initiator, initiator),
          isNull(consent.usedAt),
          gt(consent.expiresAt, now),
        ),
      )
      .returning()
      .get();
    if (!row)
      throw new ConflictError(
        'Bankfreigabe abgelaufen oder bereits verarbeitet. Bitte neu verbinden.',
      );
    try {
      const session = await this.provider.session(code);
      // A validity in the past is unusable. One beyond what we asked for (at most
      // MAX_CONSENT_SECONDS) is harmless: keep the consent but cap its stored expiry.
      if (Date.parse(session.validUntil) <= Date.parse(now))
        throw new BankError('invalid_validity', 900, 'past@access.valid_until');
      const validUntil = new Date(
        Math.min(Date.parse(session.validUntil), Date.parse(now) + MAX_CONSENT_SECONDS * 1000),
      ).toISOString();
      this.db.transaction((tx) => {
        const ctx = withGroup({ actor: 'owner' });
        updateTracked(
          tx,
          consent,
          [row.id],
          {
            secret: this.box.seal(session.id, row.id),
            validUntil,
            status: 'active',
          },
          ctx,
        );
        for (const a of session.accounts) {
          const id = randomUUID();
          insertTracked(
            tx,
            link,
            {
              id,
              consentId: row.id,
              secret: this.box.seal(a.uid, id),
              label: a.label,
              currency: a.currency,
            },
            ctx,
          );
        }
      });
      return { id: row.id };
    } catch (error) {
      this.failure(row.id, error);
      throw new BankError('unavailable');
    }
  }

  map(id: string, accountId: string, fromDate: string) {
    return this.db.transaction((tx) => {
      const row = tx.select().from(link).where(eq(link.id, id)).get();
      const acct = tx.select().from(account).where(eq(account.id, accountId)).get();
      if (!row || !acct) throw new EntityNotFoundError('bank_sync_account', id);
      const parent = tx.select().from(consent).where(eq(consent.id, row.consentId)).get()!;
      if (row.lastSyncAt || (parent.leaseUntil && parent.leaseUntil > this.clock().toISOString()))
        throw new ConflictError(
          'Eine abgerufene oder laufende Zuordnung ist gesperrt. Bitte neu verbinden.',
        );
      if (
        acct.deletedAt ||
        acct.closedAt ||
        acct.currency !== 'EUR' ||
        (row.currency !== 'EUR' && row.currency !== MULTI_CURRENCY)
      )
        throw new ConflictError('Nur offene EUR-Konten können zugeordnet werden.');
      if (fromDate < acct.openingDate || fromDate > todayInVienna(this.clock()))
        throw new ConflictError('Das Startdatum muss zwischen Kontoeröffnung und heute liegen.');
      const duplicate = tx
        .select()
        .from(link)
        .innerJoin(consent, eq(consent.id, link.consentId))
        .where(
          and(
            eq(link.accountId, accountId),
            or(eq(consent.status, 'active'), eq(consent.status, 'error')),
          ),
        )
        .all()
        .some((r) => r.bank_sync_account.id !== id);
      if (duplicate)
        throw new ConflictError(
          'Dieses Konto hat bereits eine aktive Datenquelle. Alte Verbindung zuerst pausieren.',
        );
      const ctx = withGroup({ actor: 'owner' });
      updateTracked(tx, link, [id], { accountId, fromDate }, ctx);
      return { groupId: ctx.groupId };
    });
  }

  pause(id: string) {
    return this.db.transaction((tx) => {
      const row = tx.select().from(consent).where(eq(consent.id, id)).get();
      if (!row) throw new EntityNotFoundError('bank_sync_consent', id);
      if (row.leaseUntil && row.leaseUntil > this.clock().toISOString())
        throw new ConflictError('Der Abruf läuft noch.');
      updateTracked(tx, consent, [id], { status: 'paused' }, withGroup({ actor: 'owner' }));
      return { id };
    });
  }

  requestRun(id: string) {
    const row = this.db.select().from(consent).where(eq(consent.id, id)).get();
    if (
      !row ||
      !row.secret ||
      row.status === 'paused' ||
      !row.validUntil ||
      row.validUntil <= this.clock().toISOString()
    )
      throw new ConflictError('Keine aktive Bankverbindung.');
    const now = this.clock();
    if (
      row.lastAttemptAt &&
      (now.getTime() - Date.parse(row.lastAttemptAt) < 15 * 60_000 ||
        (row.failures > 0 && row.nextRunAt > now.toISOString()))
    )
      throw new ConflictError('Abrufpause aktiv. Bitte den nächsten Versuch abwarten.');
    if (row.leaseUntil && row.leaseUntil > now.toISOString())
      throw new ConflictError('Der Abruf läuft bereits.');
    this.db.update(consent).set({ nextRunAt: now.toISOString() }).where(eq(consent.id, id)).run();
    return { queued: true };
  }

  private warning(
    tx: Executor,
    id: string,
    kind: 'consent' | 'reconciliation' | 'other' | 'revision',
    title: string,
    detail: string,
    refId: string,
    refresh = false,
    reopenChanged = false,
  ) {
    const existing = tx.select().from(inboxItem).where(eq(inboxItem.id, id)).get();
    if (existing) {
      if (
        refresh &&
        (existing.title !== title ||
          existing.detail !== detail ||
          existing.resolution === 'Bankprüfung derzeit nicht erforderlich.')
      )
        updateTracked(
          tx,
          inboxItem,
          [id],
          {
            title,
            detail,
            ...(reopenChanged || existing.resolution === 'Bankprüfung derzeit nicht erforderlich.'
              ? { resolvedAt: null, resolution: null }
              : {}),
          },
          withGroup(system),
        );
      return;
    }
    insertTracked(
      tx,
      inboxItem,
      { id, kind, title, detail, refType: 'bank-sync', refId, urgent: true },
      withGroup(system),
    );
  }

  private failure(id: string, error: unknown, warn = true) {
    const now = this.clock();
    const row = this.db.select().from(consent).where(eq(consent.id, id)).get()!;
    const code = error instanceof BankError ? error.code : 'unavailable';
    const detail = error instanceof BankError ? error.detail : undefined;
    const delay = Math.max(
      error instanceof BankError ? error.retrySeconds : 900,
      Math.min(86400, 900 * 2 ** Math.min(row.failures, 7)),
    );
    this.db.transaction((tx) => {
      updateTracked(
        tx,
        consent,
        [id],
        {
          failures: row.failures + 1,
          status: row.secret ? 'error' : 'failed',
          leaseUntil: null,
          nextRunAt: new Date(now.getTime() + delay * 1000).toISOString(),
        },
        withGroup(system),
      );
      if (warn)
        this.warning(
          tx,
          'bank-error:' + id + ':' + code + ':' + todayInVienna(now),
          'other',
          'Bankabruf fehlgeschlagen',
          this.errorDetail(code, detail),
          id,
        );
    });
  }

  private errorDetail(code: string, detail?: string): string {
    if (code === 'auth_failed')
      return 'App-Anmeldung fehlgeschlagen. App-ID und Signierschlüssel prüfen.';
    if (code === 'history_unavailable')
      return 'Das Institut erlaubt den gewählten historischen Zeitraum nicht. Startdatum prüfen; gegebenenfalls pausieren und mit neuerem Startdatum verbinden.';
    if (code === 'request_limit')
      return 'Tageslimit für Bankabrufe erreicht oder Zeitraum benötigt mehr als drei Seiten. Nächsten Tag abwarten; beim ersten Abruf gegebenenfalls einen neueren Start wählen.';
    if (code === 'consent_expired')
      return 'Bankeinwilligung abgelaufen oder widerrufen. Bitte neu verbinden.';
    if (code === 'invalid_validity')
      return 'Die Bank meldet eine unbrauchbare Gültigkeit der Freigabe. Bitte neu verbinden.';
    return 'Datenquelle prüfen. Fehlerklasse: ' + code + (detail ? ' (' + detail + ')' : '');
  }

  private prunePending(now: string) {
    this.db.transaction((tx) => {
      for (const row of tx
        .select()
        .from(consent)
        .where(
          and(
            isNull(consent.secret),
            lte(consent.expiresAt, now),
            or(eq(consent.status, 'pending'), eq(consent.status, 'failed')),
          ),
        )
        .all()) {
        const ctx = withGroup(system);
        // Retain an audited tombstone; remove abandoned state from the owner's active list.
        updateTracked(
          tx,
          consent,
          [row.id],
          {
            status: 'abandoned',
            initiator: '',
            usedAt: now,
            leaseUntil: null,
          },
          ctx,
        );
        for (const item of tx
          .select()
          .from(inboxItem)
          .where(
            and(
              eq(inboxItem.refType, 'bank-sync'),
              eq(inboxItem.refId, row.id),
              isNull(inboxItem.resolvedAt),
            ),
          )
          .all())
          updateTracked(
            tx,
            inboxItem,
            [item.id],
            { resolvedAt: now, resolution: 'Bankfreigabe abgelaufen.' },
            ctx,
          );
      }
    });
  }

  private reserveRequest(id: string) {
    this.db.transaction((tx) => {
      const row = tx.select().from(link).where(eq(link.id, id)).get()!;
      const day = todayInVienna(this.clock());
      const count = row.requestDay === day ? row.requestCount : 0;
      if (count >= 4) throw new BankError('request_limit', 86400);
      updateTracked(
        tx,
        link,
        [id],
        { requestDay: day, requestCount: count + 1 },
        withGroup(system),
      );
    });
  }

  /** One process may claim a connection; no transaction stays open across provider requests. */
  async tick() {
    if (writesHeld(this.db)) return;
    const now = this.clock();
    this.prunePending(now.toISOString());
    const rows = this.db
      .select()
      .from(consent)
      .all()
      .filter((c) => c.secret && c.validUntil && c.status !== 'paused');
    for (const row of rows) {
      if (consentNeedsAttention(row.validUntil!, now))
        this.warning(
          this.db,
          'bank-consent:' + row.id,
          'consent',
          'Bankeinwilligung erneuern',
          row.label + ' · gültig bis ' + row.validUntil!.slice(0, 10),
          row.id,
        );
      if (row.validUntil! <= now.toISOString()) continue;
      const links = this.db.select().from(link).where(eq(link.consentId, row.id)).all();
      if (!links.some((a) => a.accountId && a.fromDate)) continue;
      const claimed = this.db
        .update(consent)
        .set({
          leaseUntil: new Date(now.getTime() + 120_000).toISOString(),
          lastAttemptAt: now.toISOString(),
          // A crash must not bypass the minimum interval when the lease expires.
          nextRunAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
        })
        .where(
          and(
            eq(consent.id, row.id),
            or(eq(consent.status, 'active'), eq(consent.status, 'error')),
            lte(consent.nextRunAt, now.toISOString()),
            or(isNull(consent.leaseUntil), lte(consent.leaseUntil, now.toISOString())),
          ),
        )
        .returning()
        .get();
      if (!claimed) continue;
      const heartbeat = setInterval(() => {
        try {
          this.db
            .update(consent)
            .set({ leaseUntil: new Date(this.clock().getTime() + 120_000).toISOString() })
            .where(eq(consent.id, row.id))
            .run();
        } catch {
          console.error('Bank sync: heartbeat write unavailable; SQLite may be busy.');
        }
      }, 30_000);
      try {
        const failures: unknown[] = [];
        for (const a of links) {
          if (!a.accountId || !a.fromDate) continue;
          // A retry repairs failed accounts; accounts committed by that attempt need no repeat.
          if (
            row.failures &&
            a.lastSyncAt &&
            (!row.lastSuccessAt || a.lastSyncAt > row.lastSuccessAt) &&
            todayInVienna(new Date(a.lastSyncAt)) === todayInVienna(now)
          )
            continue;
          try {
            const acct = this.db.select().from(account).where(eq(account.id, a.accountId)).get();
            if (
              !acct ||
              acct.deletedAt ||
              acct.closedAt ||
              (a.currency !== MULTI_CURRENCY && acct.currency !== a.currency)
            )
              throw new BankError('invalid_response');
            // The watermark advances only after the complete account stage commits.
            const uid = this.box.open(a.secret, a.id);
            const batch = await this.provider.transactions(
              uid,
              bankFetchFrom(a.fromDate, a.lastSyncAt),
              todayInVienna(now),
              () => this.reserveRequest(a.id),
            );
            const transactions = batch.rows;
            // A multi-currency source reports one balance per currency: only the app account's counts.
            const balance = await this.provider.balance(
              uid,
              () => this.reserveRequest(a.id),
              a.currency === MULTI_CURRENCY ? acct.currency : undefined,
            );
            if (
              (balance &&
                balance.currency !==
                  (a.currency === MULTI_CURRENCY ? acct.currency : a.currency)) ||
              (balance?.date && balance.date > todayInVienna(now)) ||
              (a.currency !== MULTI_CURRENCY && transactions.some((t) => t.currency !== a.currency))
            )
              throw new BankError('invalid_response');
            if (writesHeld(this.db)) throw new BankError('unavailable');
            const keys = bankTransactionKeys(transactions);
            this.db.transaction((tx) => {
              const ctx = withGroup(system);
              const toPost: string[] = [];
              for (const [i, t] of transactions.entries()) {
                const dedupeKey = hash(keys[i]!);
                const foreign = t.currency !== acct.currency;
                const existing = tx
                  .select()
                  .from(candidate)
                  .where(
                    and(eq(candidate.accountId, a.accountId!), eq(candidate.dedupeKey, dedupeKey)),
                  )
                  .get();
                if (existing && foreign) continue;
                if (existing) {
                  const promoted =
                    existing.bankStatus === 'pending' && (t.bankStatus ?? 'booked') === 'booked';
                  if (promoted)
                    updateTracked(tx, candidate, [existing.id], { bankStatus: 'booked' }, ctx);
                  if (
                    existing.date !== t.date ||
                    existing.amountCents !== t.amountCents ||
                    existing.currency !== t.currency ||
                    existing.memo !== t.memo ||
                    existing.rawPayee !== (t.rawPayee ?? null)
                  ) {
                    const item = tx
                      .select()
                      .from(inboxItem)
                      .where(eq(inboxItem.id, existing.id))
                      .get()!;
                    const recorded = tx
                      .select()
                      .from(booking)
                      .where(
                        and(
                          eq(booking.accountId, a.accountId!),
                          eq(booking.importKey, 'bank-sync:' + existing.dedupeKey),
                          isNull(booking.deletedAt),
                        ),
                      )
                      .get();
                    const detail =
                      acct.name +
                      ' · ' +
                      t.date +
                      ' · ' +
                      formatEuro(cents(t.amountCents)) +
                      ' · ' +
                      t.memo;
                    if (recorded || item.resolvedAt) {
                      this.warning(
                        tx,
                        'bank-changed:' + existing.id,
                        'revision',
                        'Bankumsatz geändert',
                        detail + '. Bereits bearbeiteten Umsatz mit der Buchung vergleichen.',
                        existing.id,
                        true,
                        true,
                      );
                    } else {
                      updateTracked(
                        tx,
                        candidate,
                        [existing.id],
                        {
                          date: t.date,
                          amountCents: t.amountCents,
                          currency: t.currency,
                          memo: t.memo,
                          rawPayee: t.rawPayee ?? null,
                          sourceId: a.id,
                        },
                        ctx,
                      );
                      updateTracked(
                        tx,
                        inboxItem,
                        [existing.id],
                        { title: 'Bankumsatz geändert – prüfen', detail },
                        ctx,
                      );
                    }
                  }
                  const current = tx
                    .select()
                    .from(candidate)
                    .where(eq(candidate.id, existing.id))
                    .get()!;
                  toPost.push(current.id);
                  continue;
                }
                const id = randomUUID();
                insertTracked(
                  tx,
                  candidate,
                  {
                    id,
                    accountId: a.accountId!,
                    dedupeKey,
                    bankStatus: t.bankStatus ?? 'booked',
                    date: t.date,
                    amountCents: t.amountCents,
                    currency: t.currency,
                    memo: t.memo,
                    rawPayee: t.rawPayee ?? null,
                    sourceId: a.id,
                  },
                  ctx,
                );
                insertTracked(
                  tx,
                  inboxItem,
                  {
                    id,
                    kind: 'import',
                    title: foreign
                      ? 'Fremdwährung, bitte manuell prüfen'
                      : t.bankStatus === 'pending'
                        ? 'Vorgemerkten Bankumsatz prüfen'
                        : 'Bankumsatz prüfen',
                    detail:
                      acct.name +
                      ' · ' +
                      t.date +
                      ' · ' +
                      (foreign
                        ? (t.amountCents / 100).toFixed(2).replace('.', ',') + ' ' + t.currency
                        : formatEuro(cents(t.amountCents))) +
                      ' · ' +
                      t.memo,
                    // A foreign-currency line is never posted; the generic view has no confirm action.
                    refType: foreign ? 'bank-sync' : 'bank-sync-candidate',
                    refId: foreign ? a.accountId! : id,
                    ...(foreign ? { urgent: true } : {}),
                  },
                  ctx,
                );
                if (!foreign) toPost.push(id);
              }
              // Lines left open by an earlier fetch are matched again, not only the freshly fetched.
              for (const open of tx
                .select({ id: candidate.id })
                .from(candidate)
                .innerJoin(inboxItem, eq(inboxItem.id, candidate.id))
                .where(
                  and(
                    eq(candidate.accountId, a.accountId!),
                    eq(candidate.bankStatus, 'booked'),
                    eq(candidate.currency, acct.currency),
                    eq(inboxItem.refType, 'bank-sync-candidate'),
                    isNull(inboxItem.resolvedAt),
                  ),
                )
                .all())
                toPost.push(open.id);
              this.postBooked(tx, toPost, row.id);
              if (batch.skippedInvalid || batch.skippedOutOfWindow)
                this.warning(
                  tx,
                  'bank-skipped:' + a.id,
                  'other',
                  'Bankumsätze übersprungen',
                  'Ungültige Zeilen: ' +
                    batch.skippedInvalid +
                    '; außerhalb des Zeitraums: ' +
                    batch.skippedOutOfWindow +
                    '. Datenquelle prüfen.',
                  a.accountId!,
                  true,
                );
              if (balance && !balance.date)
                this.warning(
                  tx,
                  'bank-balance-date:' + a.accountId!,
                  'other',
                  'Bankstand ohne Stichtag',
                  'Bankumsätze gespeichert. Saldenvergleich ohne Stichtag nicht möglich.',
                  a.accountId!,
                  true,
                );
              if (!balance)
                this.warning(
                  tx,
                  'bank-balance-currency:' + a.accountId!,
                  'other',
                  'Bankstand nicht in Kontowährung',
                  'Die Bank meldet keinen Saldo in ' +
                    acct.currency +
                    '. Bankumsätze gespeichert, Saldenvergleich nicht möglich.',
                  a.accountId!,
                  true,
                );
              const openCandidates = !balance
                ? undefined
                : tx
                    .select()
                    .from(candidate)
                    .innerJoin(inboxItem, eq(inboxItem.id, candidate.id))
                    .where(
                      and(
                        eq(candidate.accountId, a.accountId!),
                        eq(candidate.bankStatus, 'booked'),
                        // A foreign-currency line never enters this account's balance.
                        eq(candidate.currency, acct.currency),
                        isNull(inboxItem.resolvedAt),
                      ),
                    )
                    .get();
              const warningId = 'bank-balance:' + a.accountId!;
              // Provider BOOK is cleared at the bank even while the owner's booking is unchecked.
              const uncheckedBooked = balance?.date
                ? tx
                    .select({ amount: booking.amountCents })
                    .from(booking)
                    .innerJoin(
                      candidate,
                      and(
                        eq(candidate.accountId, booking.accountId),
                        sql`${booking.importKey} = 'bank-sync:' || ${candidate.dedupeKey}`,
                      ),
                    )
                    .where(
                      and(
                        eq(booking.accountId, a.accountId!),
                        eq(booking.status, 'pending'),
                        eq(candidate.bankStatus, 'booked'),
                        isNull(booking.deletedAt),
                        gte(booking.date, acct.openingDate),
                        lte(booking.date, balance.date!),
                      ),
                    )
                    .all()
                    .reduce((sum, b) => sum + b.amount, 0)
                : 0;
              const difference = balance?.date
                ? balance.amountCents -
                  bookedBalance(tx, a.accountId!, balance.date) -
                  uncheckedBooked
                : 0;
              if (balance?.date && !openCandidates && difference)
                this.warning(
                  tx,
                  warningId,
                  'reconciliation',
                  'Bankstand weicht ab',
                  acct.name +
                    ' · ' +
                    balance.date +
                    ' · Differenz ' +
                    formatEuro(cents(difference)) +
                    '. Kontostand prüfen.',
                  a.accountId!,
                  true,
                );
              else {
                const item = tx.select().from(inboxItem).where(eq(inboxItem.id, warningId)).get();
                if (item && !item.resolvedAt)
                  updateTracked(
                    tx,
                    inboxItem,
                    [warningId],
                    {
                      resolvedAt: this.clock().toISOString(),
                      resolution: 'Bankprüfung derzeit nicht erforderlich.',
                    },
                    ctx,
                  );
              }
              updateTracked(
                tx,
                link,
                [a.id],
                {
                  lastSyncAt: this.clock().toISOString(),
                  secret: this.box.seal(uid, a.id),
                  balanceCents: balance?.amountCents ?? null,
                  balanceDate: balance?.date ?? null,
                  balanceFetchedAt: this.clock().toISOString(),
                },
                ctx,
              );
            });
          } catch (error) {
            failures.push(error);
            const code = error instanceof BankError ? error.code : 'unavailable';
            this.warning(
              this.db,
              'bank-error:' + a.id + ':' + code,
              'other',
              'Bankabruf fehlgeschlagen',
              this.errorDetail(code, error instanceof BankError ? error.detail : undefined),
              a.accountId,
              true,
            );
          }
        }
        if (failures.length) {
          const error = failures.sort(
            (a, b) =>
              (b instanceof BankError ? b.retrySeconds : 900) -
              (a instanceof BankError ? a.retrySeconds : 900),
          )[0];
          this.failure(row.id, error, false);
          continue;
        }
        updateTracked(
          this.db,
          consent,
          [row.id],
          {
            status: 'active',
            secret: this.box.seal(this.box.open(row.secret!, row.id), row.id),
            failures: 0,
            lastSuccessAt: this.clock().toISOString(),
            nextRunAt: nextBankRun(this.clock()),
            leaseUntil: null,
          },
          withGroup(system),
        );
      } catch (error) {
        this.failure(row.id, error);
      } finally {
        clearInterval(heartbeat);
      }
    }
  }

  confirm(
    id: string,
    categoryId: string | null,
    options: {
      payeeId?: string | null | undefined;
      ruleId?: string | undefined;
      revision?: string | undefined;
      candidateRevision?: string | undefined;
      actions?: AssignmentActions | undefined;
    } = {},
  ) {
    return this.db.transaction((tx) => {
      const row = tx.select().from(candidate).where(eq(candidate.id, id)).get();
      const item = tx.select().from(inboxItem).where(eq(inboxItem.id, id)).get();
      if (!row || !item) throw new EntityNotFoundError('bank_sync_candidate', id);
      if (item.resolvedAt) throw new ConflictError('Dieser Bankumsatz wurde bereits bearbeitet.');
      const acct = tx.select().from(account).where(eq(account.id, row.accountId)).get();
      if (!acct || acct.deletedAt || acct.closedAt || acct.currency !== row.currency)
        throw new ConflictError('Konto nicht verfügbar.');
      const ctx = withGroup({ actor: 'owner' });
      const review = readAssignmentCandidate(tx, id);
      if (
        options.candidateRevision !== undefined &&
        options.candidateRevision !== review.candidateRevision
      )
        throw new ConflictError('Der Bankumsatz hat sich geändert. Bitte neu laden.');
      if (review.existingTransfer) {
        const bookingId = review.existingTransfer.bookingId;
        updateTracked(
          tx,
          booking,
          [bookingId],
          {
            bankRawText: row.memo,
            bankRawPayee: row.rawPayee,
            bankSourceId: row.sourceId,
            importKey: 'bank-sync:' + row.dedupeKey,
          },
          ctx,
        );
        updateTracked(
          tx,
          inboxItem,
          [id],
          { resolvedAt: this.clock().toISOString(), resolution: 'Bestätigt: ' + bookingId },
          ctx,
        );
        return { bookingId, groupId: ctx.groupId };
      }
      const rule = options.ruleId
        ? review.suggestions.find((r) => r.id === options.ruleId)
        : !options.actions &&
            options.payeeId === undefined &&
            categoryId === null &&
            review.suggestions[0]?.automatic
          ? review.suggestions[0]
          : undefined;
      if (
        rule?.unavailable ||
        (options.ruleId &&
          (!rule || (options.revision !== undefined && options.revision !== rule.revision)))
      )
        throw new ConflictError('Regelvorschlag hat sich geändert. Bitte neu prüfen.');
      const actions = assignmentActionsSchema.parse(
        options.actions ??
          rule?.actions ?? {
            categoryId,
            payeeId: options.payeeId === undefined ? review.cleanup.payeeId : options.payeeId,
          },
      );
      const patch = assignmentPatch(row.amountCents, actions);
      if (actions.accountId && actions.accountId !== row.accountId)
        throw new ConflictError('Das Bankkonto bleibt an seine Datenquelle gebunden.');
      // A transfer is attached after creation so both candidate and booking paths use one invariant.
      const lines = patch.splits?.map(({ transferAccountId, ...s }) => {
        void transferAccountId;
        return s;
      }) ?? [{ amountCents: row.amountCents, categoryId }];
      const importKey = 'bank-sync:' + row.dedupeKey;
      const existing = tx
        .select()
        .from(booking)
        .where(and(eq(booking.accountId, row.accountId), eq(booking.importKey, importKey)))
        .get();
      let bookingId = existing?.id;
      if (existing?.deletedAt) {
        if (existing.transferId)
          updateTracked(tx, booking, [existing.id], { transferId: null }, ctx);
        // Undo of a creation removes its splits. Re-confirmation recreates them in this savepoint.
        const splits = tx
          .select()
          .from(schema.bookingSplit)
          .where(eq(schema.bookingSplit.bookingId, existing.id))
          .all();
        if (splits.length === 0)
          insertTracked(
            tx,
            schema.bookingSplit,
            {
              id: randomUUID(),
              bookingId: existing.id,
              amountCents: existing.amountCents,
              categoryId: actions.categoryId ?? null,
            },
            ctx,
          );
        restoreBooking(tx, existing.id, ctx);
        updateBooking(
          tx,
          existing.id,
          {
            ...patch,
            date: row.date,
            amountCents: row.amountCents,
            status: 'confirmed',
            incomeNextMonth: bookingIncomeDefault(tx, {
              amountCents: row.amountCents,
              payeeId: patch.payeeId === undefined ? review.cleanup.payeeId : patch.payeeId,
              splits: patch.splits ?? lines,
            }),
            bankRawText: row.memo,
            bankRawPayee: row.rawPayee,
            bankSourceId: row.sourceId,
            splits: lines,
          },
          ctx,
        );
      }
      if (!bookingId)
        bookingId = createBooking(
          tx,
          {
            accountId: row.accountId,
            date: row.date,
            amountCents: row.amountCents,
            currency: row.currency,
            memo: patch.memo ?? row.memo,
            payeeId: patch.payeeId === undefined ? review.cleanup.payeeId : patch.payeeId,
            flag: patch.flag ?? null,
            bankRawText: row.memo,
            bankRawPayee: row.rawPayee,
            bankSourceId: row.sourceId,
            source: 'bank',
            importKey,
            status: 'confirmed',
            incomeNextMonth: bookingIncomeDefault(tx, {
              amountCents: row.amountCents,
              payeeId: patch.payeeId === undefined ? review.cleanup.payeeId : patch.payeeId,
              splits: patch.splits ?? lines,
            }),
            splits: lines,
          },
          ctx,
        );
      if (actions.payeeId)
        learnBankPayee(tx, row.sourceId ?? '', row.rawPayee || row.memo, actions.payeeId, ctx);
      if (actions.transferAccountId)
        markBankBookingTransfer(
          tx,
          bookingId,
          actions.transferAccountId,
          actions.categoryId ?? null,
          ctx,
        );
      learnInboxAssignment(tx, bookingId, ctx);
      updateTracked(
        tx,
        inboxItem,
        [id],
        { resolvedAt: this.clock().toISOString(), resolution: 'Bestätigt: ' + bookingId },
        ctx,
      );
      return { groupId: ctx.groupId, bookingId };
    });
  }
}
