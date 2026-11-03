import { Check, CircleDashed, Minus } from 'lucide-react';
import { accountCheck } from './overview-model';
import type { AccountRow } from './types';

/** Display the producer's review state and elapsed days; do not infer a new review policy. */
export function accountCheckPresentation(account: AccountRow) {
  const check = accountCheck(account);
  const review = account.reviewStatus;
  const Icon =
    check.state === 'checked'
      ? Check
      : check.state === 'due' || check.state === 'unreviewed'
        ? CircleDashed
        : Minus;
  const label =
    check.state === 'checked'
      ? 'geprüft'
      : check.state === 'due'
        ? 'fällig'
        : check.state === 'unreviewed' && review?.checkedOn
          ? 'offen'
          : check.state === 'inactive' || check.state === 'unreviewed'
            ? 'noch nie'
            : check.state === 'unsupported'
              ? 'Prüfung nicht unterstützt'
              : 'Prüfstatus nicht verfügbar';
  const age = review?.checkedOn && review.days != null ? ` · vor ${review.days} T` : '';
  return { state: check.state, Icon, label, age };
}

export function AccountCheckMark({ account }: { account: AccountRow }) {
  const { state, Icon, label, age } = accountCheckPresentation(account);
  return (
    <span className="account-check-mark" data-review-state={state}>
      <Icon size={14} aria-hidden="true" />
      {label}
      {age && <span className="overview-check-age">{age}</span>}
    </span>
  );
}
