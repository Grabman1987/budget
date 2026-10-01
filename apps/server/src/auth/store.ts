import { schema, writesHeld, type Db } from '@budget/db';
import { and, count, desc, eq, gt, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const { passkey, authSession, recoveryCode, authChallenge, authEvent } = schema;

export type ChallengePurpose = (typeof schema.CHALLENGE_PURPOSES)[number];
export type AuthEventKind = (typeof schema.AUTH_EVENT_KINDS)[number];
export type PasskeyRow = typeof passkey.$inferSelect;
export type SessionRow = typeof authSession.$inferSelect;

const iso = (d: Date) => d.toISOString();
/** Longest `auth_event.detail`; anything a client sends (e.g. an Origin header) is cut to this. */
export const DETAIL_MAX = 100;
const clip = (detail: string | undefined) =>
  // Control characters would only make the audit harder to read.
  // eslint-disable-next-line no-control-regex
  detail === undefined ? null : detail.replace(/[\u0000-\u001f\u007f]/g, '?').slice(0, DETAIL_MAX);
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms);

/** Database access of the auth module. Every function takes `now` so tests control the clock. */
export class AuthStore {
  constructor(private readonly db: Db) {}

  // ---------- passkeys ----------
  activePasskeyCount(): number {
    return (
      this.db.select({ n: count() }).from(passkey).where(isNull(passkey.revokedAt)).get()?.n ?? 0
    );
  }

  listPasskeys(): PasskeyRow[] {
    return this.db
      .select()
      .from(passkey)
      .where(isNull(passkey.revokedAt))
      .orderBy(passkey.createdAt)
      .all();
  }

  findActivePasskey(credentialId: string): PasskeyRow | undefined {
    return this.db
      .select()
      .from(passkey)
      .where(and(eq(passkey.credentialId, credentialId), isNull(passkey.revokedAt)))
      .get();
  }

  getPasskey(id: string): PasskeyRow | undefined {
    return this.db
      .select()
      .from(passkey)
      .where(and(eq(passkey.id, id), isNull(passkey.revokedAt)))
      .get();
  }

  insertPasskey(row: Omit<typeof passkey.$inferInsert, 'id'>): string {
    const id = randomUUID();
    this.db
      .insert(passkey)
      .values({ id, ...row })
      .run();
    return id;
  }

  touchPasskey(id: string, counter: number, now: Date): void {
    this.db
      .update(passkey)
      .set({ counter, lastUsedAt: iso(now) })
      .where(eq(passkey.id, id))
      .run();
  }

  revokePasskey(id: string, now: Date): void {
    this.db.transaction((tx) => {
      tx.update(passkey)
        .set({ revokedAt: iso(now) })
        .where(eq(passkey.id, id))
        .run();
      tx.update(authSession)
        .set({ revokedAt: iso(now) })
        .where(and(eq(authSession.passkeyId, id), isNull(authSession.revokedAt)))
        .run();
    });
  }

  // ---------- challenges ----------
  saveChallenge(
    challenge: string,
    purpose: ChallengePurpose,
    ttlMs: number,
    now: Date,
    sessionId?: string,
  ): void {
    this.db
      .insert(authChallenge)
      .values({
        id: randomUUID(),
        challenge,
        purpose,
        ...(sessionId ? { sessionId } : {}),
        createdAt: iso(now),
        expiresAt: iso(plus(now, ttlMs)),
      })
      .run();
    // Housekeeping: drop challenges that expired long ago.
    this.db
      .delete(authChallenge)
      .where(lt(authChallenge.expiresAt, iso(plus(now, -3_600_000))))
      .run();
  }

  /** Atomically mark a challenge as used. Null when unknown, expired, used, or of another purpose/session. */
  consumeChallenge(challenge: string, purposes: ChallengePurpose[], now: Date, sessionId?: string) {
    const rows = this.db
      .update(authChallenge)
      .set({ usedAt: iso(now) })
      .where(
        and(
          eq(authChallenge.challenge, challenge),
          isNull(authChallenge.usedAt),
          gt(authChallenge.expiresAt, iso(now)),
          sql`${authChallenge.purpose} IN (${sql.join(
            purposes.map((p) => sql`${p}`),
            sql`, `,
          )})`,
          sessionId ? eq(authChallenge.sessionId, sessionId) : isNull(authChallenge.sessionId),
        ),
      )
      .returning()
      .all();
    return rows[0];
  }

  // ---------- sessions ----------
  createSession(input: {
    id: string;
    passkeyId: string | null;
    now: Date;
    expiresAt: Date;
    stepUp: boolean;
    viaRecovery: boolean;
  }): void {
    this.db
      .insert(authSession)
      .values({
        id: input.id,
        passkeyId: input.passkeyId,
        createdAt: iso(input.now),
        lastSeenAt: iso(input.now),
        expiresAt: iso(input.expiresAt),
        stepUpAt: input.stepUp ? iso(input.now) : null,
        viaRecovery: input.viaRecovery,
      })
      .run();
  }

