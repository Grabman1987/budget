// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PanelHost } from './panel-host';
import type { BookingPanelState } from '../ledger/booking-panel';

let pathname = '/konten/kontakte/synthetic-contact';
let panel: string | undefined = 'buchung';
let openedInApp = false;
const navigate = vi.fn(() => new Promise(() => {}));
const back = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useSearch: () => ({ panel }),
  useParams: () => ({ id: 'synthetic-contact' }),
  useRouter: () => ({ history: { back } }),
  useLocation: (options?: {
    select: (location: { pathname: string; state: object }) => unknown;
  }) => {
    const location = { pathname, state: { panelOpenedInApp: openedInApp } };
    return options ? options.select(location) : location;
  },
}));
vi.mock('../pages/asset-classes-settings', () => ({ AssetClassSettingsPanel: () => null }));
vi.mock('../ledger/booking-panel', () => ({
  BookingPanel: ({ state, onClose }: { state: BookingPanelState; onClose: () => void }) => (
    <>
      <output aria-label="Capture account">
        {state?.mode === 'create' ? state.accountId : ''}
      </output>
      <output aria-label="Capture open">{state ? 'open' : 'closed'}</output>
      <button onClick={onClose}>Saved</button>
    </>
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

it.each([false, true])(
  'closes capture once before navigation reads finish and reopens (in-app: %s)',
  (inApp) => {
    navigate.mockClear();
    back.mockClear();
    openedInApp = inApp;
    panel = 'buchung';
    const view = render(<PanelHost />);
    expect(screen.getByLabelText('Capture open').textContent).toBe('open');
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
    expect(inApp ? back : navigate).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Capture open').textContent).toBe('closed');
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
    expect(inApp ? back : navigate).toHaveBeenCalledOnce();
    panel = undefined;
    view.rerender(<PanelHost />);
    panel = 'buchung';
    view.rerender(<PanelHost />);
    expect(screen.getByLabelText('Capture open').textContent).toBe('open');
    openedInApp = false;
  },
);
