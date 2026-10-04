import {
  isPlausibleBirthDate,
  PROFILE_HOUSEHOLD_MAX,
  PROFILE_INITIALS_MAX,
  PROFILE_NAME_MAX,
  REGIONS,
  sourceMappingSchema,
  type Profile,
  type RegionCode,
} from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { and, asc, eq, isNull, lt } from 'drizzle-orm';
import {
  account,
  appSetting,
  assetClass,
  booking,
  bookingSplit,
  category,
  categoryGroup,
  contact,
  EXPECTED_KINDS,
  expectedOccurrence,
  expectedPayment,
  incomeType,
  RHYTHMS,
  rule,
  security,
  SECURITY_KINDS,
} from '../schema';
import { type AuditContext, type GroupedContext } from './audit';
import { saveBookSettings } from './book-settings';
import { getBooking, updateBooking } from './bookings';
import { updateCategory } from './categories';
import { getEntity } from './entities';
import { ConflictError, EntityNotFoundError } from './errors';
import {
  addExpectedVersion,
  createExpectedPayment,
  listExpectedVersions,
  markOccurrenceMissed,
  updateExpectedPayment,
} from './expected';
import { OperatorInputError, resolveCategoryNames } from './operator-ops';
import { getProfile, ProfileValidationError, saveProfile } from './profile';
import { updateRule } from './rules';
import { mapReadSource, readSourceMappings } from './read-source';
import { createSecurity, updateAssetClass, updateSecurity } from './securities';
import { runInTransaction, type Executor } from './types';

/**
 * Operator owner configuration (`migrate-cli.js owner-config`): the owner's private settings that
 * do not belong in the repo, loaded from one JSON file. Nothing here writes on its own: every
 * section calls the function behind the matching app route (`saveProfile`, `updateRule`,
 * `updateCategory`, `createExpectedPayment` / `updateExpectedPayment` / `addExpectedVersion`,
 * `markOccurrenceMissed`, `updateBooking`, `createSecurity`, `mapReadSource`, `updateSecurity`,
 * `updateAssetClass`), so validation and audit match the UI path. One audit group per run (actor
 * `operator`), each entry in its own savepoint, so Rückgängig or `undo-group` reverts the whole
 * run. An entry the app would refuse is skipped with a reason code, the rest goes through.
 * Running a file twice reports everything as `unchanged`.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const fold = (name: string) => name.trim().toLocaleLowerCase('de-AT');

/** Thrown inside the transaction to roll a dry run back; never leaves this module. */
class DryRunRollback extends Error {}

/** Thrown inside an entry's savepoint: the entry writes nothing and is reported as skipped. */
class EntrySkip extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export interface OwnerProfile {
  name?: string;
  initials?: string;
  birthDate?: string;
  region?: RegionCode;
  household?: number;
}
export interface OwnerRules {
  enable: string[];
  disable: string[];
}
export interface OwnerCategoryStage {
  category: string;
  stage: number | null;
}
export interface OwnerExpectedPayment {
  name: string;
  kind: (typeof EXPECTED_KINDS)[number];
  accountName: string;
  categoryName?: string;
  incomeType?: string;
  rhythm: (typeof RHYTHMS)[number];
  dueDay: number;
  dueMonth?: number;
  startDate: string;
  amountCents: number;
  /** First day the amount applies; default: `startDate` for a new payment, this month for a change. */
  validFrom?: string;
  note?: string;
}
export interface OwnerSkipOccurrence {
  name: string;
  month: string;
  reason: string;
}
export interface OwnerClearBookings {
  before: string;
  accounts?: string[];
}
export interface OwnerSecurity {
  isin?: string;
  name?: string;
  quoteUrl?: string | null;
  symbol?: string | null;
  quoteExchange?: string | null;
  coingeckoId?: string | null;
  pricesEnabled?: boolean;
}
export interface OwnerAssetClasses {
  rename: { from: string; to: string }[];
}
export interface OwnerConfig {
  createSecurities?: OwnerCreateSecurity[];
  cryptoMappings?: OwnerCryptoMapping[];
  splitCategories?: OwnerSplitCategory[];
  profile?: OwnerProfile;
  rules?: OwnerRules;
  categoryStages?: OwnerCategoryStage[];
  expectedPayments?: OwnerExpectedPayment[];
  skipOccurrences?: OwnerSkipOccurrence[];
  clearBookings?: OwnerClearBookings;
  securities?: OwnerSecurity[];
  assetClasses?: OwnerAssetClasses;
}

export interface OwnerCreateSecurity {
  name: string;
  kind: (typeof SECURITY_KINDS)[number];
  currency: string;
  assetClass?: string;
  isin?: string;
  symbol?: string;
  pricesEnabled: boolean;
}
export interface OwnerCryptoMapping {
  key: string;
  account: string;
  security?: string;
}
export interface OwnerSplitCategory {
  splitId: string;
  /** Exactly one of category / incomeType; an income type moves the split to income (no category). */
  category?: string;
  incomeType?: string;
  contact?: string | null;
  /** Explicit per-entry switch for a reconciled (geprüft, locked) booking, as in `book`. */
  unlock?: true;
}

export const OWNER_CONFIG_SECTIONS = [
  'createSecurities',
  'cryptoMappings',
  'splitCategories',
  'profile',
  'rules',
  'categoryStages',
  'assetClasses',
  'securities',
  'expectedPayments',
  'skipOccurrences',
  'clearBookings',
] as const;
export type OwnerConfigSection = (typeof OWNER_CONFIG_SECTIONS)[number];

export interface OwnerConfigOutcome {
  section: OwnerConfigSection;
  /** What the entry is about: the rule code, category, payment or account name ... */
  key: string;
  status: 'created' | 'updated' | 'unchanged' | 'skipped';
  /** The changes as `field old -> new` (or field names only for private values); the refusal for a skip. */
  detail: string;
  /** Stable reason code of a skip, empty otherwise. */
  reason: string;
  /** The run's audit group (empty for unchanged/skipped entries and in a dry run). */
  groupId: string;
}

