import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

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

/** One recovery code: 12 characters (60 bits) as `XXXX-XXXX-XXXX`. */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(12);
  let code = '';
  for (const b of bytes) code += ALPHABET[b % 32];
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
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

export const hashRecoveryCode = (input: string): string =>
  sha256Hex(`recovery:${normalizeRecoveryCode(input)}`);
