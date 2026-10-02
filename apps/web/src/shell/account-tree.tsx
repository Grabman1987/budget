import { cx } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { eur } from '../ledger/format';
import { accountValueEur } from '../ledger/labels';
import { overviewModel } from '../ledger/overview-model';
import { accountsQuery } from '../ledger/queries';
import { useStoredFlag } from './use-stored-flag';

/** Euro amount without cents for the narrow sidebar; a missing rate stays visible as a dash. */
const short = (value: number | null) =>
  value === null ? '–' : eur(Math.round(value / 100) * 100).replace(/,00(?=\s?€)/, '');

/**
 * Account hierarchy under the Planliste: the overview's groups in YNAB's order (Budget-Konten,
 * Kreditkarten, Kredite, Investments) with their sums, each open account linking to its sheet.
 * Negative amounts are red pills. Groups fold away; the choice is remembered per group.
 */
export function AccountTree() {
  const accounts = useQuery(accountsQuery());
  const params = useParams({ strict: false }) as { id?: string };
  if (!accounts.data) return null;
  const { groups } = overviewModel(accounts.data.accounts);
  if (groups.length === 0) return null;
  return (
    <nav className="acct-tree" aria-labelledby="acct-tree-label">
      <div className="sheetlist-label tech" id="acct-tree-label">
        Konten
      </div>
      {groups.map((g) => (
        <AccountGroupBlock
          key={g.group.id}
          groupId={g.group.id}
          title={g.group.title}
          sumCents={g.sumCents}
          current={params.id}
          accounts={g.accounts.map((a) => ({ id: a.id, name: a.name, value: accountValueEur(a) }))}
        />
      ))}
    </nav>
  );
}

function AccountGroupBlock({
  groupId,
  title,
  sumCents,
  accounts,
  current,
}: {
  groupId: string;
  title: string;
  sumCents: number | null;
  accounts: { id: string; name: string; value: number | null }[];
  current: string | undefined;
}) {
  const [folded, setFolded] = useStoredFlag(`budget-acct-tree-${groupId}`);
  const listId = `acct-tree-${groupId}`;
  return (
    <section className={cx('acct-group', folded && 'is-folded')}>
      <button
        type="button"
        className="acct-group-head"
        aria-expanded={!folded}
        aria-controls={listId}
        onClick={() => setFolded(!folded)}
      >
        <ChevronDown className="chev" size={14} strokeWidth={2} aria-hidden="true" />
        <span className="acct-group-title tech">{title}</span>
        <span className={cx('acct-amount', sumCents !== null && sumCents < 0 && 'is-neg')}>
          {short(sumCents)}
        </span>
      </button>
      <ul id={listId} hidden={folded}>
        {accounts.map((a) => (
          <li key={a.id}>
            <Link
              to="/konten/$id"
              params={{ id: a.id }}
              aria-current={current === a.id ? 'page' : undefined}
            >
              <span className="acct-name">{a.name}</span>
              <span className={cx('acct-amount', a.value !== null && a.value < 0 && 'is-neg')}>
                {short(a.value)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
