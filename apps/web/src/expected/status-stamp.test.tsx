// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { StatusStamp } from './status-stamp';

afterEach(cleanup);

it('labels a struck occurrence "gestrichen", neutral and not as a warning', () => {
  const { container } = render(<StatusStamp status="skipped" alert={false} />);
  expect(screen.getByText('gestrichen')).toBeTruthy();
  expect(container.querySelector('.xp-status')?.classList.contains('is-alert')).toBe(false);
});

it('keeps "ausgefallen" separate from "gestrichen"', () => {
  render(<StatusStamp status="missed" alert />);
  expect(screen.getByText('ausgefallen')).toBeTruthy();
  expect(screen.queryByText('gestrichen')).toBeNull();
});