export interface OwnerConfigSummary {
  section: OwnerConfigSection;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
}

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function strictObject(
  raw: unknown,
  at: string,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!isObject(raw)) throw new OperatorInputError(`${at} must be an object`);
  for (const key of Object.keys(raw))
    if (!allowed.includes(key))
      throw new OperatorInputError(`${at}: unknown key "${key}" (expected ${allowed.join(', ')})`);
  return raw;
}
function text(value: unknown, at: string, max = 200): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new OperatorInputError(`${at} must be a non-empty text`);
  if (value.length > max) throw new OperatorInputError(`${at} must be at most ${max} characters`);
  return value.trim();
}
function optionalText(value: unknown, at: string, max = 200): string | undefined {
  if (value === undefined) return undefined;
  return text(value, at, max);
}
function int(value: unknown, at: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new OperatorInputError(`${at} must be a whole number from ${min} to ${max}`);
  return value;
}
function day(value: unknown, at: string): string {
  if (
    typeof value !== 'string' ||
    !DAY.test(value) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new OperatorInputError(`${at} must be a valid day (YYYY-MM-DD)`);
  return value;
}
function list(value: unknown, at: string, max = 500): unknown[] {
  if (!Array.isArray(value)) throw new OperatorInputError(`${at} must be a list`);
  if (value.length > max) throw new OperatorInputError(`${at} holds more than ${max} entries`);
  return value;
}
function uniqueKeys(keys: string[], at: string): void {
  const seen = new Set<string>();
  for (const key of keys) {
    const folded = fold(key);
    if (seen.has(folded)) throw new OperatorInputError(`${at}: "${key}" is listed twice`);
    seen.add(folded);
  }
}

function parseProfile(raw: unknown, today: string): OwnerProfile {
  const o = strictObject(raw, 'profile', [
    'name',
    'initials',
    'birthDate',
    'country',
    'region',
    'householdSize',
    'household',
  ]);
  const out: OwnerProfile = {};
  if (o['name'] !== undefined) {
    const name = text(o['name'], 'profile.name', PROFILE_NAME_MAX);
    out.name = name;
  }
  if (o['initials'] !== undefined) {
    const initials = text(o['initials'], 'profile.initials', PROFILE_INITIALS_MAX * 2);
    out.initials = initials;
  }
  if (o['birthDate'] !== undefined) {
    const birthDate = day(o['birthDate'], 'profile.birthDate');
    if (!isPlausibleBirthDate(birthDate, today))
      throw new OperatorInputError('profile.birthDate must be a day in the past, not before 1900');
    out.birthDate = birthDate;
  }
  // The app is Austria-only: `country` may name Austria, the Bundesland goes in `region`.
  if (o['country'] !== undefined) {
    const country = fold(text(o['country'], 'profile.country'));
    if (!['at', 'aut', 'österreich', 'oesterreich', 'austria'].includes(country)) {
      const region = REGIONS.find(
        (r) => r.code.toLowerCase() === country || fold(r.name) === country,
      );
      if (!region)
        throw new OperatorInputError(
          'profile.country must be Austria (AT) or a Bundesland; the app compares with Statistik Austria',
        );
      out.region = region.code;
    }
  }
  if (o['region'] !== undefined) {
    const value = fold(text(o['region'], 'profile.region'));
    const region = REGIONS.find((r) => r.code.toLowerCase() === value || fold(r.name) === value);
    if (!region)
      throw new OperatorInputError(
        `profile.region must be a Bundesland (${REGIONS.map((r) => r.code).join(', ')} or its name)`,
      );
    out.region = region.code;
  }
  const size = o['householdSize'] ?? o['household'];
  if (o['householdSize'] !== undefined && o['household'] !== undefined)
    throw new OperatorInputError('profile: give householdSize or household, not both');
  if (size !== undefined)
    out.household = int(size, 'profile.householdSize', 1, PROFILE_HOUSEHOLD_MAX);
  return out;
}

function parseRules(raw: unknown): OwnerRules {
  const o = strictObject(raw, 'rules', ['enable', 'disable']);
  const codes = (key: 'enable' | 'disable'): string[] =>
    o[key] === undefined
      ? []
      : list(o[key], `rules.${key}`, 100).map((c, i) =>
          text(c, `rules.${key}[${i}]`, 20).toUpperCase(),
        );
  const enable = codes('enable');
  const disable = codes('disable');
  uniqueKeys([...enable, ...disable], 'rules');
  return { enable, disable };
}

function parseExpected(raw: unknown, i: number): OwnerExpectedPayment {
  const at = `expectedPayments[${i}]`;
  const o = strictObject(raw, at, [
    'name',
    'kind',
    'accountName',
    'categoryName',
    'incomeType',
    'rhythm',
    'dueDay',
    'dueMonth',
    'startDate',
    'amountCents',
    'validFrom',
    'note',
  ]);
  const kind = o['kind'];
  if (typeof kind !== 'string' || !(EXPECTED_KINDS as readonly string[]).includes(kind))
    throw new OperatorInputError(`${at}.kind must be one of ${EXPECTED_KINDS.join(', ')}`);
  const rhythm = o['rhythm'];
  if (typeof rhythm !== 'string' || !(RHYTHMS as readonly string[]).includes(rhythm))
    throw new OperatorInputError(`${at}.rhythm must be one of ${RHYTHMS.join(', ')}`);
  const out: OwnerExpectedPayment = {
    name: text(o['name'], `${at}.name`, 120),
    kind: kind as OwnerExpectedPayment['kind'],
    accountName: text(o['accountName'], `${at}.accountName`, 80),
    rhythm: rhythm as OwnerExpectedPayment['rhythm'],
    dueDay: int(o['dueDay'], `${at}.dueDay`, 1, 31),
    startDate: day(o['startDate'], `${at}.startDate`),
    amountCents: int(o['amountCents'], `${at}.amountCents`, 1, Number.MAX_SAFE_INTEGER),
  };
  const categoryName = optionalText(o['categoryName'], `${at}.categoryName`, 80);
  const incomeTypeName = optionalText(o['incomeType'], `${at}.incomeType`, 80);
  if (categoryName !== undefined && incomeTypeName !== undefined)
    throw new OperatorInputError(`${at}: give categoryName or incomeType, not both`);
  if (categoryName !== undefined) out.categoryName = categoryName;
  if (incomeTypeName !== undefined) out.incomeType = incomeTypeName;
  if (o['dueMonth'] !== undefined) out.dueMonth = int(o['dueMonth'], `${at}.dueMonth`, 1, 12);
  else if (out.rhythm !== 'monthly')
    throw new OperatorInputError(`${at}.dueMonth is needed for a ${out.rhythm} payment`);
  if (o['validFrom'] !== undefined) out.validFrom = day(o['validFrom'], `${at}.validFrom`);
  const note = optionalText(o['note'], `${at}.note`, 500);
  if (note !== undefined) out.note = note;
  return out;
}

/** Check a parsed `owner-config --file` JSON; throws `OperatorInputError` naming the entry. */
export function parseOwnerConfigFile(
  json: unknown,
  today: string = new Date().toISOString().slice(0, 10),
): OwnerConfig {
  const root = strictObject(json, 'The file', OWNER_CONFIG_SECTIONS);
  const config: OwnerConfig = {};
  if (root['createSecurities'] !== undefined) {
    config.createSecurities = list(root['createSecurities'], 'createSecurities').map((raw, i) => {
      const at = `createSecurities[${i}]`;
      const o = strictObject(raw, at, [
        'name',
        'kind',
        'currency',
        'assetClass',
        'isin',
        'symbol',
        'pricesEnabled',
      ]);
      const kind = o['kind'];
      if (typeof kind !== 'string' || !(SECURITY_KINDS as readonly string[]).includes(kind))
        throw new OperatorInputError(`${at}.kind must be one of ${SECURITY_KINDS.join(', ')}`);
      const currency = text(
        o['currency'] === undefined ? 'EUR' : o['currency'],
        `${at}.currency`,
        3,
      );
      if (!/^[A-Z]{3}$/.test(currency))
        throw new OperatorInputError(`${at}.currency must be a three-letter uppercase currency`);
      const out: OwnerCreateSecurity = {
        name: text(o['name'], `${at}.name`, 120),
        kind: kind as OwnerCreateSecurity['kind'],
        currency,
        pricesEnabled: false,
      };
      for (const key of ['assetClass', 'symbol', 'isin'] as const) {
        if (o[key] !== undefined)
          out[key] = text(o[key], `${at}.${key}`, key === 'isin' ? 12 : key === 'symbol' ? 40 : 80);
      }
      if (out.isin !== undefined) {
        out.isin = out.isin.toUpperCase();
        if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(out.isin))
          throw new OperatorInputError(`${at}.isin must be a 12 character ISIN`);
      }
      if (o['pricesEnabled'] !== undefined) {
        if (typeof o['pricesEnabled'] !== 'boolean')
          throw new OperatorInputError(`${at}.pricesEnabled must be true or false`);
        out.pricesEnabled = o['pricesEnabled'];
      }
      return out;
    });
    uniqueKeys(
      config.createSecurities.map((e) => e.isin ?? e.name),
      'createSecurities',
    );
  }
  if (root['cryptoMappings'] !== undefined) {
    config.cryptoMappings = list(root['cryptoMappings'], 'cryptoMappings').map((raw, i) => {
      const at = `cryptoMappings[${i}]`;
      const o = strictObject(raw, at, ['key', 'account', 'security']);
      const key = text(o['key'], `${at}.key`, 210);
      if (!/^(asset|currency):[^\s:]+$/.test(key))
        throw new OperatorInputError(
          `${at}.key must be asset:<providerId> or currency:<providerId>`,
        );
      const out: OwnerCryptoMapping = { key, account: text(o['account'], `${at}.account`, 80) };
      if (o['security'] !== undefined) out.security = text(o['security'], `${at}.security`, 120);
      if (key.startsWith('asset:') && out.security === undefined)
        throw new OperatorInputError(`${at}.security is required for an asset key`);
      if (key.startsWith('currency:') && out.security !== undefined)
        throw new OperatorInputError(`${at}.security must be omitted for a currency key`);
      return out;
    });
    uniqueKeys(
      config.cryptoMappings.map((e) => e.key),
      'cryptoMappings',
    );
  }
  if (root['splitCategories'] !== undefined) {
    config.splitCategories = list(root['splitCategories'], 'splitCategories').map((raw, i) => {
      const at = `splitCategories[${i}]`;
      const o = strictObject(raw, at, ['splitId', 'category', 'incomeType', 'contact', 'unlock']);
      const out: OwnerSplitCategory = { splitId: text(o['splitId'], `${at}.splitId`, 100) };
      if (o['incomeType'] !== undefined) {
        if (o['category'] !== undefined)
          throw new OperatorInputError(`${at}: give category or incomeType, not both`);
        out.incomeType = text(o['incomeType'], `${at}.incomeType`, 80);
      } else out.category = text(o['category'], `${at}.category`, 200);
      if (o['contact'] !== undefined)
        out.contact = o['contact'] === null ? null : text(o['contact'], `${at}.contact`, 120);
      if (o['unlock'] !== undefined && o['unlock'] !== false) {
        if (o['unlock'] !== true)
          throw new OperatorInputError(`${at}.unlock must be true or false`);
        out.unlock = true;
      }
      return out;
    });
    uniqueKeys(
      config.splitCategories.map((e) => e.splitId),
      'splitCategories',
    );
  }
  if (root['profile'] !== undefined) config.profile = parseProfile(root['profile'], today);
  if (root['rules'] !== undefined) config.rules = parseRules(root['rules']);
  if (root['categoryStages'] !== undefined) {
    config.categoryStages = list(root['categoryStages'], 'categoryStages').map((raw, i) => {
      const o = strictObject(raw, `categoryStages[${i}]`, ['category', 'stage']);
      const stage = o['stage'];
      return {
        category: text(o['category'], `categoryStages[${i}].category`, 80),
        stage: stage === null ? null : int(stage, `categoryStages[${i}].stage`, 1, 9),
      };
    });
    uniqueKeys(
      config.categoryStages.map((c) => c.category),
      'categoryStages',
    );
  }
  if (root['assetClasses'] !== undefined) {
    const o = strictObject(root['assetClasses'], 'assetClasses', ['rename']);
    config.assetClasses = {
      rename: list(o['rename'] ?? [], 'assetClasses.rename', 100).map((raw, i) => {
        const r = strictObject(raw, `assetClasses.rename[${i}]`, ['from', 'to']);
        return {
          from: text(r['from'], `assetClasses.rename[${i}].from`, 80),
          to: text(r['to'], `assetClasses.rename[${i}].to`, 80),
        };
      }),
    };
    uniqueKeys(
      config.assetClasses.rename.map((r) => r.from),
      'assetClasses.rename',
    );
  }
  if (root['securities'] !== undefined) {
    config.securities = list(root['securities'], 'securities').map((raw, i) => {
      const at = `securities[${i}]`;
      const o = strictObject(raw, at, [
        'isin',
        'name',
        'quoteUrl',
        'symbol',
        'quoteExchange',
        'coingeckoId',
        'pricesEnabled',
      ]);
      const out: OwnerSecurity = {};
      if (o['isin'] !== undefined) {
        const isin = text(o['isin'], `${at}.isin`, 12).toUpperCase();
        if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin))
          throw new OperatorInputError(`${at}.isin must be a 12 character ISIN`);
        out.isin = isin;
      }
      if (o['name'] !== undefined) out.name = text(o['name'], `${at}.name`, 120);
      if (out.isin === undefined && out.name === undefined)
        throw new OperatorInputError(`${at} needs an isin or a name`);
      if (o['quoteUrl'] !== undefined) {
        if (o['quoteUrl'] === null) out.quoteUrl = null;
        else {
          const url = text(o['quoteUrl'], `${at}.quoteUrl`, 500);
          let parsed: URL | null = null;
          try {
            parsed = new URL(url);
          } catch {
            parsed = null;
          }
          if (!parsed || parsed.protocol !== 'https:')
            throw new OperatorInputError(`${at}.quoteUrl must be an https URL`);
          out.quoteUrl = url;
        }
      }
      for (const key of ['symbol', 'quoteExchange'] as const)
        if (o[key] !== undefined)
          out[key] = o[key] === null ? null : text(o[key], `${at}.${key}`, 40);
      if (o['coingeckoId'] !== undefined) {
        if (o['coingeckoId'] === null) out.coingeckoId = null;
        else {
          const id = text(o['coingeckoId'], `${at}.coingeckoId`, 80);
          if (!/^[a-z0-9][a-z0-9\-_.]{0,80}$/.test(id))
            throw new OperatorInputError(`${at}.coingeckoId must be a CoinGecko coin id`);
          out.coingeckoId = id;
        }
      }
      if (o['pricesEnabled'] !== undefined) {
        if (typeof o['pricesEnabled'] !== 'boolean')
          throw new OperatorInputError(`${at}.pricesEnabled must be true or false`);
        out.pricesEnabled = o['pricesEnabled'];
      }
      if (Object.keys(out).every((k) => k === 'isin' || k === 'name'))
        throw new OperatorInputError(
          `${at} has nothing to set (quoteUrl, symbol, pricesEnabled ...)`,
        );
      return out;
    });
    uniqueKeys(
      config.securities.map((s) => s.isin ?? s.name!),
      'securities',
    );
  }
  if (root['expectedPayments'] !== undefined) {
    config.expectedPayments = list(root['expectedPayments'], 'expectedPayments').map(parseExpected);
    uniqueKeys(
      config.expectedPayments.map((p) => p.name),
      'expectedPayments',
    );
  }
  if (root['skipOccurrences'] !== undefined) {
    const seen = new Set<string>();
    config.skipOccurrences = list(root['skipOccurrences'], 'skipOccurrences').map((raw, i) => {
      const at = `skipOccurrences[${i}]`;
      const o = strictObject(raw, at, ['name', 'month', 'reason']);
      const month = o['month'];
      if (typeof month !== 'string' || !MONTH.test(month))
        throw new OperatorInputError(`${at}.month must be YYYY-MM`);
      const name = text(o['name'], `${at}.name`, 120);
      if (seen.has(`${fold(name)}|${month}`))
        throw new OperatorInputError(`${at}: occurrence is listed twice`);
      seen.add(`${fold(name)}|${month}`);
      return { name, month, reason: text(o['reason'], `${at}.reason`, 500) };
    });
  }
  if (root['clearBookings'] !== undefined) {
    const o = strictObject(root['clearBookings'], 'clearBookings', ['before', 'accounts']);
    const names =
      o['accounts'] === undefined
        ? undefined
        : list(o['accounts'], 'clearBookings.accounts', 200).map((n, i) =>
            text(n, `clearBookings.accounts[${i}]`, 80),
          );
    if (names) uniqueKeys(names, 'clearBookings.accounts');
    config.clearBookings = {
      before: day(o['before'], 'clearBookings.before'),
      ...(names && { accounts: names }),
    };
  }
  return config;
}

