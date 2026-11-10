import {
  EMPTY_PROFILE,
  isPlausibleBirthDate,
  isRegionCode,
  isRiskAnswer,
  EMPTY_FAMILY,
  FAMILY_CHOICE_KEYS,
  FAMILY_COUNT_KEYS,
  isFamilyChoice,
  isFamilyConsistent,
  isFamilyCount,
  type FamilyCountKey,
  type FamilySituation,
  RISK_QUESTION_KEYS,
  EMPTY_RISK_ANSWERS,
  type RiskAnswers,
  PROFILE_HOUSEHOLD_MAX,
  PROFILE_INITIALS_MAX,
  PROFILE_NAME_MAX,
  type Profile,
} from '@budget/domain';
import { appSetting } from '../schema';
import { withGroup, type AuditContext } from './audit';
import { createEntity, getEntity, updateEntity } from './entities';
import { runInTransaction, type Executor } from './types';

const RISK_PREFIX = 'profile.risk.';
const FAMILY_PREFIX = 'profile.family.';
type Nested = 'risk' | 'family';
const KEY: Record<Exclude<keyof Profile, Nested>, string> = {
  name: 'profile.name',
  initials: 'profile.initials',
  birthDate: 'profile.birth_date',
  household: 'profile.household',
  region: 'profile.region',
};

export class ProfileValidationError extends Error {
  constructor(
    readonly field: keyof Profile | `risk.${string}` | `family.${string}`,
    message: string,
  ) {
    super(message);
  }
}

/** The stored profile; keys that were never saved fall back to the generic empty value. */
export function getProfile(db: Executor): Profile {
  const value = (key: keyof typeof KEY) => getEntity(db, appSetting, KEY[key])?.value;
  const household = Number(value('household'));
  const region = value('region');
  return {
    name: value('name') ?? EMPTY_PROFILE.name,
    initials: value('initials') ?? EMPTY_PROFILE.initials,
    birthDate: value('birthDate') ?? EMPTY_PROFILE.birthDate,
    household: Number.isInteger(household) && household > 0 ? household : null,
    region: isRegionCode(region) ? region : null,
    risk: getRisk(db),
    family: getFamily(db),
  };
}

/** Stored answers; unknown or invalid stored values read as "no answer". */
function getRisk(db: Executor): RiskAnswers {
  const risk: Record<string, string | null> = { ...EMPTY_RISK_ANSWERS };
  for (const key of RISK_QUESTION_KEYS) {
    const stored = getEntity(db, appSetting, RISK_PREFIX + key)?.value;
    risk[key] = stored !== undefined && isRiskAnswer(key, stored) ? stored : null;
  }
  return risk as unknown as RiskAnswers;
}

/** Stored family facts; invalid or contradictory stored values read as "not given". */
function getFamily(db: Executor): FamilySituation {
  const family: Record<string, string | number | null> = { ...EMPTY_FAMILY };
  for (const key of FAMILY_CHOICE_KEYS) {
    const stored = getEntity(db, appSetting, FAMILY_PREFIX + key)?.value;
    family[key] = stored !== undefined && isFamilyChoice(key, stored) ? stored : null;
  }
  for (const key of FAMILY_COUNT_KEYS) {
    family[key] = storedCount(db, key);
  }
  const typed = family as unknown as FamilySituation;
  return isFamilyConsistent(typed) ? typed : { ...typed, children: null };
}

