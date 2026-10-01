import {
  Button,
  DetailPanel,
  DimensionChain,
  RevisionTable,
  SectionHead,
  cx,
  useToast,
  type DimensionChainTerm,
  type RevisionRow,
} from '@budget/ui';
import { cents } from '@budget/domain';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AlertTriangle, BarChart3, CheckCircle2, ChevronRight, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { undoGroup } from '../ledger/api';
import { eur, MINUS } from '../ledger/format';
import { errorText } from '../ledger/labels';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { PAGES } from '../nav/pages';
import { AppLink } from '../shell/app-link';
import { PageFrame } from '../pages/placeholder-page';
import {
  applyProposal,
  portfolioQuery,
  PORTFOLIO_KEY,
  pricesQuery,
  proposalQuery,
  refreshMarket,
  type PortfolioSummary,
  type PositionLine,
  type SavingsProposal,
} from './portfolio-api';
import { PriceChart } from './portfolio-chart';
import {
  kpiRow,
  leadState,
  pctBp,
  planRows,
  plansAside,
  positionGroups,
  priceText,
  rebalanceRows,
  SOURCE_LABEL,
  sourceSummary,
  tracks,
  whole,
  gainBp,
} from './portfolio-model';
import { WEALTH_KEY } from './api';
import { VermoegenStand } from './frame';
import { useZeitraum } from './zeitraum';

function pageMeta() {
  const meta = PAGES.find((p) => p.path === '/vermoegen/portfolio');
  if (!meta) throw new Error('Portfolio page is not registered in nav/pages');
  return meta;
}
const META = pageMeta();

/** Vermögen › Portfolio: decide on allocation, savings plans and rebalancing; positions below. */
export function PortfolioPage() {
  const [period] = useZeitraum();
  const summary = useQuery({ ...portfolioQuery(period), placeholderData: keepPreviousData });
  const proposal = useQuery(proposalQuery());
  const portfolio = summary.data?.portfolio;
  const [open, setOpen] = useState<string | undefined>();

  return (
    <PageFrame meta={META} stand={<RefreshStand />}>
      <div className="pf-view">
        {summary.isPending && <LoadingNote what="Portfolio" />}
        {summary.isError && (
          <ErrorNote
            what="Portfolio"
            error={summary.error}
            onRetry={() => void summary.refetch()}
          />
        )}
        {portfolio && (
          <>
            <Lead p={portfolio} />
            <Plans p={portfolio} proposal={proposal} />
            <Allocation p={portfolio} />
            <Rebalancing p={portfolio} />
            <Positions p={portfolio} onOpen={setOpen} />
            <Platforms p={portfolio} />
            <ProductPanel
              position={portfolio.positions.find((pos) => pos.securityId === open)}
              p={portfolio}
              onClose={() => setOpen(undefined)}
            />
          </>
        )}
      </div>
    </PageFrame>
  );
}

// ---------- Stand cell: refresh the prices ----------

/** The price refresh (`POST /market/refresh`) with its toast; shared by the title block and the phone. */
function useRefreshPrices() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: refreshMarket,
    onSuccess: (result) => {
      const failed = result.prices.failed.length + result.fx.failed.length;
      toast.show({
        message:
          failed > 0
            ? `Kurse aktualisiert, bei ${failed} ${failed === 1 ? 'Wert' : 'Werten'} gab es keine Antwort. Die Meldung steht im Posteingang.`
            : 'Kurse aktualisiert.',
      });
    },
    onError: (error) =>
      toast.show({
        message:
          error instanceof Error && 'code' in error && error.code === 'refresh_running'
            ? 'Die Kurse werden gerade aktualisiert.'
            : `Kurse nicht aktualisiert. ${errorText(error, '')}`.trim(),
      }),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: PORTFOLIO_KEY }),
        qc.invalidateQueries({ queryKey: WEALTH_KEY }),
      ]),
  });
}

/** Title block cell "Stand": the day and the one action that brings new prices. */
function RefreshStand() {
  const refresh = useRefreshPrices();
  return (
    <>
      <VermoegenStand />
      <span className="pf-stand-sep" aria-hidden="true">
        ·
      </span>
      <button
        type="button"
        className="pf-stand-btn"
        disabled={refresh.isPending}
        onClick={() => refresh.mutate()}
      >
        {refresh.isPending ? 'Kurse werden aktualisiert …' : 'Kurse aktualisieren'}
      </button>
    </>
  );
}

