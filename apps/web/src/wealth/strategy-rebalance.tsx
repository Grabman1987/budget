import { Button, privateAmount, useToast } from '@budget/ui';
import type { PortfolioStrategyWithRebalanceView, TradeRow } from '@budget/db';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { undoGroup } from '../ledger/api';
import { eur, longDay } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { unitsText } from './portfolio-format';
import { TradePanel } from './trade-panel';
import { sourceMoney } from './trade-api';
import { closeRebalance, linkRebalanceTrade, reviewRebalance, strategyTradesQuery,
  strategyTradeFactsQuery, unlinkRebalanceTrade } from './strategy-api';

type Event = PortfolioStrategyWithRebalanceView['rebalanceLifecycle']['events'][number];
type Receipt = { groupId: string; changedCount: number };
type Data = PortfolioStrategyWithRebalanceView;
const NAMES = { global: 'Globale Aktien', gold: 'Gold', nasdaq2x: 'Nasdaq-100 · täglich 2×', eurBonds: 'Kurzlaufende EUR-Staatsanleihen' };
const STATES = { reviewing: 'Ausführung noch nicht zugeordnet', partial: 'Teilweise zugeordnet',
  completed: 'Ausführungen ausdrücklich bestätigt', cancelled: 'Ohne Ausführung geschlossen',
  partial_closed: 'Teilweise ausgeführt · Rest geschlossen', withdrawn: 'Prüfung zurückgenommen',
  needs_reconciliation: 'Zuordnung muss abgeglichen werden' };

