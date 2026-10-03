import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Separate owner-provided 32-byte key. Never derive encryption from the signing key or auth pepper. */
export function bankSecretBox(
  hex: string,
  version = '1',
  previousKeys: Record<string, string> = {},
) {
  if (Object.hasOwn(previousKeys, version))
    throw new Error('Bank key rotation requires a distinct version');
  const keys = new Map<string, Buffer>();
  for (const [id, value] of Object.entries({ ...previousKeys, [version]: hex })) {
    if (!/^[1-9]\d{0,3}$/.test(id) || !/^[a-f0-9]{64}$/i.test(value))
      throw new Error('Invalid bank encryption configuration');
    keys.set(id, Buffer.from(value, 'hex'));
  }
  const key = keys.get(version)!;
  return {
    seal(value: string, context: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(context));
      const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return (
        'v' + version + ':' + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
      );
    },
    open(value: string, context: string): string {
      // Unprefixed ciphertexts are legacy version 1, including historical audit snapshots.
      const match = /^v([1-9]\d{0,3}):(.*)$/.exec(value);
      const readKey = keys.get(match?.[1] ?? '1');
      if (!readKey || (value.includes(':') && !match)) throw new Error('Unknown bank key version');
      const raw = Buffer.from(match?.[2] ?? value, 'base64');
      const cipher = createDecipheriv('aes-256-gcm', readKey, raw.subarray(0, 12));
      cipher.setAAD(Buffer.from(context));
      cipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([cipher.update(raw.subarray(28)), cipher.final()]).toString('utf8');
    },
  };
}
