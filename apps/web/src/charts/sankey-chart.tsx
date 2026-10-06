import {
  useAmountPrivacy,
  maskMoneyText,
  formatPrivateEuro as formatEuro,
  ClassPatterns,
  ChartSvg,
  ChartValues,
  patternFill,
  usePatternPrefix,
} from '@budget/ui';
import { cents } from '@budget/domain/money';
import { sankeyLayout, type SankeyLink, type SankeyNode } from './sankey-layout';
import {
  classColumn,
  classLinks,
  groupColumn,
  groupLinks,
  incomeColumn,
  incomeLinks,
  poolColumn,
} from './sankey-data';
import './sankey-chart.css';

const HEIGHT = 340;
const NODE_WIDTH = 10;
const eur0 = (v: number) => formatEuro(cents(Math.round(v)), { cents: false });
/** Rough label width in px for margin sizing (Barlow Semi Condensed, 13 px, semibold). */
const labelWidth = (names: string[]) => Math.max(...names.map((n) => n.length)) * 6.6 + 18;

/**
 * Geldfluss: income kinds into one pool, from there to classes and groups.
 * Own SVG; ribbons are filled paths, node/link tones follow the blueprint class colours.
 * Ported from `sankey` in `design/prototype/reports-core.js`; phone width drops the group column.
 */
export interface SankeyModel {
  /** Columns left to right: sources, pool, classes, groups. */
  columns: SankeyNode[][];
  links: SankeyLink[];
}

/** The synthetic sample of the chart spike. */
export const SAMPLE_SANKEY: SankeyModel = {
  columns: [incomeColumn, poolColumn, classColumn, groupColumn],
  links: [...incomeLinks, ...classLinks, ...groupLinks],
};

const LABEL = 'Geldfluss: Einnahmenarten in einen Topf, von dort zu Klassen und Gruppen';

