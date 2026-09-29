import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

/** HMAC-SHA-256 with the server pepper; `purpose` separates the uses of the one key. */
export const pepperedHex = (pepper: Buffer, purpose: string, value: string): string =>
  createHmac('sha256', pepper).update(`${purpose}:${value}`).digest('hex');

/** Random URL-safe token (session cookies): 32 bytes = 256 bits. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** Constant-time string comparison (hashes both sides so lengths do not leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Crockford base32 without I, L, O, U: readable when written down.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_CHARS = 16;

/**
 * One recovery code: 16 characters of 5 bits (80 bits) as `XXXX-XXXX-XXXX-XXXX`. `b % 32` is
 * unbiased because 256 is a multiple of 32.
 */
export function generateRecoveryCode(): string {
  let code = '';
  for (const b of randomBytes(CODE_CHARS)) code += ALPHABET[b % 32];
  return (code.match(/.{4}/g) as string[]).join('-');
}

/** Ten distinct recovery codes. */
export function generateRecoveryCodes(count = 10): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateRecoveryCode());
  return [...codes];
}

/** Normalise what a person types: case, dashes, spaces, and the look-alike letters of Crockford. */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/**
 * Stored form of a recovery code: HMAC-SHA-256 with the server pepper (`BUDGET_PEPPER`), so a
 * copy of the database alone does not allow an offline search over the codes.
 */
export const hashRecoveryCode = (pepper: Buffer, input: string): string =>
  pepperedHex(pepper, 'recovery', normalizeRecoveryCode(input));
