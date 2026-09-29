import { schema, type Db } from '@budget/db';
import { and, count, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

const { passkey, authSession, recoveryCode, authChallenge, authEvent } = schema;

export type ChallengePurpose = (typeof schema.CHALLENGE_PURPOSES)[number];
export type AuthEventKind = (typeof schema.AUTH_EVENT_KINDS)[number];
export type PasskeyRow = typeof passkey.$inferSelect;
export type SessionRow = typeof authSession.$inferSelect;

const iso = (d: Date) => d.toISOString();
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

  touchSession(id: string, now: Date, expiresAt: Date): void {
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
  logEvent(
    kind: AuthEventKind,
    now: Date,
    extra: { passkeyId?: string | null; ipHash?: string | null; detail?: string } = {},
  ): void {
    this.db
      .insert(authEvent)
      .values({
        id: randomUUID(),
        ts: iso(now),
        kind,
        passkeyId: extra.passkeyId ?? null,
        ipHash: extra.ipHash ?? null,
        detail: extra.detail ?? null,
      })
      .run();
  }

  recentEvents(limit = 50) {
    return this.db.select().from(authEvent).orderBy(desc(authEvent.ts)).limit(limit).all();
  }
}
