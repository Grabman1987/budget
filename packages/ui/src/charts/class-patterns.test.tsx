// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClassPatterns, patternFill, usePatternPrefix } from './class-patterns';

function Chart() {
  const prefix = usePatternPrefix();
  return (
    <svg>
      <ClassPatterns prefix={prefix} />
      <rect data-testid="future" fill={patternFill(prefix, 'future')} />
      <rect data-testid="want" fill={patternFill(prefix, 'want')} />
    </svg>
  );
}

const idOf = (fill: string | null) => /^url\(#(.+)\)$/.exec(fill ?? '')?.[1];

describe('ClassPatterns', () => {
  it('draws Zukunft as two crossed 1.5 px stripes on a 5 px repeat, rotated 45°', () => {
    const { container } = render(<Chart />);
    const pattern = container.querySelector('pattern[id$="-future"]') as SVGPatternElement;
    expect(pattern.getAttribute('width')).toBe('5');
    expect(pattern.getAttribute('height')).toBe('5');
    expect(pattern.getAttribute('patternTransform')).toBe('rotate(45)');
    const stripes = Array.from(pattern.querySelectorAll('rect')).map(
      (r) => `${r.getAttribute('width')}x${r.getAttribute('height')}`,
    );
    expect(stripes.sort()).toEqual(['1.5x5', '5x1.5']);
    for (const r of pattern.querySelectorAll('rect')) {
      expect(r.getAttribute('fill')).toBe('var(--future)');
    }
  });

  it('keeps Wunsch (2 px) and gebunden (1.5 px) as single 135° stripes on a 5 px repeat', () => {
    const { container } = render(<Chart />);
    const want = container.querySelector('pattern[id$="-want"] rect') as SVGRectElement;
    expect(want.getAttribute('width')).toBe('2');
    const bound = container.querySelector('pattern[id$="-bound"] rect') as SVGRectElement;
    expect(bound.getAttribute('width')).toBe('1.5');
  });

  it('fills reference existing pattern ids', () => {
    const { container, getByTestId } = render(<Chart />);
    for (const kind of ['future', 'want']) {
      const id = idOf(getByTestId(kind).getAttribute('fill'));
      expect(id).toBeTruthy();
      expect(container.querySelector(`pattern[id="${id}"]`)).toBeTruthy();
    }
  });

  it('generates unique pattern ids when the chart renders twice', () => {
    const { container } = render(
      <>
        <Chart />
        <Chart />
      </>,
    );
    const ids = Array.from(container.querySelectorAll('pattern')).map((p) => p.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    // Ids are safe inside url(#…).
    for (const id of ids) expect(id).toMatch(/^[\w-]+$/);
  });
});
