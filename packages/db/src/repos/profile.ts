import {
  EMPTY_PROFILE,
  isPlausibleBirthDate,
  isRegionCode,
  PROFILE_HOUSEHOLD_MAX,
  PROFILE_INITIALS_MAX,
  PROFILE_NAME_MAX,
  type Profile,
} from '@budget/domain';
import { appSetting } from '../schema';
import { withGroup, type AuditContext } from './audit';
import { createEntity, getEntity, updateEntity } from './entities';
import { runInTransaction, type Executor } from './types';

const KEY: Record<keyof Profile, string> = {
  name: 'profile.name',
  initials: 'profile.initials',
  birthDate: 'profile.birth_date',
  household: 'profile.household',
  region: 'profile.region',
};

export class ProfileValidationError extends Error {
  constructor(
    readonly field: keyof Profile,
    message: string,
  ) {
    super(message);
  }
}

/** The stored profile; keys that were never saved fall back to the generic empty value. */
export function getProfile(db: Executor): Profile {
  const value = (key: keyof Profile) => getEntity(db, appSetting, KEY[key])?.value;
  const household = Number(value('household'));
  const region = value('region');
  return {
    name: value('name') ?? EMPTY_PROFILE.name,
    initials: value('initials') ?? EMPTY_PROFILE.initials,
    birthDate: value('birthDate') ?? EMPTY_PROFILE.birthDate,
    household: Number.isInteger(household) && household > 0 ? household : null,
    region: isRegionCode(region) ? region : null,
  };
}

const serialize = (key: keyof Profile, patch: Partial<Profile>, today: string): string => {
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
  patch: Partial<Profile>,
  ctx: AuditContext,
  today: string,
): Profile {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    for (const key of Object.keys(KEY) as (keyof Profile)[]) {
      if (!(key in patch)) continue;
      const value = serialize(key, patch, today);
      const current = getEntity(tx, appSetting, KEY[key]);
      if (!current) {
        if (value !== '') createEntity(tx, appSetting, { id: KEY[key], value }, grouped);
      } else if (current.value !== value) {
        updateEntity(tx, appSetting, KEY[key], { value }, grouped);
      }
    }
    return getProfile(tx);
  });
}
