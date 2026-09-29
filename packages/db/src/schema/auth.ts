import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { id, nowSql, oneOf } from './common';

export const CHALLENGE_PURPOSES = ['register_setup', 'register', 'login', 'step_up'] as const;
export const AUTH_EVENT_KINDS = [
  'setup_started',
  'passkey_registered',
  'passkey_revoked',
  'login_ok',
  'login_failed',
  'recovery_login_ok',
  'recovery_login_failed',
  'recovery_codes_created',
  'step_up_ok',
  'step_up_failed',
  'logout',
  'rate_limited',
  'origin_rejected',
] as const;

/** A registered WebAuthn credential (one row per device). Revoking sets `revoked_at`. */
export const passkey = sqliteTable(
  'passkey',
  {
    id: id(),
    /** WebAuthn credential id, base64url. */
    credentialId: text('credential_id').notNull().unique(),
    /** COSE public key bytes, base64url. */
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transportsJson: text('transports_json'),
    deviceType: text('device_type'),
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
    deviceName: text('device_name').notNull(),
    createdAt: text('created_at').notNull().default(nowSql),
    lastUsedAt: text('last_used_at'),
    revokedAt: text('revoked_at'),
  },
  (t) => [index('passkey_active_idx').on(t.revokedAt)],
);

/** Server-side session. `id` is the SHA-256 of the cookie token, the token itself is never stored. */
export const authSession = sqliteTable(
  'auth_session',
  {
    id: id(),
    /** Null for a session created with a recovery code. */
    passkeyId: text('passkey_id').references(() => passkey.id),
    createdAt: text('created_at').notNull().default(nowSql),
    lastSeenAt: text('last_seen_at').notNull().default(nowSql),
    expiresAt: text('expires_at').notNull(),
    /** Last strong re-authentication (step-up); sensitive actions need it to be recent. */
    stepUpAt: text('step_up_at'),
    viaRecovery: integer('via_recovery', { mode: 'boolean' }).notNull().default(false),
    revokedAt: text('revoked_at'),
  },
  (t) => [index('auth_session_expires_idx').on(t.expiresAt)],
);

/** One-time recovery codes: only the SHA-256 hash is stored. */
export const recoveryCode = sqliteTable('recovery_code', {
  id: id(),
  codeHash: text('code_hash').notNull().unique(),
  createdAt: text('created_at').notNull().default(nowSql),
  usedAt: text('used_at'),
  /** Set when a newer batch replaced this code. */
  revokedAt: text('revoked_at'),
});

/** WebAuthn challenge, single use and short lived. */
export const authChallenge = sqliteTable(
  'auth_challenge',
  {
    id: id(),
    challenge: text('challenge').notNull().unique(),
    purpose: text('purpose', { enum: CHALLENGE_PURPOSES }).notNull(),
    sessionId: text('session_id'),
    createdAt: text('created_at').notNull().default(nowSql),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
  },
  (t) => [oneOf('auth_challenge_purpose_chk', t.purpose, CHALLENGE_PURPOSES)],
);

/** Audit of authentication events. The client address is stored only as a truncated hash. */
export const authEvent = sqliteTable(
  'auth_event',
  {
    id: id(),
    ts: text('ts').notNull().default(nowSql),
    kind: text('kind', { enum: AUTH_EVENT_KINDS }).notNull(),
    passkeyId: text('passkey_id'),
    ipHash: text('ip_hash'),
    detail: text('detail'),
  },
  (t) => [
    oneOf('auth_event_kind_chk', t.kind, AUTH_EVENT_KINDS),
    index('auth_event_ts_idx').on(t.ts),
  ],
);
