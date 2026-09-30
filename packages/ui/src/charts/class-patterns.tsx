import { useId } from 'react';

export type PatternClass = 'want' | 'future' | 'bound';

/**
 * A pattern id prefix that is unique per component instance. SVG ids are document-global, so a
 * chart that renders twice (or two charts) must not share static ids.
 */
export function usePatternPrefix(name = 'cls'): string {
  return `${name}-${useId().replace(/[^\w-]/g, '')}`;
}

/** Pattern reference for a class fill inside one SVG, e.g. `url(#ch-want)`. */
export const patternFill = (prefix: string, kind: PatternClass): string =>
  `url(#${prefix}-${kind})`;

/**
 * SVG `<defs>` with the hatch patterns: Wunsch 135° (2 px stroke, 5 px repeat), Zukunft cross
 * hatch (two 1.5 px stripes on a 5 px repeat, crossing at 45° and 135°), gebunden 135° in pale
 * ink. Bedarf is a solid fill (`var(--need)`). Hatching belongs to classes and committed money
 * only, never to debts. Get a unique `prefix` from `usePatternPrefix()`.
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
      <pattern
        id={`${prefix}-future`}
        width="5"
        height="5"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="1.5" height="5" fill="var(--future)" />
        <rect width="5" height="1.5" fill="var(--future)" />
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
