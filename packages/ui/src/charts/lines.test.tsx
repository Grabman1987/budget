// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Band } from './lines';

afterEach(cleanup);

it('steps the band at the next point without changing a subsequent default linear band', () => {
  const points = [
    { x: 10, y0: 20, y1: 30 },
    { x: 40, y0: 50, y1: 60 },
  ];
  const view = render(
    <svg>
      <Band points={points} stepped />
    </svg>,
  );
  const paths = () => [...view.container.querySelectorAll('path')].map((p) => p.getAttribute('d'));
  expect(paths()).toEqual([
    'M10,30L40,30L40,60L40,50L40,20L10,20Z',
    'M10,20L40,20L40,50',
    'M10,30L40,30L40,60',
  ]);
  view.rerender(
    <svg>
      <Band points={points} />
    </svg>,
  );
  expect(paths()).toEqual(['M10,30L40,60L40,50L10,20Z', 'M10,20L40,50', 'M10,30L40,60']);
});