// ---------------------------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------------------------

type Step = { status: 'created' | 'updated' | 'unchanged'; detail: string };

interface Runner {
  tx: Executor;
  actor: string;
  today: string;
  groupId: string;
}

/** Run one entry in its own savepoint, within the run's audit group; refusals become a skip. */
function entry(
  r: Runner,
  section: OwnerConfigSection,
  key: string,
  body: (tx: Executor, ctx: GroupedContext) => Step,
): OwnerConfigOutcome {
  const ctx: GroupedContext = { actor: r.actor, groupId: r.groupId };
  try {
    const step = runInTransaction(r.tx, (inner) => body(inner, ctx));
    return {
      section,
      key,
      status: step.status,
      detail: step.detail,
      reason: '',
      groupId: step.status === 'unchanged' ? '' : ctx.groupId,
    };
  } catch (error) {
    const { reason, message } = refusal(error);
    return { section, key, status: 'skipped', detail: message, reason, groupId: '' };
  }
}

/** Any refusal of the domain rules becomes a skip with a stable reason code. */
function refusal(error: unknown): { reason: string; message: string } {
  const message = error instanceof Error ? error.message : 'failed';
  if (error instanceof EntrySkip) return { reason: error.reason, message };
  if (error instanceof ProfileValidationError) return { reason: 'invalid_profile', message };
  if (error instanceof ConflictError) return { reason: 'conflict', message };
  if (error instanceof EntityNotFoundError) return { reason: 'not_found', message };
  if (error instanceof RangeError) return { reason: 'refused_by_rules', message };
  return { reason: 'refused', message };
}

