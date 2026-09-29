export type PatternClass = 'want' | 'future' | 'bound';

/** Pattern id for a class fill inside one SVG, e.g. `url(#ch-want)`. */
export const patternFill = (prefix: string, kind: PatternClass): string =>
  `url(#${prefix}-${kind})`;

/**
 * SVG `<defs>` with the hatch patterns: Wunsch 135° (2 px stroke, 5 px repeat), Zukunft cross
 * hatch (45° and 135°, 1.5 px), gebunden 135° in pale ink. Bedarf is a solid fill (`var(--need)`).
 * Hatching belongs to classes and committed money only, never to debts.
 */
export function ClassPatterns({ prefix }: { prefix: string }) {
  return (
    <defs>
      <pattern
        id={`${prefix}-want`}
        width="5"
        height="5"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(-45)"
      >
        <rect width="2" height="5" fill="var(--want)" />
      </pattern>
      <pattern id={`${prefix}-future`} width="5" height="5" patternUnits="userSpaceOnUse">
        <path d="M0 0L5 5M5 0L0 5" stroke="var(--future)" strokeWidth="1.5" />
      </pattern>
      <pattern
        id={`${prefix}-bound`}
        width="5"
        height="5"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(-45)"
      >
        <rect width="1.5" height="5" fill="var(--line-2)" />
      </pattern>
    </defs>
  );
}
