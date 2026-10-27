import {
  historyDays, lastDayOfMonth, monthOf, projectAssetComposition,
  type AssetCompositionPoint,
} from '@budget/domain';
import { isNull } from 'drizzle-orm';
import { account, security } from '../schema';
import { netWorthCompositionSource } from './portfolio';
import { memoized } from './request-memo';
import type { Executor } from './types';

/** Historical money, grouped by current metadata; account/security taxonomy is not versioned. */
export function netWorthAssetComposition(db: Executor, from: string, to: string): {
  current: AssetCompositionPoint;
  history: AssetCompositionPoint[];
} {
  return memoized(db, `asset-composition|${from}|${to}`, () => {
    const accounts = db.select({
      accountId: account.id, name: account.name, type: account.type, role: account.role,
      referenceAccountId: account.referenceAccountId,
    }).from(account).where(isNull(account.deletedAt)).all();
    const securityKinds = new Map(db.select({ id: security.id, kind: security.kind })
      .from(security).where(isNull(security.deletedAt)).all().map((s) => [s.id, s.kind]));
    const history = historyDays(from, to, 'month').map((asOf): AssetCompositionPoint => {
      const { valuation, components } = netWorthCompositionSource(db, asOf);
      return projectAssetComposition({
        asOf, pointKind: asOf === to ? 'as_of'
          : asOf === from ? 'period_start'
          : asOf === lastDayOfMonth(monthOf(asOf)) ? 'month_end' : 'period_start',
        components, accounts, securityKinds, totalCents: valuation.totalCents,
        byAccount: valuation.byAccount,
      });
    });
    // historyDays always includes the actual selected endpoint, even for a one-day window.
    return { current: history[history.length - 1]!, history };
  });
}