const done = (changes: string[], created = false): Step =>
  changes.length === 0
    ? { status: 'unchanged', detail: 'same values' }
    : { status: created ? 'created' : 'updated', detail: changes.join(', ') };

function liveAccountsByName(tx: Executor, name: string) {
  return tx
    .select({ id: account.id, name: account.name, closedAt: account.closedAt })
    .from(account)
    .where(isNull(account.deletedAt))
    .all()
    .filter((a) => fold(a.name) === fold(name));
}

function oneAccount(tx: Executor, name: string) {
  const found = liveAccountsByName(tx, name);
  if (found.length === 0) throw new EntrySkip('unknown_account', 'no live account has this name');
  if (found.length > 1)
    throw new EntrySkip('ambiguous_account', `${found.length} live accounts have this name`);
  return found[0]!;
}

function oneCategory(tx: Executor, name: string): string {
  const { ids, problems } = resolveCategoryNames(tx, [name]);
  if (problems.unknown.length)
    throw new EntrySkip('unknown_category', 'no live category has this name');
  if (problems.ambiguous.length)
    throw new EntrySkip('ambiguous_category', 'several live categories have this name');
  return ids.get(fold(name))!;
}

function oneExpectedPayment(tx: Executor, name: string) {
  const found = tx
    .select()
    .from(expectedPayment)
    .where(isNull(expectedPayment.deletedAt))
    .all()
    .filter((p) => fold(p.name) === fold(name));
  if (found.length > 1)
    throw new EntrySkip('ambiguous_payment', `${found.length} expected payments have this name`);
  return found[0] ?? null;
}

