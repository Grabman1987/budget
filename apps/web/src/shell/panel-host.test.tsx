// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PanelHost } from './panel-host';
import type { BookingPanelState } from '../ledger/booking-panel';

let pathname = '/konten/kontakte/synthetic-contact';
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({ panel: 'buchung' }),
  useParams: () => ({ id: 'synthetic-contact' }),
  useRouter: () => ({ history: { back: vi.fn() } }),
  useLocation: (options?: {
    select: (location: { pathname: string; state: object }) => unknown;
  }) => {
    const location = { pathname, state: {} };
    return options ? options.select(location) : location;
  },
}));
vi.mock('../pages/asset-classes-settings', () => ({ AssetClassSettingsPanel: () => null }));
vi.mock('../ledger/booking-panel', () => ({
  BookingPanel: ({ state }: { state: BookingPanelState }) => (
    <output aria-label="Capture account">{state?.mode === 'create' ? state.accountId : ''}</output>
  ),
}));
it.each([
  '/konten/kontakte/synthetic-contact',
  '/konten/posteingang/synthetic-contact',
  '/konten/synthetic-contact',
])('passes account context only from an account page: %s', (path) => {
  pathname = path;
  render(<PanelHost />);
  expect(screen.getByLabelText('Capture account').textContent).toBe(
    path === '/konten/synthetic-contact' ? 'synthetic-contact' : '',
  );
});
