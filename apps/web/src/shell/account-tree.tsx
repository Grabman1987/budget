import { useAmountPrivacy, cx } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ChevronDown, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useOrderedAccounts, useReorder } from '../ledger/account-order';
import { eur } from '../ledger/format';
import { accountValueEur, type AccountGroupId } from '../ledger/labels';
import { overviewModel, type GroupView } from '../ledger/overview-model';
import { accountsQuery } from '../ledger/queries';
import { useStoredFlag } from './use-stored-flag';

/** Euro amount without cents for the narrow sidebar; a missing rate stays visible as a dash. */
const short = (value: number | null) =>
  value === null ? '–' : eur(Math.round(value / 100) * 100).replace(/,00(?=\s?€)/, '');

/**
 * Account hierarchy under the Planliste: the overview's groups in YNAB's order (Budget-Konten,
 * Kreditkarten, Kredite, Investments) with their sums, each open account linking to its sheet.
 * Only negative budget/investment balances are red pills; card/loan balances remain ink. Groups fold away; the choice is remembered per group.
 *
 * The pencil (on hover or focus of a group head or account) switches the whole tree to edit mode:
 * accounts get a grip and ↑ / ↓ buttons to change their order within their group, "Fertig" ends it.
 */
export function AccountTree() {
  useAmountPrivacy();
  const accounts = useQuery(accountsQuery());
  const params = useParams({ strict: false }) as { id?: string };
  const ordered = useOrderedAccounts(accounts.data?.accounts);
  const [editing, setEditing] = useState(false);
  if (!ordered.accounts) return null;
  const { groups } = overviewModel(ordered.accounts);
  if (groups.length === 0) return null;
  return (
    <nav className="acct-tree" aria-labelledby="acct-tree-label">
      <div className="acct-tree-head">
        <div className="sheetlist-label tech" id="acct-tree-label">
          Konten
        </div>
        {editing && (
          <button type="button" className="acct-done" onClick={() => setEditing(false)}>
            Fertig
          </button>
        )}
      </div>
      {groups.map((g) => (
        <AccountGroupBlock
          key={g.group.id}
          view={g}
          current={params.id}
          editing={editing}
          onEdit={() => setEditing(true)}
          onReorder={(ids) => ordered.save(g.group.id, ids)}
        />
      ))}
    </nav>
  );
}

function PencilButton(props: {
  label: string;
  className: string;
  onClick: () => void;
  /** The per-account pencil is a mouse shortcut; the group pencil is the keyboard way in. */
  mouseOnly?: boolean;
}) {
  useAmountPrivacy();
  return (
    <button
      type="button"
      className={cx('acct-pencil', props.className)}
      aria-label={props.label}
      tabIndex={props.mouseOnly ? -1 : undefined}
      aria-hidden={props.mouseOnly ? true : undefined}
      onClick={props.onClick}
    >
      <Pencil size={13} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

function AccountGroupBlock({
  view,
  current,
  editing,
  onEdit,
  onReorder,
}: {
  view: GroupView;
  current: string | undefined;
  editing: boolean;
  onEdit: () => void;
  onReorder: (ids: string[]) => void;
}) {
  useAmountPrivacy();
  const groupId: AccountGroupId = view.group.id;
  const [storedFolded, setFolded] = useStoredFlag(`budget-acct-tree-${groupId}`);
  // Editing shows every account without changing what the owner folded.
  const folded = storedFolded && !editing;
  const listId = `acct-tree-${groupId}`;
  const ids = view.accounts.map((a) => a.id);
  const names = new Map(view.accounts.map((a) => [a.id, a.name]));
  const reorder = useReorder(ids, onReorder, (id) => names.get(id) ?? '');
  const sum = view.sumCents;
  return (
    <section className={cx('acct-group', folded && 'is-folded', editing && 'is-editing')}>
      <div className="acct-group-bar">
        <button
          type="button"
          className="acct-group-head"
          aria-expanded={!folded}
          aria-controls={listId}
          disabled={editing}
          onClick={() => setFolded(!storedFolded)}
        >
          <ChevronDown className="chev" size={14} strokeWidth={2} aria-hidden="true" />
          <span className="acct-group-title tech">{view.group.title}</span>
        </button>
        {!editing && (
          <PencilButton
            label={`Reihenfolge der Konten in ${view.group.title} ändern`}
            className="acct-pencil-group"
            onClick={onEdit}
          />
        )}
        <span
          className={cx(
            'acct-amount',
            groupId !== 'cards' && groupId !== 'loans' && sum !== null && sum < 0 && 'is-neg',
          )}
        >
          {short(sum)}
        </span>
      </div>
      <ul id={listId} hidden={folded}>
        {view.accounts.map((a) => {
          const value = accountValueEur(a);
          const row = reorder.rowProps(a.id);
          return (
            <li key={a.id} {...row} className={cx(row.className, 'acct-item')}>
              {editing ? (
                <div className="acct-edit-row">
                  <span className="acct-name">{a.name}</span>
                  {reorder.controls(a.id)}
                </div>
              ) : (
                <>
                  <Link
                    to="/konten/$id"
                    params={{ id: a.id }}
                    aria-current={current === a.id ? 'page' : undefined}
                  >
                    <span className="acct-name">{a.name}</span>
                    <span
                      className={cx(
                        'acct-amount',
                        groupId !== 'cards' &&
                          groupId !== 'loans' &&
                          value !== null &&
                          value < 0 &&
                          'is-neg',
                      )}
                    >
                      {short(value)}
                    </span>
                  </Link>
                  <PencilButton
                    label={`Reihenfolge ändern, ${a.name}`}
                    className="acct-pencil-row"
                    mouseOnly
                    onClick={onEdit}
                  />
                </>
              )}
            </li>
          );
        })}
      </ul>
      {editing && reorder.status}
    </section>
  );
}