// --- new securities, source mappings and split categories --------------------------------------

function applyCreateSecurity(tx: Executor, e: OwnerCreateSecurity, ctx: GroupedContext): Step {
  const found = tx
    .select()
    .from(security)
    .where(isNull(security.deletedAt))
    .all()
    .filter((s) => (e.isin !== undefined ? s.isin === e.isin : fold(s.name) === fold(e.name)));
  if (found.length > 1)
    throw new EntrySkip('ambiguous_security', 'several live securities have this identity');
  if (found[0]) {
    if (found[0].kind !== e.kind || found[0].currency !== e.currency)
      throw new EntrySkip('conflicting', 'existing security has a different kind or currency');
    return done([]);
  }
  let assetClassId: string | undefined;
  if (e.assetClass !== undefined) {
    const classes = tx
      .select()
      .from(assetClass)
      .where(isNull(assetClass.deletedAt))
      .all()
      .filter((c) => c.name === e.assetClass);
    if (!classes.length)
      throw new EntrySkip('unknown_asset_class', 'no live asset class has this exact name');
    if (classes.length > 1)
      throw new EntrySkip(
        'ambiguous_asset_class',
        'several live asset classes have this exact name',
      );
    assetClassId = classes[0]!.id;
  }
  createSecurity(
    tx,
    {
      name: e.name,
      kind: e.kind,
      currency: e.currency,
      pricesEnabled: e.pricesEnabled,
      ...(e.isin !== undefined && { isin: e.isin }),
      ...(e.symbol !== undefined && { symbol: e.symbol }),
      ...(assetClassId !== undefined && { assetClassId }),
    },
    ctx,
  );
  return done(
    [
      `security created: kind ${e.kind}, currency ${e.currency}, assetClass ${e.assetClass ?? 'none'}, symbol ${e.symbol ?? 'none'}, pricesEnabled ${e.pricesEnabled}`,
    ],
    true,
  );
}

function applyCryptoMapping(tx: Executor, e: OwnerCryptoMapping, ctx: GroupedContext): Step {
  const accounts = tx
    .select()
    .from(account)
    .where(isNull(account.deletedAt))
    .all()
    .filter((a) => a.name === e.account);
  if (!accounts.length)
    throw new EntrySkip('unknown_account', 'no live account has this exact name');
  if (accounts.length > 1)
    throw new EntrySkip('ambiguous_account', 'several live accounts have this exact name');
  let securityId: string | null = null;
  if (e.security !== undefined) {
    const securities = tx
      .select()
      .from(security)
      .where(isNull(security.deletedAt))
      .all()
      .filter((s) => s.isin === e.security!.toUpperCase() || s.name === e.security);
    if (!securities.length)
      throw new EntrySkip('unknown_security', 'no live security has this ISIN or exact name');
    if (securities.length > 1)
      throw new EntrySkip(
        'ambiguous_security',
        'several live securities have this ISIN or exact name',
      );
    securityId = securities[0]!.id;
  }
  const mapping = sourceMappingSchema.parse({ key: e.key, accountId: accounts[0]!.id, securityId });
  const previous = readSourceMappings(tx).find((m) => m.key === e.key);
  if (previous && isDeepStrictEqual(previous, mapping)) return done([]);
  mapReadSource(tx, mapping, ctx, { allowUnseen: true });
  return done([
    `${previous ? 'mapping replaced' : 'mapping added'}: account ${e.account}, security ${e.security ?? 'cash'}`,
  ]);
}

