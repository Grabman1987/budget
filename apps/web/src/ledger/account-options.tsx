import { groupAccounts } from './account-groups';
import type { AccountRow } from './types';

type Option = Pick<AccountRow, 'id' | 'name' | 'type' | 'onBudget' | 'sortOrder' | 'closedAt'>;

/**
 * `<optgroup>`s of the account groups (Budget-Konten, Kreditkarten, Kredite, Investments) for a
 * select. Closed accounts are left out unless `withClosed` is set (filters, on demand) or one of
 * them is `keepId` (an existing choice must stay visible); then they follow in "Geschlossen".
 */
export function AccountOptions({
  accounts,
  exclude,
  withClosed = false,
  keepId,
}: {
  accounts: ReadonlyArray<Option>;
  exclude?: string | undefined;
  withClosed?: boolean;
  keepId?: string | undefined;
}) {
  const usable = accounts.filter((a) => a.id !== exclude);
  const open = usable.filter((a) => !a.closedAt);
  const closed = usable.filter((a) => a.closedAt && (withClosed || a.id === keepId));
  return (
    <>
      {groupAccounts(open).map(({ group, accounts: members }) => (
        <optgroup key={group.id} label={group.title}>
          {members.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </optgroup>
      ))}
      {closed.length > 0 && (
        <optgroup label="Geschlossen">
          {groupAccounts(closed).flatMap(({ accounts: members }) =>
            members.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            )),
          )}
        </optgroup>
      )}
    </>
  );
}