/** A proposal is advisory; each actual trade remains an ordinary trade with its own Undo group. */
export function StrategyRebalance({ data, fresh }: { data: Data; fresh: boolean }) {
  const qc = useQueryClient(), toast = useToast();
  const busyRef = useRef(false);
  const reviewTokens = useRef(new Map<string, string>());
  const [busy, setBusy] = useState(false);
  const history = data.rebalanceLifecycle;
  const trades = useQuery({ ...strategyTradesQuery(), enabled: history.events.some((event) => !!event.proposal) });
  const refresh = async () => {
    try { await qc.invalidateQueries({ queryKey: [...LEDGER_KEY] }); }
    catch { toast.show({ message: 'Gespeichert. Der neue Stand konnte nicht geladen werden; bitte aktualisieren.' }); }
  };
  const reverse = async (groupId: string, redo = false) => {
    try {
      const result = await undoGroup(groupId);
      await refresh();
      toast.show({ message: redo ? 'Wiederhergestellt.' : 'Rückgängig gemacht.',
        actionLabel: redo ? 'Rückgängig' : 'Wiederholen',
        onAction: () => void reverse(result.groupId, !redo) });
    } catch (error) { toast.show({ message: `Rückgängig/Wiederholen nicht möglich: ${errorText(error)}` }); }
  };
  const act = async (run: () => Promise<Receipt>, message: string) => {
    if (!fresh || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const result = await run();
      await refresh();
      toast.show(result.changedCount === 0 ? { message: 'Diese Anfrage war bereits gespeichert.' } : {
        message, actionLabel: 'Rückgängig', onAction: () => void reverse(result.groupId),
      });
    } catch (error) { toast.show({ message: errorText(error) }); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const candidate = history.candidate;
  return <div className="strategy-rebalance-lifecycle">
    {candidate && !history.events.some((event) => event.month === candidate.month && event.proposal) &&
      <div className="strategy-rebalance-event">
        <p>{candidate.previouslyReviewed
          ? 'Die frühere Prüfung dieses Monats wurde zurückgenommen. Eine neue ausdrückliche Prüfung ist nötig.'
          : 'Der aktuelle Bruttovorschlag kann für eine spätere Zuordnung geprüft und festgehalten werden.'}</p>
        <Button disabled={!fresh || busy || !data.rebalance?.due} onClick={() => void act(() => reviewRebalance({
          month: candidate.month, revision: candidate.revision, decisionRevision: candidate.decisionRevision,
          proposalRevision: candidate.proposalRevision,
          requestId: reviewTokens.current.get(`${candidate.month}:${candidate.revision}`) ?? (() => {
            const id = crypto.randomUUID(); reviewTokens.current.set(`${candidate.month}:${candidate.revision}`, id); return id;
          })(),
        }), candidate.previouslyReviewed ? 'Monatsvorschlag erneut geprüft.' : 'Monatsvorschlag geprüft.')}>Vorschlag ausdrücklich prüfen</Button>
      </div>}
    {history.events.map((event) => <RebalanceEvent key={`${event.month}:${event.revision}`} event={event}
      data={data} fresh={fresh && !busy} trades={trades.isError ? null : trades.data?.trades ?? null}
      tradesPending={trades.isPending} tradesError={trades.isError ? trades.error : null}
      onRetryTrades={() => void trades.refetch()} act={act} />)}
  </div>;
}

function RebalanceEvent({ event, data, fresh, trades, tradesPending, tradesError, onRetryTrades, act }: {
  event: Event; data: Data; fresh: boolean; trades: TradeRow[] | null;
  tradesPending: boolean; tradesError: unknown; onRetryTrades: () => void;
  act: (run: () => Promise<Receipt>, message: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState('');
  const [category, setCategory] = useState<keyof typeof NAMES>('global');
  const [ackToken, setAckToken] = useState<string | null>(null), [closeAck, setCloseAck] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const requestTokens = useRef(new Map<string, string>());
  const facts = useQuery({ ...strategyTradeFactsQuery(selected), enabled: !!selected });
  const current = facts.isError ? null : facts.data?.trade;
  const proposal = event.proposal;
  const eligible = trades?.filter((trade) => !!proposal && (trade.kind === 'buy' || trade.kind === 'sell') &&
    proposal.accountIds.includes(trade.accountId) && trade.date >= proposal.effectiveDate) ?? [];
  const instrument = data.metadata.securities.find((row) => row.id === current?.securityId);
  const command = (action: string) => {
    let requestId = requestTokens.current.get(action);
    if (!requestId) { requestId = crypto.randomUUID(); requestTokens.current.set(action, requestId); }
    return { month: event.month, revision: event.revision, requestId };
  };
  const open = event.state === 'reviewing' || event.state === 'partial';
  return <article className="strategy-rebalance-event" aria-label={`Rebalancing ${event.month}`}>
    <h3>{event.proposal ? `Prüfung ab ${longDay(event.proposal.effectiveDate)}` : `Zurückgenommene Prüfung ${event.month}`}</h3>
    <p role={event.status === 'needs_reconciliation' ? 'alert' : undefined}>{STATES[event.status]}</p>
    {!event.proposal ? <p>Die Rücknahme bleibt in der Historie. Ein erneuter Vorschlag entsteht nur durch ausdrückliche Prüfung.</p> : <>
      <p>Ursprünglicher {event.proposal.trigger === 'regime_changed' ? 'Trendwechsel' : 'Quartalsabschluss'} · geprüft nach Stand <time dateTime={event.proposal.asOf}>{new Date(event.proposal.asOf).toLocaleString('de-AT', { timeZone: 'Europe/Vienna' })}</time>.
        {!event.proposalCurrent && ' Der aktuelle Zielabstand hat einen anderen oder nicht verfügbaren Datenstand; die tatsächlichen Handelsdaten bleiben getrennt erhalten.'}</p>
      <details><summary>Ursprüngliche Brutto-Kategoriebeträge</summary><ul>{event.proposal.rows.map((row) =>
        <li key={row.category}>{NAMES[row.category]} · Verkauf {eur(row.sellCents)} · Kauf {eur(row.buyCents)}</li>)}</ul></details>
      {event.conflicts.length > 0 && <p role="alert">Mindestens ein zugeordneter Handel wurde geändert, zurückgenommen oder in einem anderen Monat erneut zugeordnet. Der Abschluss gilt erst nach ausdrücklichem Abgleich wieder.</p>}
      {event.links.length > 0 && <ul>{event.links.map((link) => {
        const name = data.metadata.securities.find((row) => row.id === link.trade.securityId)?.name ?? 'Gespeichertes Instrument';
        return <li key={link.trade.id}>{longDay(link.trade.date)} · {link.trade.kind === 'sell' ? 'Verkauf' : 'Kauf'} {name} · {NAMES[link.category]} · {privateAmount(unitsText(Math.abs(link.trade.unitsE8)))} Anteile · {sourceMoney(link.trade.amountCents, link.trade.currency)} brutto · Gebühren {sourceMoney(link.trade.feeCents, link.trade.currency)} · Steuer {sourceMoney(link.trade.taxCents, link.trade.currency)}
          <Button variant="ghost" disabled={!fresh} onClick={() => void act(() => unlinkRebalanceTrade({ ...command(`unlink:${link.trade.id}`), tradeId: link.trade.id }), 'Nur die Rebalancing-Zuordnung gelöst; der Handel bleibt bestehen.')}>Zuordnung lösen</Button></li>;
      })}</ul>}
      {open && <div className="strategy-rebalance-link">
        <p>Erfasse eine tatsächlich ausgeführte Transaktion im normalen Handelsdialog oder wähle einen bereits erfassten Handel. Das Erfassen allein ordnet ihn diesem Rebalancing noch nicht zu.</p>
        <Button variant="ghost" disabled={!fresh} onClick={() => setTradeOpen(true)}>Ausgeführten Handel erfassen</Button>
        {tradesPending && <LoadingNote what="Handelsliste" />}
        {tradesError && <ErrorNote what="Handelsliste" error={tradesError} onRetry={onRetryTrades} />}
        {trades && <><label>Ausgeführten Handel auswählen
          <select value={selected} onChange={(e) => { setSelected(e.currentTarget.value); setAckToken(null); }}>
            <option value="">Handel auswählen</option>
            {eligible.map((trade) => <option key={trade.id} value={trade.id}>{trade.date} · {trade.kind === 'sell' ? 'Verkauf' : 'Kauf'} · {data.metadata.securities.find((row) => row.id === trade.securityId)?.name ?? trade.securityId} · {trade.id}</option>)}
          </select></label>
          {facts.isPending && selected && <LoadingNote what="Handelsangaben" />}
          {facts.isError && <ErrorNote what="Handelsangaben" error={facts.error} onRetry={() => void facts.refetch()} />}
          {current && <p>Bitte mit der tatsächlichen Abrechnung abgleichen: {longDay(current.date)} · {current.kind === 'sell' ? 'Verkauf' : 'Kauf'} {instrument?.name ?? current.securityId} · {facts.data?.accountName ?? current.accountId} · {privateAmount(unitsText(Math.abs(current.unitsE8)))} Anteile · Brutto {sourceMoney(current.amountCents, current.currency)} · Gebühren {sourceMoney(current.feeCents, current.currency)} · einbehaltene Steuer {sourceMoney(current.taxCents, current.currency)}.</p>}
          <label>Kategorie <select value={category} onChange={(e) => { setCategory(e.currentTarget.value as keyof typeof NAMES); setAckToken(null); }}>
            {Object.entries(NAMES).map(([id, name]) => <option value={id} key={id}>{name}</option>)}
          </select></label>
          <label><input type="checkbox" checked={!!facts.data && ackToken === facts.data.revision && !facts.isFetching}
            disabled={!current || facts.isFetching} onChange={(e) => setAckToken(e.currentTarget.checked ? facts.data?.revision ?? null : null)} /> Datum, Konto, Produkt, Stückzahl, Brutto, Gebühren und auch eine eingetragene Steuer von 0 wurden anhand der tatsächlichen Ausführung geprüft. Dieser Handel gehört zu diesem Monatsereignis.</label>
          <Button disabled={!fresh || !current || !facts.data || facts.isFetching || ackToken !== facts.data.revision || event.status === 'needs_reconciliation'} onClick={() => void act(() => linkRebalanceTrade({ ...command(`link:${current!.id}:${category}:${facts.data!.revision}`), tradeId: current!.id, tradeRevision: facts.data!.revision, category }), 'Ausgeführten Handel dem Rebalancing zugeordnet.')}>Handel zuordnen</Button>
        </>}
      </div>}
      {tradeOpen && <TradePanel id="neu" onClose={() => setTradeOpen(false)} onSaved={() => setTradeOpen(false)}
        onTradeSaved={(saved) => { setSelected(saved.id); setAckToken(null); }} />}
      {open && <div className="strategy-rebalance-close">
        <label><input type="checkbox" checked={closeAck} onChange={(e) => setCloseAck(e.currentTarget.checked)} /> Die tatsächlichen Zuordnungen, Gebühren, Steuern und der verbleibende Zielabstand wurden geprüft. Bei fehlender aktueller Bewertung bleibt der Zielabstand ausdrücklich unbekannt.</label>
        {event.links.length > 0 ? <>
          <Button disabled={!fresh || !closeAck || event.status === 'needs_reconciliation'} onClick={() => void act(() => closeRebalance({ ...command('close:completed'), outcome: 'completed' }), 'Ausgeführtes Rebalancing bestätigt.')}>Ausführung bestätigen</Button>
          <Button variant="ghost" disabled={!fresh || !closeAck || event.status === 'needs_reconciliation'} onClick={() => void act(() => closeRebalance({ ...command('close:partial_closed'), outcome: 'partial_closed' }), 'Teilweise Ausführung mit offenem Rest geschlossen.')}>Rest nicht ausgeführt · schließen</Button>
        </> : <Button variant="ghost" disabled={!fresh || !closeAck} onClick={() => void act(() => closeRebalance({ ...command('close:cancelled'), outcome: 'cancelled' }), 'Ohne Ausführung geschlossen.')}>Ohne Handel schließen</Button>}
      </div>}
      {!open && <Button variant="ghost" disabled={!fresh || event.status === 'needs_reconciliation'} onClick={() => void act(() => closeRebalance({ ...command('reopen'), outcome: 'reopen' }), 'Monatsereignis erneut geöffnet.')}>Erneut öffnen</Button>}
    </>}
  </article>;
}