function applySplitCategory(tx: Executor, e: OwnerSplitCategory, ctx: GroupedContext): Step {
  const split = tx.select().from(bookingSplit).where(eq(bookingSplit.id, e.splitId)).get();
  const current = split && getBooking(tx, split.bookingId);
  if (!split || !current) throw new EntrySkip('unknown_split', 'no live booking split has this id');
  if (current.transferId !== null || current.splits.some((s) => s.transferId !== null))
    throw new EntrySkip('transfer_leg', 'transfer bookings keep their categorisation');
  let categoryId: string | null = null;
  let incomeTypeId = split.incomeTypeId;
  if (e.incomeType !== undefined) {
    const found = tx
      .select()
      .from(incomeType)
      .where(isNull(incomeType.deletedAt))
      .all()
      .filter((t) => t.name === e.incomeType);
    if (found.length !== 1)
      throw new EntrySkip(
        found.length === 0 ? 'unknown_income_type' : 'ambiguous_income_type',
        'no unique live income type has this exact name',
      );
    incomeTypeId = found[0]!.id;
  } else {
    const categories = tx
      .select({ id: category.id, name: category.name, group: categoryGroup.name })
      .from(category)
      .leftJoin(
        categoryGroup,
        and(eq(category.groupId, categoryGroup.id), isNull(categoryGroup.deletedAt)),
      )
      .where(isNull(category.deletedAt))
      .all()
      .filter((c) => c.name === e.category || `${c.group} › ${c.name}` === e.category);
    if (!categories.length)
      throw new EntrySkip('unknown_category', 'no live category has this exact name');
    if (categories.length > 1)
      throw new EntrySkip('ambiguous_category', 'several live categories have this exact name');
    categoryId = categories[0]!.id;
  }
  let contactId = split.contactId;
  if (e.contact === null) contactId = null;
  else if (e.contact !== undefined) {
    const contacts = tx
      .select()
      .from(contact)
      .where(isNull(contact.deletedAt))
      .all()
      .filter((c) => c.name === e.contact);
    if (!contacts.length)
      throw new EntrySkip('unknown_contact', 'no live contact has this exact name');
    if (contacts.length > 1)
      throw new EntrySkip('ambiguous_contact', 'several live contacts have this exact name');
    contactId = contacts[0]!.id;
  }
  const changes = [
    ...(split.categoryId !== categoryId
      ? [`category ${split.categoryId ?? 'none'} -> ${categoryId}`]
      : []),
    ...(split.incomeTypeId !== incomeTypeId
      ? [`incomeType ${split.incomeTypeId ?? 'none'} -> ${incomeTypeId ?? 'none'}`]
      : []),
    ...(split.contactId !== contactId
      ? [`contact ${split.contactId ?? 'none'} -> ${contactId ?? 'none'}`]
      : []),
  ];
  if (incomeTypeId !== null && contactId !== null)
    throw new EntrySkip(
      'contact_with_income_type',
      'an income split has no contact; give contact: null',
    );
  if (!changes.length) return done([]);
  updateBooking(
    tx,
    current.id,
    {
      splits: current.splits.map((s) =>
        s.id === split.id ? { ...s, categoryId, incomeTypeId, contactId } : s,
      ),
    },
    ctx,
    { unlockReconciled: e.unlock === true },
  );
  const after = getBooking(tx, current.id)!;
  if (
    after.amountCents !== current.amountCents ||
    after.date !== current.date ||
    after.accountId !== current.accountId ||
    after.status !== current.status ||
    after.incomeNextMonth !== current.incomeNextMonth ||
    after.payeeId !== current.payeeId ||
    after.currency !== current.currency ||
    !isDeepStrictEqual(
      after.splits.map((s) => [s.id, s.amountCents]),
      current.splits.map((s) => [s.id, s.amountCents]),
    )
  )
    throw new EntrySkip('conflicting', 'split categorisation must keep amounts, date and account');
  return done(changes);
}

// --- profile ----------------------------------------------------------------------------------

function applyProfile(tx: Executor, p: OwnerProfile, ctx: GroupedContext, today: string): Step {
  const current = getProfile(tx);
  const patch: Partial<Profile> = {};
  const changes: string[] = [];
  // Personal values stay out of the output: only the field names are listed.
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    if (current[key] !== value) {
      patch[key] = value;
      changes.push(key);
    }
  };
  if (p.name !== undefined) set('name', p.name);
  if (p.initials !== undefined) set('initials', p.initials.toLocaleUpperCase('de-AT'));
  if (p.birthDate !== undefined) set('birthDate', p.birthDate);
  if (p.region !== undefined) set('region', p.region);
  if (p.household !== undefined) set('household', p.household);
  // profile.birth_month (rules book inputs) follows the birth date.
  const storedMonth = getEntity(tx, appSetting, 'profile.birth_month')?.value;
  const month = p.birthDate?.slice(0, 7);
  if (Object.keys(patch).length > 0) saveProfile(tx, patch, ctx, today);
  if (month !== undefined && storedMonth !== month) {
    saveBookSettings(tx, { birthMonth: month }, ctx, today);
    changes.push('birthMonth');
  }
  return done(changes);
}