// ---------- Lead ----------

function Lead({ p }: { p: PortfolioSummary }) {
  const state = leadState(p);
  const terms: DimensionChainTerm[] = [
    { label: 'Einstand', value: cents(p.costCents) },
    { label: 'Wertzuwachs', value: cents(p.gainCents), op: '+' },
    { label: 'Wert heute', value: cents(p.valueCents), op: '=' },
  ];
  const euros = eur(Math.abs(p.valueCents)).split(',');
  const wholePart = (p.valueCents < 0 ? MINUS : '') + (euros[0] ?? '0');
  return (
    <section className="pf-lead" aria-labelledby="pf-title">
      <div className="tbd-head">
        <h2 id="pf-title">Portfolio</h2>
        <span className="tbd-state" data-testid="pf-state">
          {state.ok ? (
            <span className="ok">
              <CheckCircle2
                className="icon icon-sm"
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {state.text}
            </span>
          ) : (
            <span className="ink">
              <AlertTriangle
                className="icon icon-sm"
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {state.text}
            </span>
          )}
        </span>
      </div>
      <div className="tbd-fig" data-testid="portfolio-value">
        {wholePart}
        <span className="cents">,{euros[1]?.replace(' €', '') ?? '00'} €</span>
      </div>
      <DimensionChain terms={terms} label="Maßkette Portfoliowert" />
      <dl className="pf-kpi" aria-label="Kennzahlen des Zeitraums">
        {kpiRow(p).map((k) => (
          <div key={k.id} data-testid={`kpi-${k.id}`}>
            <dt className="tech">{k.label}</dt>
            <dd>
              <strong>{k.value}</strong>
              <small>{k.note}</small>
            </dd>
          </div>
        ))}
      </dl>
      <AppLink to="/reports/prendite" className="vlook">
        <BarChart3 className="icon" size={20} strokeWidth={1.75} aria-hidden="true" />
        <span>
          <strong>Wie haben sich die Entscheidungen ausgewirkt?</strong>
          <small>
            Rendite, Benchmarks, Depots im Vergleich, Kosten und Steuern stehen unter Reports ›
            Portfolio.
          </small>
        </span>
        <ChevronRight className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
      </AppLink>
    </section>
  );
}

// ---------- Sparpläne ----------

