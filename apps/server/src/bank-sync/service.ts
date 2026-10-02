import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';
import {
  bookedBalance,
  ConflictError,
  createBooking,
  EntityNotFoundError,
  insertTracked as insertUnwrapped,
  restoreBooking,
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
  cents,
  consentNeedsAttention,
  formatEuro,
  nextBankRun,
  todayInVienna,
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

  status() {
    const connections = this.db
      .select()
      .from(consent)
      .all()
      .filter((c) => c.status !== 'abandoned')
      .map((c) => ({
        id: c.id,
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
      if (
        Date.parse(session.validUntil) <= Date.parse(now) ||
        Date.parse(session.validUntil) > Date.parse(now) + 181 * 86400000
      )
        throw new BankError('invalid_response');
      this.db.transaction((tx) => {
        const ctx = withGroup({ actor: 'owner' });
        updateTracked(
          tx,
          consent,
          [row.id],
          {
            secret: this.box.seal(session.id, row.id),
            validUntil: session.validUntil,
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
      if (acct.deletedAt || acct.closedAt || acct.currency !== 'EUR' || row.currency !== 'EUR')
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
          this.errorDetail(code),
          id,
        );
    });
  }

  private errorDetail(code: string): string {
    if (code === 'auth_failed')
      return 'App-Anmeldung fehlgeschlagen. App-ID und Signierschlüssel prüfen.';
    if (code === 'history_unavailable')
      return 'Das Institut erlaubt den gewählten historischen Zeitraum nicht. Startdatum prüfen; gegebenenfalls pausieren und mit neuerem Startdatum verbinden.';
    if (code === 'request_limit')
      return 'Tageslimit für Bankabrufe erreicht oder Zeitraum benötigt mehr als drei Seiten. Nächsten Tag abwarten; beim ersten Abruf gegebenenfalls einen neueren Start wählen.';
    if (code === 'consent_expired')
      return 'Bankeinwilligung abgelaufen oder widerrufen. Bitte neu verbinden.';
    return 'Datenquelle prüfen. Fehlerklasse: ' + code;
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
            if (!acct || acct.deletedAt || acct.closedAt || acct.currency !== a.currency)
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
            const balance = await this.provider.balance(uid, () => this.reserveRequest(a.id));
            if (
              balance.currency !== a.currency ||
              (balance.date && balance.date > todayInVienna(now)) ||
              transactions.some((t) => t.currency !== a.currency)
            )
              throw new BankError('invalid_response');
            if (writesHeld(this.db)) throw new BankError('unavailable');
            const keys = bankTransactionKeys(transactions);
            this.db.transaction((tx) => {
              const ctx = withGroup(system);
              for (const [i, t] of transactions.entries()) {
                const dedupeKey = hash(keys[i]!);
                const existing = tx
                  .select()
                  .from(candidate)
                  .where(
                    and(eq(candidate.accountId, a.accountId!), eq(candidate.dedupeKey, dedupeKey)),
                  )
                  .get();
                if (existing) {
                  if (
                    existing.date !== t.date ||
                    existing.amountCents !== t.amountCents ||
                    existing.currency !== t.currency ||
                    existing.memo !== t.memo
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
                    date: t.date,
                    amountCents: t.amountCents,
                    currency: t.currency,
                    memo: t.memo,
                  },
                  ctx,
                );
                insertTracked(
                  tx,
                  inboxItem,
                  {
                    id,
                    kind: 'import',
                    title: 'Bankumsatz prüfen',
                    detail:
                      acct.name +
                      ' · ' +
                      t.date +
                      ' · ' +
                      formatEuro(cents(t.amountCents)) +
                      ' · ' +
                      t.memo,
                    refType: 'bank-sync-candidate',
                    refId: id,
                  },
                  ctx,
                );
              }
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
              if (!balance.date)
                this.warning(
                  tx,
                  'bank-balance-date:' + a.accountId!,
                  'other',
                  'Bankstand ohne Stichtag',
                  'Bankumsätze gespeichert. Saldenvergleich ohne Stichtag nicht möglich.',
                  a.accountId!,
                  true,
                );
              const openCandidates = tx
                .select()
                .from(candidate)
                .innerJoin(inboxItem, eq(inboxItem.id, candidate.id))
                .where(and(eq(candidate.accountId, a.accountId!), isNull(inboxItem.resolvedAt)))
                .get();
              const warningId = 'bank-balance:' + a.accountId!;
              const difference = balance.date
                ? balance.amountCents - bookedBalance(tx, a.accountId!, balance.date)
                : 0;
              if (balance.date && !openCandidates && difference)
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
                { lastSyncAt: this.clock().toISOString(), secret: this.box.seal(uid, a.id) },
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
              this.errorDetail(code),
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

  confirm(id: string, categoryId: string | null) {
    return this.db.transaction((tx) => {
      const row = tx.select().from(candidate).where(eq(candidate.id, id)).get();
      const item = tx.select().from(inboxItem).where(eq(inboxItem.id, id)).get();
      if (!row || !item) throw new EntityNotFoundError('bank_sync_candidate', id);
      if (item.resolvedAt) throw new ConflictError('Dieser Bankumsatz wurde bereits bearbeitet.');
      const acct = tx.select().from(account).where(eq(account.id, row.accountId)).get();
      if (!acct || acct.deletedAt || acct.closedAt || acct.currency !== row.currency)
        throw new ConflictError('Konto nicht verfügbar.');
      const ctx = withGroup({ actor: 'owner' });
      const importKey = 'bank-sync:' + row.dedupeKey;
      const existing = tx
        .select()
        .from(booking)
        .where(and(eq(booking.accountId, row.accountId), eq(booking.importKey, importKey)))
        .get();
      let bookingId = existing?.id;
      if (existing?.deletedAt) {
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
              categoryId,
            },
            ctx,
          );
        restoreBooking(tx, existing.id, ctx);
      }
      if (!bookingId)
        bookingId = createBooking(
          tx,
          {
            accountId: row.accountId,
            date: row.date,
            amountCents: row.amountCents,
            currency: row.currency,
            memo: row.memo,
            source: 'bank',
            importKey,
            status: 'confirmed',
            splits: [{ amountCents: row.amountCents, categoryId }],
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
      return { groupId: ctx.groupId, bookingId };
    });
  }
}