// --- rules ------------------------------------------------------------------------------------

function applyRule(tx: Executor, code: string, enabled: boolean, ctx: GroupedContext): Step {
  const row = tx
    .select()
    .from(rule)
    .where(and(eq(rule.code, code), isNull(rule.deletedAt)))
    .get();
  if (!row) throw new EntrySkip('unknown_rule', 'no rule with this code');
  if (row.enabled === enabled) return done([]);
  updateRule(tx, code, { enabled }, ctx);
  return done([`enabled ${row.enabled} -> ${enabled}`]);
}

// --- category stages --------------------------------------------------------------------------

function applyStage(tx: Executor, e: OwnerCategoryStage, ctx: GroupedContext): Step {
  const id = oneCategory(tx, e.category);
  const current = tx.select().from(category).where(eq(category.id, id)).get();
  if ((current?.stage ?? null) === e.stage) return done([]);
  updateCategory(tx, id, { stage: e.stage }, ctx);
  return done([`stage ${current?.stage ?? 'none'} -> ${e.stage ?? 'none'}`]);
}

// --- asset classes ----------------------------------------------------------------------------

function applyRename(tx: Executor, e: { from: string; to: string }, ctx: GroupedContext): Step {
  const classes = tx.select().from(assetClass).where(isNull(assetClass.deletedAt)).all();
  const source = classes.filter((c) => c.name === e.from.trim() || fold(c.name) === fold(e.from));
  const target = classes.filter((c) => fold(c.name) === fold(e.to));
  if (source.length === 0) {
    // Already renamed in an earlier run.
    if (target.length === 1) return done([]);
    throw new EntrySkip('unknown_asset_class', 'no asset class has the old name');
  }
  if (source.length > 1)
    throw new EntrySkip('ambiguous_asset_class', 'several asset classes have the old name');
  const row = source[0]!;
  if (row.name === e.to) return done([]);
  if (target.some((c) => c.id !== row.id))
    throw new EntrySkip('name_taken', 'another asset class already has the new name');
  updateAssetClass(tx, row.id, { name: e.to }, ctx);
  return done([`name ${row.name} -> ${e.to}`]);
}

// --- securities -------------------------------------------------------------------------------

function applySecurity(tx: Executor, e: OwnerSecurity, ctx: GroupedContext): Step {
  const live = tx.select().from(security).where(isNull(security.deletedAt)).all();
  const found =
    e.isin !== undefined
      ? live.filter((s) => s.isin === e.isin)
      : live.filter((s) => fold(s.name) === fold(e.name!));
  const label = e.isin !== undefined ? 'ISIN' : 'name';
  if (found.length === 0)
    throw new EntrySkip('unknown_security', `no live security has this ${label}`);
  if (found.length > 1)
    throw new EntrySkip('ambiguous_security', `${found.length} live securities have this ${label}`);
  const row = found[0]!;
  const patch: Record<string, unknown> = {};
  const changes: string[] = [];
  for (const key of [
    'quoteUrl',
    'symbol',
    'quoteExchange',
    'coingeckoId',
    'pricesEnabled',
  ] as const) {
    const want = e[key];
    if (want !== undefined && want !== row[key]) {
      patch[key] = want;
      changes.push(key);
    }
  }
  if (changes.length === 0) return done([]);
  updateSecurity(tx, row.id, patch, ctx);
  return done(changes);
}

// --- expected payments ------------------------------------------------------------------------

function amountOn(versions: { validFrom: string; amountCents: number }[], date: string) {
  return [...versions]
    .filter((v) => v.validFrom <= date)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]?.amountCents;
}

function applyExpected(
  tx: Executor,
  e: OwnerExpectedPayment,
  ctx: GroupedContext,
  today: string,
): Step {
  const acct = oneAccount(tx, e.accountName);
  const categoryId = e.categoryName !== undefined ? oneCategory(tx, e.categoryName) : null;
  let incomeTypeId: string | null = null;
  if (e.incomeType !== undefined) {
    const found = tx
      .select()
      .from(incomeType)
      .where(isNull(incomeType.deletedAt))
      .orderBy(asc(incomeType.sortOrder))
      .all()
      .filter((t) => fold(t.name) === fold(e.incomeType!));
    if (found.length !== 1)
      throw new EntrySkip(
        found.length === 0 ? 'unknown_income_type' : 'ambiguous_income_type',
        `no unique income type "${e.incomeType}"`,
      );
    incomeTypeId = found[0]!.id;
  }
  const fields = {
    kind: e.kind,
    accountId: acct.id,
    categoryId,
    incomeTypeId,
    rhythm: e.rhythm,
    dueDay: e.dueDay,
    dueMonth: e.dueMonth ?? null,
    startDate: e.startDate,
    note: e.note ?? null,
  };
  const existing = oneExpectedPayment(tx, e.name);
  if (!existing) {
    createExpectedPayment(
      tx,
      { name: e.name, ...fields },
      { validFrom: e.validFrom ?? e.startDate, amountCents: e.amountCents },
      ctx,
      today,
    );
    return done(['payment', 'amount'], true);
  }
  const changes: string[] = [];
  const patch: Record<string, unknown> = {};
  for (const [key, want] of Object.entries(fields)) {
    // An omitted note leaves the stored one alone.
    if (key === 'note' && e.note === undefined) continue;
    if ((existing as Record<string, unknown>)[key] !== want) {
      patch[key] = want;
      changes.push(key);
    }
  }
  const versions = listExpectedVersions(tx, existing.id);
  const at = e.validFrom ?? `${today.slice(0, 7)}-01`;
  const effective = amountOn(versions, at);
  if (Object.keys(patch).length > 0) updateExpectedPayment(tx, existing.id, patch, ctx, today);
  if (effective !== e.amountCents) {
    addExpectedVersion(tx, existing.id, { validFrom: at, amountCents: e.amountCents }, ctx, today);
    changes.push(`amount from ${at}`);
  }
  return done(changes);
}