function Plans({
  p,
  proposal,
}: {
  p: PortfolioSummary;
  proposal: UseQueryResult<SavingsProposal>;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const data = proposal.data;
  const rows = data ? planRows(p, data) : [];
  const done = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: PORTFOLIO_KEY }),
      qc.invalidateQueries({ queryKey: ['ledger'] }),
    ]);

  const offerUndo = (groupId: string) =>
    toast.show({
      message:
        'Sparplan-Vorschlag übernommen. Die Bank ändert nichts von selbst; ein Eintrag im Posteingang erinnert dich.',
      actionLabel: 'Rückgängig',
      onAction: () => {
        void undoGroup(groupId).then(
          (undone) => {
            void done();
            toast.show({
              message: 'Rückgängig gemacht.',
              actionLabel: 'Wiederholen',
              onAction: () =>
                void undoGroup(undone.groupId).then(done, (error: unknown) =>
                  toast.show({
                    message: `Wiederholen nicht möglich. ${errorText(error, '')}`.trim(),
                  }),
                ),
            });
          },
          (error: unknown) => toast.show({ message: errorText(error) }),
        );
      },
    });

  const apply = useMutation({
    mutationFn: applyProposal,
    onSuccess: (result) => {
      if (result.changes.length === 0)
        toast.show({ message: 'Die Sparpläne entsprechen schon dem Vorschlag.' });
      else offerUndo(result.groupId);
    },
    onError: (error) =>
      toast.show({ message: `Vorschlag nicht übernommen. ${errorText(error, '')}`.trim() }),
    onSettled: done,
  });

  return (
    <section className="pf-plans vplan" id="pf-plans" aria-labelledby="pf-plans-title">
      <SectionHead
        id="pf-plans-title"
        title="Sparpläne"
        {...(data && rows.length > 0 ? { aside: plansAside(data) } : {})}
      />
      {proposal.isPending && <LoadingNote what="Sparpläne" />}
      {proposal.isError && (
        <ErrorNote
          what="Sparpläne"
          error={proposal.error}
          onRetry={() => void proposal.refetch()}
        />
      )}
      {data && rows.length === 0 && (
        <EmptyNote>Noch keine Sparpläne. Sie entstehen unter Einstellungen › Sparpläne.</EmptyNote>
      )}
      {rows.length > 0 && (
        <>
          <table className="ktable vtable pf-plan-table">
            <caption className="sr-only">Sparpläne mit heutiger Rate und Vorschlag</caption>
            <thead>
              <tr>
                <th className="tech" scope="col">
                  Produkt
                </th>
                <th className="tech kc-num" scope="col">
                  Rate heute
                </th>
                <th className="tech kc-num" scope="col">
                  Vorschlag
                </th>
                <th className="tech" scope="col">
                  Grund
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-testid="plan-row">
                  <td className="pf-pn">
                    <span className="kname-s">{row.name}</span>
                  </td>
                  <td className="kc-num pf-now">{whole(row.nowCents)}</td>
                  <td className="kc-num pf-next">
                    <strong>{whole(row.nextCents)}</strong>
                  </td>
                  <td className="kc-plain pf-why">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="vplan-act">
            <Button
              size="sm"
              disabled={apply.isPending || !data?.proposal.changed}
              onClick={() => apply.mutate()}
            >
              Vorschlag übernehmen
            </Button>
            <span className="muted">
              {data?.proposal.changed
                ? 'Die Bank ändert den Sparplan nicht automatisch; die App erinnert dich.'
                : data?.proposal.note === 'no_eligible_plan'
                  ? 'Alle Pläne müssten pausiert werden; deshalb ändert die App nichts.'
                  : 'Die Sparpläne passen zur Aufteilung.'}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

// ---------- Aufteilung Soll/Ist ----------

function Allocation({ p }: { p: PortfolioSummary }) {
  const rows = tracks(p);
  return (
    <section className="valloc" aria-labelledby="pf-alloc-title">
      <SectionHead
        id="pf-alloc-title"
        title="Aufteilung Soll/Ist"
        aside="Band: ±5 Prozentpunkte oder ±25 % relativ"
      />
      {rows.length === 0 && (
        <EmptyNote>
          Noch keine Soll-Aufteilung. Sie entsteht unter Einstellungen › Anlageklassen.
        </EmptyNote>
      )}
      <ul className="vallo">
        {rows.map((c) => (
          <li key={c.key} className={c.out ? 'is-out' : undefined} data-testid="alloc-row">
            <span className="va-name">
              {c.name}
              {c.note && <small>{c.note}</small>}
            </span>
            <span className="va-track" aria-hidden="true">
              <i className="va-band" style={{ left: `${c.bandLeft}%`, width: `${c.bandWidth}%` }} />
              <i className="va-ist" style={{ width: `${c.istWidth}%` }} />
              <i className="va-soll" style={{ left: `${c.sollLeft}%` }} />
            </span>
            <span className="va-val">
              <strong className={c.out ? 'neg-alert' : undefined}>{c.ist}</strong>
              <small>Soll {c.soll}</small>
            </span>
            <span className="sr-only">{c.summary}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Rebalancing ----------

function Rebalancing({ p }: { p: PortfolioSummary }) {
  const navigate = useNavigate();
  const rows = rebalanceRows(p);
  const revision: RevisionRow[] = rows.map((r, i) => ({
    id: r.id,
    letter: r.letter,
    title: r.title,
    detail: r.detail,
    urgent: i === 0,
    action: {
      label: r.actionLabel,
      onClick: () => {
        if (r.action === 'plans') {
          const target = document.getElementById('pf-plans');
          target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
          target?.querySelector<HTMLElement>('button.btn')?.focus({ preventScroll: true });
        } else {
          void navigate({ to: '/einstellungen/regelwerk' as never });
        }
      },
    },
  }));
  const n = p.allocation.breaches.length;
  return (
    <section className="vrebal pf-rebal" aria-labelledby="pf-rebal-title">
      <SectionHead
        id="pf-rebal-title"
        title="Rebalancing"
        aside={
          rows.length > 0
            ? n > 0
              ? `${n} außerhalb des Bands`
              : 'Grenzen verletzt'
            : 'alles im Band'
        }
      />
      <RevisionTable
        rows={revision}
        caption="Vorschläge zum Rebalancing"
        empty={
          <>
            <CheckCircle2 className="icon" size={18} strokeWidth={1.75} aria-hidden="true" />
            Alle Anlageklassen liegen im Band.
          </>
        }
      />
    </section>
  );
}

// ---------- Positionen ----------

function Positions({ p, onOpen }: { p: PortfolioSummary; onOpen: (securityId: string) => void }) {
  const groups = positionGroups(p);
  const refresh = useRefreshPrices();
  return (
    <section className="vpos pf-pos-section" aria-labelledby="pf-pos-title">
      <SectionHead
        id="pf-pos-title"
        title="Positionen"
        aside={`${p.positions.length} Positionen · Einstand ${whole(p.costCents)}`}
      />
      <div className="pf-refresh-phone">
        <Button
          size="sm"
          variant="ghost"
          disabled={refresh.isPending}
          onClick={() => refresh.mutate()}
        >
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
          Kurse aktualisieren
        </Button>
      </div>
      {groups.length === 0 ? (
        <EmptyNote>
          Noch keine Positionen. Käufe erfasst du unter Einstellungen › Wertpapiere.
        </EmptyNote>
      ) : (
        <table className="ktable vtable pf-pos">
          <caption className="sr-only">Positionen mit Wert, Anteil und Rendite seit Kauf</caption>
          <thead>
            <tr>
              <th className="tech kc-pos" scope="col">
                Pos.
              </th>
              <th className="tech" scope="col">
                Position
              </th>
              <th className="tech" scope="col">
                Plattform
              </th>
              <th className="tech kc-num" scope="col">
                Stück
              </th>
              <th className="tech kc-num" scope="col">
                Kurs
              </th>
              <th className="tech kc-num" scope="col">
                Wert
              </th>
              <th className="tech kc-num" scope="col">
                Anteil
              </th>
              <th className="tech kc-num" scope="col">
                seit Kauf
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <tr key={g.key} className="kgroup">
                <td className="kc-pos">
                  <span className="grp-no">{g.no}</span>
                </td>
                <td colSpan={4}>
                  <span className="grp-title">{g.name}</span>
                </td>
                <td className="kc-num">{g.value}</td>
                <td className="kc-num">{g.share}</td>
                <td />
              </tr>,
              ...g.positions.map((v) => (
                <tr key={v.position.securityId} className="krow pf-prow" data-testid="position-row">
                  <td className="kc-pos">
                    <span className="pos">{v.no}</span>
                  </td>
                  <td className="pf-name">
                    <button
                      type="button"
                      className="kname-btn"
                      onClick={() => onOpen(v.position.securityId)}
                      aria-label={`${v.position.name}, Kursverlauf öffnen`}
                    >
                      <span className="kname-s">{v.position.name}</span>
                    </button>
                  </td>
                  <td className="kc-acct pf-plat">{v.platform}</td>
                  <td className="kc-num kc-plain pf-units">{v.units}</td>
                  <td className="kc-num kc-plain pf-price">{v.price}</td>
                  <td className="kc-num pf-value">{v.value}</td>
                  <td className="kc-num kc-plain pf-share">{v.share}</td>
                  <td className="kc-num kc-plain pf-gain">{v.gain}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ---------- Plattformen ----------

function Platforms({ p }: { p: PortfolioSummary }) {
  return (
    <section className="vplat" aria-labelledby="pf-plat-title">
      <SectionHead
        id="pf-plat-title"
        title="Plattformen"
        aside="R14: Krypto- oder P2P-Plattform je ≤ 20 %"
      />
      <ul className="vbars">
        {p.platforms.map((pl) => (
          <li key={pl.institutionId ?? pl.name}>
            <span className="vb-name">{pl.name}</span>
            <span className="vb-bar" aria-hidden="true">
              <i style={{ width: `${pl.shareBp / 100}%` }} />
            </span>
            <span className="vb-val">{pctBp(pl.shareBp)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Product panel ----------

function ProductPanel({
  position,
  p,
  onClose,
}: {
  position: PositionLine | undefined;
  p: PortfolioSummary;
  onClose: () => void;
}) {
  // Keep the last product while the panel animates out.
  const [shown, setShown] = useState<PositionLine | undefined>(position);
  if (position && position !== shown) setShown(position);
  return (
    <DetailPanel open={position !== undefined} onClose={onClose} title={shown?.name ?? ''}>
      {shown && <ProductBody key={shown.securityId} position={shown} p={p} />}
    </DetailPanel>
  );
}

const RECENT = 6;

function ProductBody({ position, p }: { position: PositionLine; p: PortfolioSummary }) {
  const prices = useQuery(pricesQuery(position.securityId));
  const list = prices.data?.prices ?? [];
  const currency = prices.data?.currency ?? 'EUR';
  const className = position.assetClassId
    ? (p.names.assetClasses[position.assetClassId] ?? '')
    : '';
  const platform = position.institutionId
    ? (p.names.institutions[position.institutionId] ?? '')
    : '';
  const latest = list[list.length - 1];
  const gain = gainBp(position);
  const sub = [
    className,
    platform,
    latest ? `Kurs ${priceText(latest.priceMicro, currency)}` : 'manuell bewertet',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="pf-product" data-testid="product-panel">
      <p className="panel-sub">{sub}</p>
      <div className="pf-figs">
        <div>
          <span className="tech">Wert</span>
          <strong>{whole(position.valueCents)}</strong>
          <small>{pctBp(position.shareBp)} des Portfolios</small>
        </div>
        <div>
          <span className="tech">Kursgewinn</span>
          <strong>{whole(position.gainCents, true)}</strong>
          <small>
            Einstand {whole(position.costCents)}
            {gain !== null && ` · ${pctBp(gain, true)}`}
          </small>
        </div>
      </div>
      {prices.isPending && <LoadingNote what="Kurse" />}
      {prices.isError && (
        <ErrorNote what="Kurse" error={prices.error} onRetry={() => void prices.refetch()} />
      )}
      {prices.data && list.length > 1 && (
        <>
          <PriceChart
            prices={list}
            currency={currency}
            label={`Kursverlauf ${position.name} von ${list[0]?.date.slice(0, 4) ?? ''} bis heute`}
          />
          <div className="legend" aria-hidden="true">
            <span>
              <svg viewBox="0 0 26 8">
                <path className="l-actual" d="M0 4h26" />
              </svg>
              Schlusskurs
            </span>
            <span>
              <i className="pf-hand-key" />
              von Hand eingetragen
            </span>
          </div>
        </>
      )}
      {prices.data && list.length === 0 && (
        <p className="vnote">
          {position.kind === 'p2p'
            ? 'P2P-Kredite haben keinen Börsenkurs; der Wert kommt von der Plattform.'
            : 'Noch keine Kurse gespeichert.'}
        </p>
      )}
      {list.length > 0 && (
        <>
          {/* Focusable, so the keyboard can reach the scrolling sheet on the phone. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div className="pf-recent-box" role="region" aria-label="Letzte Kurse" tabIndex={0}>
            <table className="pf-recent">
              <caption className="tech">Letzte Kurse</caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">Datum</th>
                  <th scope="col">Kurs</th>
                  <th scope="col">Quelle</th>
                </tr>
              </thead>
              <tbody>
                {[...list]
                  .slice(-RECENT)
                  .reverse()
                  .map((row) => (
                    <tr key={row.date}>
                      <td>{`${row.date.slice(8, 10)}.${row.date.slice(5, 7)}.${row.date.slice(0, 4)}`}</td>
                      <td className="pf-r-num">{priceText(row.priceMicro, row.currency)}</td>
                      <td className={cx('pf-r-src', row.source === 'manual' && 'is-hand')}>
                        {SOURCE_LABEL[row.source]}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="vnote">
            Quellen aller {list.length} Kurse: {sourceSummary(list)}. Ein Kurs von Hand gilt vor
            jeder Quelle.
          </p>
        </>
      )}
    </div>
  );
}
