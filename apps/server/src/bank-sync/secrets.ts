import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Separate owner-provided 32-byte key. Never derive encryption from the signing key or auth pepper. */
export function bankSecretBox(hex: string) {
  if (!/^[a-f0-9]{64}$/i.test(hex))
    throw new Error('BANK_SYNC_ENCRYPTION_KEY must be 32 bytes in hex');
  const key = Buffer.from(hex, 'hex');
  return {
    seal(value: string, context: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(context));
      const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
    },
    open(value: string, context: string): string {
      const raw = Buffer.from(value, 'base64');
      const cipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      cipher.setAAD(Buffer.from(context));
      cipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([cipher.update(raw.subarray(28)), cipher.final()]).toString('utf8');
    },
  };
}