function applySkip(tx: Executor, e: OwnerSkipOccurrence, ctx: GroupedContext): Step {
  const payment = oneExpectedPayment(tx, e.name);
  if (!payment) throw new EntrySkip('unknown_payment', 'no live expected payment has this name');
  const rows = tx
    .select()
    .from(expectedOccurrence)
    .where(
      and(
        eq(expectedOccurrence.expectedPaymentId, payment.id),
        isNull(expectedOccurrence.deletedAt),
      ),
    )
    .all()
    .filter((o) => o.dueDate.startsWith(e.month));
  if (rows.length === 0)
    throw new EntrySkip('no_occurrence', 'the payment has no occurrence in this month');
  if (rows.length > 1)
    throw new EntrySkip('ambiguous_occurrence', 'several occurrences in this month');
  const occurrence = rows[0]!;
  if (occurrence.status === 'missed') return done([]);
  if (occurrence.bookingId !== null)
    throw new EntrySkip('linked_occurrence', 'the occurrence is linked to a booking');
  markOccurrenceMissed(tx, occurrence.id, ctx);
  return done([`status ${occurrence.status} -> missed`]);
}

// --- clear bookings ---------------------------------------------------------------------------

function applyClear(tx: Executor, acct: { id: string }, before: string, ctx: GroupedContext): Step {
  const ids = tx
    .select({ id: booking.id })
    .from(booking)
    .where(
      and(
        eq(booking.accountId, acct.id),
        eq(booking.status, 'pending'),
        lt(booking.date, before),
        isNull(booking.deletedAt),
      ),
    )
    .orderBy(asc(booking.date), asc(booking.id))
    .all();
  if (ids.length === 0) return done([]);
  for (const { id } of ids) updateBooking(tx, id, { status: 'confirmed' }, ctx);
  return {
    status: 'updated',
    detail: `${ids.length} booking${ids.length === 1 ? '' : 's'} confirmed`,
  };
}

/**
 * Apply new securities, crypto mappings and split categories before the existing sections.
 * Each entry runs in its own savepoint in one shared audit group (actor from `ctx`); a refusal writes
 * nothing and is reported as skipped. `dryRun` does all of it and rolls everything back, so it
 * reports exactly what the real run would change.
 */
export function applyOwnerConfig(
  db: Executor,
  config: OwnerConfig,
  ctx: Pick<AuditContext, 'actor'>,
  options: { dryRun?: boolean; today?: string } = {},
): OwnerConfigOutcome[] {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const outcomes: OwnerConfigOutcome[] = [];
  try {
    runInTransaction(db, (tx) => {
      const r: Runner = { tx, actor: ctx.actor, today, groupId: randomUUID() };
      const add = (o: OwnerConfigOutcome) => outcomes.push(o);
      for (const e of config.createSecurities ?? [])
        add(entry(r, 'createSecurities', e.isin ?? e.name, (t, c) => applyCreateSecurity(t, e, c)));
      for (const e of config.cryptoMappings ?? [])
        add(entry(r, 'cryptoMappings', e.key, (t, c) => applyCryptoMapping(t, e, c)));
      for (const e of config.splitCategories ?? [])
        add(entry(r, 'splitCategories', e.splitId, (t, c) => applySplitCategory(t, e, c)));
      if (config.profile)
        add(entry(r, 'profile', 'profile', (t, c) => applyProfile(t, config.profile!, c, today)));
      for (const code of config.rules?.enable ?? [])
        add(entry(r, 'rules', code, (t, c) => applyRule(t, code, true, c)));
      for (const code of config.rules?.disable ?? [])
        add(entry(r, 'rules', code, (t, c) => applyRule(t, code, false, c)));
      for (const e of config.categoryStages ?? [])
        add(entry(r, 'categoryStages', e.category, (t, c) => applyStage(t, e, c)));
      for (const e of config.assetClasses?.rename ?? [])
        add(entry(r, 'assetClasses', e.from, (t, c) => applyRename(t, e, c)));
      for (const e of config.securities ?? [])
        add(entry(r, 'securities', e.isin ?? e.name!, (t, c) => applySecurity(t, e, c)));
      for (const e of config.expectedPayments ?? [])
        add(entry(r, 'expectedPayments', e.name, (t, c) => applyExpected(t, e, c, today)));
      for (const e of config.skipOccurrences ?? [])
        add(entry(r, 'skipOccurrences', `${e.name} ${e.month}`, (t, c) => applySkip(t, e, c)));
      if (config.clearBookings) {
        const { before, accounts: names } = config.clearBookings;
        const targets = names
          ? names.map((name) => ({ key: name, name }))
          : tx
              .select({ name: account.name })
              .from(account)
              .where(and(isNull(account.deletedAt), isNull(account.closedAt)))
              .orderBy(asc(account.sortOrder), asc(account.name))
              .all()
              .map((a) => ({ key: a.name, name: a.name }));
        for (const target of targets)
          add(
            entry(r, 'clearBookings', target.key, (t, c) =>
              applyClear(t, oneAccount(t, target.name), before, c),
            ),
          );
      }
      if (options.dryRun) throw new DryRunRollback();
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
    return outcomes.map((o) => ({ ...o, groupId: '' }));
  }
  return outcomes;
}

export function summarizeOwnerConfig(outcomes: OwnerConfigOutcome[]): OwnerConfigSummary[] {
  return OWNER_CONFIG_SECTIONS.flatMap((section) => {
    const mine = outcomes.filter((o) => o.section === section);
    if (mine.length === 0) return [];
    const count = (status: OwnerConfigOutcome['status']) =>
      mine.filter((o) => o.status === status).length;
    return [
      {
        section,
        created: count('created'),
        updated: count('updated'),
        unchanged: count('unchanged'),
        skipped: count('skipped'),
      },
    ];
  });
}