const serialize = (
  key: keyof typeof KEY,
  patch: Partial<Omit<Profile, Nested>>,
  today: string,
): string => {
  switch (key) {
    case 'name': {
      const name = (patch.name ?? '').trim();
      if (name.length > PROFILE_NAME_MAX)
        throw new ProfileValidationError('name', `Name: höchstens ${PROFILE_NAME_MAX} Zeichen.`);
      return name;
    }
    case 'initials': {
      const initials = (patch.initials ?? '').trim().toLocaleUpperCase('de-AT');
      if ([...initials].length > PROFILE_INITIALS_MAX)
        throw new ProfileValidationError(
          'initials',
          `Kürzel: höchstens ${PROFILE_INITIALS_MAX} Zeichen.`,
        );
      return initials;
    }
    case 'birthDate': {
      const date = patch.birthDate ?? '';
      if (date !== '' && !isPlausibleBirthDate(date, today))
        throw new ProfileValidationError('birthDate', 'Geburtsdatum: bitte ein gültiges Datum.');
      return date;
    }
    case 'household': {
      const n = patch.household;
      if (n === null || n === undefined) return '';
      if (!Number.isInteger(n) || n < 1 || n > PROFILE_HOUSEHOLD_MAX)
        throw new ProfileValidationError(
          'household',
          `Haushalt: 1 bis ${PROFILE_HOUSEHOLD_MAX} Personen.`,
        );
      return String(n);
    }
    case 'region': {
      const r = patch.region;
      if (r === null || r === undefined) return '';
      if (!isRegionCode(r))
        throw new ProfileValidationError('region', 'Region: bitte ein Bundesland wählen.');
      return r;
    }
  }
};

/**
 * Save the given profile fields (audit `create`/`update` per changed key, one group so Rückgängig
 * reverts the whole save). Empty values are stored as empty strings: the key stays, the value
 * means "not given". Unchanged keys write nothing.
 */
export function saveProfile(
  db: Executor,
  patch: Partial<Omit<Profile, Nested>> & {
    risk?: Partial<RiskAnswers>;
    family?: Partial<FamilySituation>;
  },
  ctx: AuditContext,
  today: string,
): Profile {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const write = (id: string, value: string) => {
      const current = getEntity(tx, appSetting, id);
      if (!current) {
        if (value !== '') createEntity(tx, appSetting, { id, value }, grouped);
      } else if (current.value !== value) {
        updateEntity(tx, appSetting, id, { value }, grouped);
      }
    };
    for (const key of Object.keys(KEY) as (keyof typeof KEY)[]) {
      if (!(key in patch)) continue;
      write(KEY[key], serialize(key, patch, today));
    }
    // Risk answers may be patched per question; an omitted question stays as it is.
    for (const key of RISK_QUESTION_KEYS) {
      const answer = patch.risk?.[key];
      if (answer === undefined) continue;
      if (answer !== null && !isRiskAnswer(key, answer))
        throw new ProfileValidationError(`risk.${key}`, 'Risikoprofil: ungültige Antwort.');
      write(RISK_PREFIX + key, answer ?? '');
    }
    // Family facts are patched per field; an omitted field stays as it is, null clears it.
    for (const key of FAMILY_CHOICE_KEYS) {
      const answer = patch.family?.[key];
      if (answer === undefined) continue;
      if (answer !== null && !isFamilyChoice(key, answer))
        throw new ProfileValidationError(`family.${key}`, 'Familie: ungültige Angabe.');
      write(FAMILY_PREFIX + key, answer ?? '');
    }
    for (const key of FAMILY_COUNT_KEYS) {
      const count = patch.family?.[key];
      if (count === undefined) continue;
      if (count !== null && !isFamilyCount(count))
        throw new ProfileValidationError(`family.${key}`, 'Familie: ungültige Anzahl.');
      write(FAMILY_PREFIX + key, count === null ? '' : String(count));
    }
    if (
      patch.family &&
      !isFamilyConsistent({
        dependants: storedCount(tx, 'dependants'),
        children: storedCount(tx, 'children'),
      })
    )
      throw new ProfileValidationError(
        'family.children',
        'Familie: Kinder können nicht mehr sein als unterhaltsberechtigte Personen.',
      );
    return getProfile(tx);
  });
}

/** A stored count before the consistency fallback of `getFamily`. */
function storedCount(db: Executor, key: FamilyCountKey): number | null {
  const stored = getEntity(db, appSetting, FAMILY_PREFIX + key)?.value;
  const n = stored === undefined || stored === '' ? NaN : Number(stored);
  return isFamilyCount(n) ? n : null;
}
