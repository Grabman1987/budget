/**
 * Voluntary family situation and obligations (Einstellungen › Profil). All fields are optional;
 * `null` means "not given" and stays distinct from an explicit "none" / 0. No names or dates of
 * birth of other persons are collected, and no amounts: recurring support payments are already
 * ordinary payments/budget lines in the ledger and must not be counted twice here. See
 * docs/family-situation.md. Household size lives in `Profile.household` and is not duplicated.
 */

export const FAMILY_SITUATION_VERSION = 1;

export const PROFILE_DEPENDANTS_MAX = 10;

/** Partner living with the owner is covered by `Profile.household`; this only states existence. */
export const FAMILY_OPTIONS = {
  partnership: ['none', 'partner'],
  partnerIncome: ['none', 'partial', 'full'],
  support: ['none', 'some'],
} as const;

export type FamilyChoiceKey = keyof typeof FAMILY_OPTIONS;
export type FamilyCountKey = 'dependants' | 'children';

export interface FamilySituation {
  /** Partner relationship: explicit none vs. a partner. */
  partnership: 'none' | 'partner' | null;
  /** Share of the household income the partner covers (only relevant with a partner). */
  partnerIncome: 'none' | 'partial' | 'full' | null;
  /** Financially dependent persons (children included); 0 = explicitly none. */
  dependants: number | null;
  /** Of which children; never more than `dependants`. */
  children: number | null;
  /** Recurring support obligations to persons outside the household (amounts: see payments). */
  support: 'none' | 'some' | null;
}

export const EMPTY_FAMILY: FamilySituation = {
  partnership: null,
  partnerIncome: null,
  dependants: null,
  children: null,
  support: null,
};

export const FAMILY_CHOICE_KEYS = Object.keys(FAMILY_OPTIONS) as FamilyChoiceKey[];
export const FAMILY_COUNT_KEYS: FamilyCountKey[] = ['dependants', 'children'];

export const isFamilyChoice = (key: FamilyChoiceKey, value: unknown): boolean =>
  (FAMILY_OPTIONS[key] as readonly unknown[]).includes(value);

export const isFamilyCount = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= PROFILE_DEPENDANTS_MAX;

/** Whether `children` and `dependants` are consistent (unknown is always consistent). */
export const isFamilyConsistent = (f: Pick<FamilySituation, 'dependants' | 'children'>): boolean =>
  f.dependants === null || f.children === null || f.children <= f.dependants;

export type ObligationState = 'unknown' | 'none' | 'present';
export type IncomeSharing = 'unknown' | 'notApplicable' | 'sole' | 'shared';
/**
 * `review`: at least one given fact is relevant for the liquidity need; `nothing`: everything
 * relevant is given and none applies; `unknown`: not enough given and nothing relevant reported.
 */
export type FamilyConsideration = 'unknown' | 'nothing' | 'review';

export interface FamilyContext {
  version: number;
  dependants: ObligationState;
  support: ObligationState;
  incomeSharing: IncomeSharing;
  consideration: FamilyConsideration;
  /** Facts still not given that the statement would need. */
  missing: ('partnership' | 'partnerIncome' | 'dependants' | 'support')[];
}

/**
 * Explains how family facts relate to the liquidity need (reserve) and risk-bearing capacity.
 * Purely descriptive: it never yields a score, penalty, recommendation or target change, and a
 * missing answer is never assumed.
 */
export function describeFamilyContext(family: FamilySituation): FamilyContext {
  const dependants: ObligationState =
    family.dependants === null ? 'unknown' : family.dependants > 0 ? 'present' : 'none';
  const support: ObligationState =
    family.support === null ? 'unknown' : family.support === 'some' ? 'present' : 'none';
  let incomeSharing: IncomeSharing;
  if (family.partnership === null) incomeSharing = 'unknown';
  else if (family.partnership === 'none') incomeSharing = 'notApplicable';
  else if (family.partnerIncome === null) incomeSharing = 'unknown';
  else incomeSharing = family.partnerIncome === 'none' ? 'sole' : 'shared';

  const missing: FamilyContext['missing'] = [];
  if (family.partnership === null) missing.push('partnership');
  else if (family.partnership === 'partner' && family.partnerIncome === null)
    missing.push('partnerIncome');
  if (family.dependants === null) missing.push('dependants');
  if (family.support === null) missing.push('support');

  const relevant = dependants === 'present' || support === 'present' || incomeSharing === 'sole';
  return {
    version: FAMILY_SITUATION_VERSION,
    dependants,
    support,
    incomeSharing,
    consideration: relevant ? 'review' : missing.length === 0 ? 'nothing' : 'unknown',
    missing,
  };
}