export function SankeyChart({
  width,
  model = SAMPLE_SANKEY,
  label = LABEL,
  height = HEIGHT,
  period = 'Zeitraum',
}: {
  width: number;
  /** Nodes and links; default: the spike's synthetic sample. */
  model?: SankeyModel;
  label?: string;
  height?: number;
  period?: string;
}) {
  useAmountPrivacy();
  // Class nodes as in the prototype: Bedarf solid, Wunsch and Zukunft hatched with an outline.
  const prefix = usePatternPrefix('sk');
  if (width <= 0) return null;
  const narrow = width < 600 && model.columns.length > 3;
  // Phone width: the last column (groups) stays in the parts list below the chart.
  const columns = narrow ? model.columns.slice(0, -1) : model.columns;
  const dropped = new Set(narrow ? (model.columns.at(-1) ?? []).map((n) => n.id) : []);
  const links = model.links.filter((l) => !dropped.has(l.to));
  const first = columns[0] ?? [];
  const last = columns[columns.length - 1] ?? [];
  if (first.length === 0) return null;
  const total = first.reduce((sum, node) => sum + node.value, 0);
  const share = (value: number) =>
    new Intl.NumberFormat('de-AT', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(total > 0 ? value / total : 0);
  if (width < 600) {
    const stages = model.columns.slice(0, 3);
    const nodes = stages.flat();
    return (
      <div data-testid="sankey-chart" role="region" aria-label={maskMoneyText(label)}>
        <ChartValues
          label={label}
          points={nodes.map((node) => ({
            x: 50,
            date: period,
            series: [
              {
                name: node.name,
                value: formatEuro(cents(node.value)),
                className: `sk-node n-${node.tone ?? 'inc'}`,
              },
              { name: 'Anteil an Verfügbar', value: share(node.value) },
            ],
          }))}
        >
          <ol className="sk-phone" aria-label="Geldfluss nach Stufen">
            {stages.map((stage, i) => (
              <li key={i}>
                <strong className="tech">
                  {['Zuflüsse', 'Verfügbarer Topf', 'Verwendung'][i]}
                </strong>
                <ul>
                  {stage.map((node, j) => (
                    <li key={node.id} data-chart-point={stages.slice(0, i).flat().length + j}>
                      <span>
                        <i
                          className={`sk-phone-swatch n-${node.tone ?? 'inc'}`}
                          aria-hidden="true"
                        />
                        {node.name}
                      </span>
                      <strong>
                        {eur0(node.value)}
                        <small>{share(node.value)}</small>
                      </strong>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </ChartValues>
      </div>
    );
  }
  const layout = sankeyLayout(columns, links, {
    width,
    height,
    nodeWidth: NODE_WIDTH,
    gap: 9,
    padLeft: labelWidth(first.map((n) => n.name)),
    padRight:
      Math.max(
        labelWidth(last.map((n) => `${n.name} · ${eur0(n.value)} · ${share(n.value)}`)),
        155,
      ) + 8,
  });

  return (
    <ChartSvg
      width={width}
      height={height}
      label={label}
      testId="sankey-chart"
      crosshair={false}
      points={[
        ...layout.nodes.map((n) => ({
          x: n.x,
          date: period,
          series: [
            {
              name: n.name,
              value: formatEuro(cents(n.value)),
              className: `sk-node n-${n.tone ?? 'inc'}`,
            },
            {
              name: 'Anteil an Verfügbar',
              value: share(n.value),
            },
          ],
        })),
        ...layout.links.map((l) => ({
          x: 0,
          date: period,
          series: [
            {
              name:
                l.label ??
                `${layout.nodes.find((n) => n.id === l.from)?.name} → ${layout.nodes.find((n) => n.id === l.to)?.name}`,
              value: formatEuro(cents(l.value)),
              className: `sk-node n-${l.tone ?? 'inc'}`,
            },
            {
              name: 'Anteil an Verfügbar',
              value: share(l.value),
            },
          ],
        })),
      ]}
    >
      <ClassPatterns prefix={prefix} />
      <g>
        {layout.links.map((l, i) => (
          <path
            data-chart-point={layout.nodes.length + i}
            key={`${l.from}-${l.to}`}
            d={l.d}
            className={`sk-link l-${l.tone ?? 'inc'}`}
          >
            <title>{`${l.label ?? ''}: ${eur0(l.value)}`}</title>
          </path>
        ))}
      </g>
      {layout.nodes.map((n, i) => {
        const first = n.column === 0;
        const tx = first ? n.x - 8 : n.x + n.width + 8;
        const anchor = first ? 'end' : 'start';
        const ty = n.y + n.height / 2;
        const showLabel = n.height >= 9 || n.forceLabel === true;
        const tall = n.height >= 26;
        return (
          <g key={n.id} data-chart-point={i}>
            <rect
              x={n.x}
              y={n.y}
              width={n.width}
              height={n.height}
              className={`sk-node${n.tone && n.tone !== 'inc' ? ` n-${n.tone}` : ''}`}
              style={
                n.tone === 'want' || n.tone === 'future'
                  ? {
                      fill: patternFill(prefix, n.tone),
                      stroke: `var(--${n.tone})`,
                      strokeWidth: 1,
                    }
                  : undefined
              }
            >
              <title>{`${n.name}: ${eur0(n.value)} · ${share(n.value)}`}</title>
            </rect>
            {showLabel && (
              <text
                x={tx}
                y={ty + (tall ? -3 : 4)}
                textAnchor={anchor}
                className="svg-label-strong"
              >
                {n.name}
                {!tall && n.column >= 2 ? ` · ${eur0(n.value)} · ${share(n.value)}` : ''}
              </text>
            )}
            {showLabel && tall && (
              <text x={tx} y={ty + 13} textAnchor={anchor} className="svg-label">
                {eur0(n.value)}
                {n.column >= 2 ? ` · ${share(n.value)}` : ''}
              </text>
            )}
          </g>
        );
      })}
    </ChartSvg>
  );
}
