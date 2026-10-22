import { useAmountPrivacy, maskMoneyText, privateAmount, Button } from '@budget/ui';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { accountsQuery } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { longDay } from '../ledger/format';
import { sourceMoney, tradesQuery, type TradeRow } from './trade-api';
import { unitsText } from './portfolio-format';
import { TRADE_LABELS as KINDS } from './trade-draft';
export function TradeHistory({
  securityId,
  onEdit,
  disabled,
  trades,
  purchases = false,
}: {
  securityId: string;
  onEdit?: ((id: string) => void) | undefined;
  disabled: boolean;
  trades?: TradeRow[] | undefined;
  purchases?: boolean;
}) {
  useAmountPrivacy();
  const query = useQuery(tradesQuery(securityId));
  const accounts = useQuery({ ...accountsQuery(), retry: false });
  const [all, setAll] = useState(false);
  const ordered = [...(trades ?? query.data?.trades ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const visible = all ? ordered : ordered.slice(0, 12);
  return (
    <section className="trade-history" aria-labelledby="trade-history-title">
      <h3 id="trade-history-title">{purchases ? 'Käufe' : 'Handelsverlauf'}</h3>
      {query.isPending && <LoadingNote what="Handelsverlauf" />}
      {query.isError && (
        <ErrorNote what="Handelsverlauf" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {accounts.isError && (
        <ErrorNote
          what="Anlagekonten"
          error={accounts.error}
          onRetry={() => void accounts.refetch()}
        />
      )}
      {(trades ?? query.data?.trades)?.length === 0 && (
        <p className="vnote">Noch kein Handel für dieses Instrument erfasst.</p>
      )}
      {/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The native overflow region needs keyboard scrolling. */}
      <div
        className="wealth-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Handelsverlauf scrollen"
      >
        <table className="wealth-trades trade-list">
          <caption className="sr-only">Handel je Datum und Konto; Beträge in Kontowährung</caption>
          <thead>
            <tr>
              {[
                'Datum',
                'Art / Konto',
                'Stück',
                'Bruttobetrag',
                'Gebühren',
                'Steuer',
                'Notiz',

              ].map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((trade) => {
                const account = accounts.data?.accounts.find(
                  (account) => account.id === trade.accountId,
                );
                const money = (cents: number) =>
                  account ? sourceMoney(cents, account.currency) : 'Kontowährung wird geladen';
                return (
                  <tr key={trade.id} data-trade-id={trade.id}
                    onPointerUp={onEdit && !disabled ? (event) => {
                      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || window.getSelection()?.toString()) return;
                      if (event.target instanceof Element && event.target.closest('button,a,input,select,textarea')) return;
                      onEdit(trade.id);
                    } : undefined}>
                    <td>{longDay(trade.date)}</td>
                    <th scope="row">
                      {onEdit ? <button type="button" className="trade-row-edit" disabled={disabled}
                        onClick={() => onEdit(trade.id)} aria-label={`${KINDS[trade.kind]} vom ${longDay(trade.date)} bearbeiten`}>
                        {KINDS[trade.kind]}
                      </button> : <strong>{KINDS[trade.kind]}</strong>}
                      <small>{maskMoneyText(account?.name ?? 'Konto wird geladen')}</small>
                    </th>
                    <td className="num">
                      {privateAmount(unitsText(
                        trade.kind === 'buy' || trade.kind === 'sell'
                          ? Math.abs(trade.unitsE8)
                          : trade.unitsE8,
                      ))}
                    </td>
                    <td className="num">{money(trade.amountCents)}</td>
                    <td className="num">{money(trade.feeCents)}</td>
                    <td className="num">{money(trade.taxCents)}</td>
                    <td>{maskMoneyText(trade.note ?? '—')}</td>

                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
      {ordered.length > 12 && <Button variant="ghost" onClick={() => setAll((shown) => !shown)}>
        {all ? 'Letzte zwölf anzeigen' : `Alle anzeigen (${ordered.length})`}
      </Button>}
    </section>
  );
}