  /** A session that is neither revoked nor expired, and whose passkey (if any) is still active. */
  getSession(id: string, now: Date): SessionRow | undefined {
    const row = this.db
      .select()
      .from(authSession)
      .where(
        and(
          eq(authSession.id, id),
          isNull(authSession.revokedAt),
          gt(authSession.expiresAt, iso(now)),
        ),
      )
      .get();
    if (!row) return undefined;
    if (row.passkeyId && !this.getPasskey(row.passkeyId)) return undefined;
    return row;
  }

  /** An import task owns the write lock (`holdWrites`): best-effort writes wait. */
  get writesHeld(): boolean {
    return writesHeld(this.db);
  }

  /** Sliding expiry; skipped while an import task writes (the next request touches it). */
  touchSession(id: string, now: Date, expiresAt: Date): void {
    if (this.writesHeld) return;
    this.db
      .update(authSession)
      .set({ lastSeenAt: iso(now), expiresAt: iso(expiresAt) })
      .where(eq(authSession.id, id))
      .run();
  }

  setStepUp(id: string, now: Date): void {
    this.db
      .update(authSession)
      .set({ stepUpAt: iso(now) })
      .where(eq(authSession.id, id))
      .run();
  }

  revokeSession(id: string, now: Date): void {
    this.db
      .update(authSession)
      .set({ revokedAt: iso(now) })
      .where(eq(authSession.id, id))
      .run();
  }

  /** End every active session except `keepId`. Returns how many were ended. */
  revokeOtherSessions(keepId: string, now: Date): number {
    return this.db
      .update(authSession)
      .set({ revokedAt: iso(now) })
      .where(and(isNull(authSession.revokedAt), ne(authSession.id, keepId)))
      .run().changes;
  }

  /**
   * End every active session that was opened with a recovery code (they belong to no passkey, so
   * revoking a passkey does not reach them), except `keepId`.
   */
  revokeRecoverySessions(now: Date, keepId?: string): number {
    return this.db
      .update(authSession)
      .set({ revokedAt: iso(now) })
      .where(
        and(
          isNull(authSession.revokedAt),
          or(eq(authSession.viaRecovery, true), isNull(authSession.passkeyId)),
          keepId ? ne(authSession.id, keepId) : undefined,
        ),
      )
      .run().changes;
  }

  /** Sessions that are neither revoked nor expired. */
  activeSessionCount(now: Date): number {
    return (
      this.db
        .select({ n: count() })
        .from(authSession)
        .where(and(isNull(authSession.revokedAt), gt(authSession.expiresAt, iso(now))))
        .get()?.n ?? 0
    );
  }

  // ---------- recovery codes ----------
  /** Replace all recovery codes with a new batch (hashes only). */
  replaceRecoveryCodes(hashes: string[], now: Date): void {
    this.db.transaction((tx) => {
      tx.update(recoveryCode)
        .set({ revokedAt: iso(now) })
        .where(and(isNull(recoveryCode.usedAt), isNull(recoveryCode.revokedAt)))
        .run();
      for (const codeHash of hashes) {
        tx.insert(recoveryCode)
          .values({ id: randomUUID(), codeHash, createdAt: iso(now) })
          .run();
      }
    });
  }

  /** Use a code once. False when the hash is unknown, already used or replaced. */
  consumeRecoveryCode(codeHash: string, now: Date): boolean {
    const rows = this.db
      .update(recoveryCode)
      .set({ usedAt: iso(now) })
      .where(
        and(
          eq(recoveryCode.codeHash, codeHash),
          isNull(recoveryCode.usedAt),
          isNull(recoveryCode.revokedAt),
        ),
      )
      .returning({ id: recoveryCode.id })
      .all();
    return rows.length === 1;
  }

  recoveryCodesRemaining(): number {
    return (
      this.db
        .select({ n: count() })
        .from(recoveryCode)
        .where(and(isNull(recoveryCode.usedAt), isNull(recoveryCode.revokedAt)))
        .get()?.n ?? 0
    );
  }

  // ---------- events ----------
  /** Write one audit row and return its id. `detail` is cut to 100 characters. */
  logEvent(
    kind: AuthEventKind,
    now: Date,
    extra: { passkeyId?: string | null; ipHash?: string | null; detail?: string } = {},
  ): string {
    const id = randomUUID();
    this.db
      .insert(authEvent)
      .values({
        id,
        ts: iso(now),
        kind,
        passkeyId: extra.passkeyId ?? null,
        ipHash: extra.ipHash ?? null,
        detail: clip(extra.detail),
      })
      .run();
    return id;
  }

  /** Set the counter of a merged row (see `AuthEventLog`). */
  setEventCount(id: string, total: number, lastTs: Date): void {
    this.db
      .update(authEvent)
      .set({ count: total, lastTs: iso(lastTs) })
      .where(eq(authEvent.id, id))
      .run();
  }

  /** Delete audit rows older than `before`. Returns how many were deleted. */
  pruneEvents(before: Date): number {
    return this.db
      .delete(authEvent)
      .where(lt(authEvent.ts, iso(before)))
      .run().changes;
  }

  eventCount(): number {
    return this.db.select({ n: count() }).from(authEvent).get()?.n ?? 0;
  }

  recentEvents(limit = 50) {
    return this.db.select().from(authEvent).orderBy(desc(authEvent.ts)).limit(limit).all();
  }
}
