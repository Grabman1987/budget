import {
  useAmountPrivacy,
  formatPrivateEuro as formatEuro,
  ClassPatterns,
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
}: {
  width: number;
  /** Nodes and links; default: the spike's synthetic sample. */
  model?: SankeyModel;
  label?: string;
  height?: number;
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
  const layout = sankeyLayout(columns, links, {
    width,
    height,
    nodeWidth: NODE_WIDTH,
    gap: 9,
    padLeft: labelWidth(first.map((n) => n.name)),
    padRight: labelWidth(last.map((n) => n.name)) + 8,
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label}
      data-testid="sankey-chart"
    >
      <ClassPatterns prefix={prefix} />
      <g>
        {layout.links.map((l) => (
          <path key={`${l.from}-${l.to}`} d={l.d} className={`sk-link l-${l.tone ?? 'inc'}`}>
            <title>{`${l.label ?? ''}: ${eur0(l.value)}`}</title>
          </path>
        ))}
      </g>
      {layout.nodes.map((n) => {
        const first = n.column === 0;
        const tx = first ? n.x - 8 : n.x + n.width + 8;
        const anchor = first ? 'end' : 'start';
        const ty = n.y + n.height / 2;
        const showLabel = n.height >= 9 || n.forceLabel === true;
        const tall = n.height >= 26;
        return (
          <g key={n.id}>
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
              <title>{`${n.name}: ${eur0(n.value)}`}</title>
            </rect>
            {showLabel && (
              <text
                x={tx}
                y={ty + (tall ? -3 : 4)}
                textAnchor={anchor}
                className="svg-label-strong"
              >
                {n.name}
              </text>
            )}
            {showLabel && tall && (
              <text x={tx} y={ty + 13} textAnchor={anchor} className="svg-label">
                {eur0(n.value)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
