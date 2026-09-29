import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

/**
 * A software WebAuthn authenticator for server tests: ES256 keys, `none` attestation, user
 * verification always on. It produces exactly the JSON a browser would send, so the real
 * SimpleWebAuthn verification runs in the tests.
 */

// --- minimal CBOR encoder (maps with integer/text keys, byte strings, integers, text) ---
function head(major: number, value: number): Buffer {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value < 256) return Buffer.from([(major << 5) | 24, value]);
  const b = Buffer.alloc(3);
  b[0] = (major << 5) | 25;
  b.writeUInt16BE(value, 1);
  return b;
}
type Cbor = number | string | Buffer | Map<number | string, Cbor>;
function cbor(value: Cbor): Buffer {
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === 'string')
    return Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value)]);
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  return Buffer.concat([
    head(5, value.size),
    ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)]),
  ]);
}

const b64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest();

export class SoftAuthenticator {
  readonly credentialId = randomBytes(32);
  private readonly privateKey: KeyObject;
  private readonly publicJwk: { x: string; y: string };
  counter = 0;

  constructor(private readonly options: { rpID: string; origin: string }) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = privateKey;
    this.publicJwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  }

  get id(): string {
    return b64(this.credentialId);
  }

  private clientData(type: string, challenge: string, origin = this.options.origin): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  /** Answer `navigator.credentials.create` for the given creation options. */
  register(options: { challenge: string }, overrides: { origin?: string } = {}) {
    const coseKey = new Map<number, Cbor>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(this.publicJwk.x, 'base64url')],
      [-3, Buffer.from(this.publicJwk.y, 'base64url')],
    ]);
    const credentialIdLength = Buffer.alloc(2);
    credentialIdLength.writeUInt16BE(this.credentialId.length);
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const authData = Buffer.concat([
      sha256(this.options.rpID),
      Buffer.from([0x45]), // user present + user verified + attested credential data
      counter,
      Buffer.alloc(16), // AAGUID
      credentialIdLength,
      this.credentialId,
      cbor(coseKey as unknown as Map<number | string, Cbor>),
    ]);
    const attestationObject = cbor(
      new Map<string, Cbor>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]) as Map<number | string, Cbor>,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64(
          this.clientData('webauthn.create', options.challenge, overrides.origin),
        ),
        attestationObject: b64(attestationObject),
        transports: ['internal'],
      },
      clientExtensionResults: {},
    };
  }

  /** Answer `navigator.credentials.get`; `signCount` defaults to an incremented counter. */
  authenticate(
    options: { challenge: string },
    overrides: { origin?: string; signCount?: number; userVerified?: boolean } = {},
  ) {
    this.counter = overrides.signCount ?? this.counter + 1;
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const authData = Buffer.concat([
      sha256(this.options.rpID),
      Buffer.from([overrides.userVerified === false ? 0x01 : 0x05]),
      counter,
    ]);
    const clientDataJSON = this.clientData('webauthn.get', options.challenge, overrides.origin);
    const signature = sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), {
      key: this.privateKey,
      dsaEncoding: 'der',
    });
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        authenticatorData: b64(authData),
        clientDataJSON: b64(clientDataJSON),
        signature: b64(signature),
        userHandle: b64(Buffer.from('budget-owner')),
      },
      clientExtensionResults: {},
    };
  }
}
