// @vitest-environment jsdom
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { SETTINGS_GROUPS } from '../nav/areas';
import { SettingsBack, SettingsNav } from './settings-nav';

afterEach(cleanup);

/** Renders the component inside a router that knows every settings path. */
async function renderInRouter(node: React.ReactNode, at = '/einstellungen') {
  const root = createRootRoute({ component: () => node });
  const paths = ['/einstellungen', ...SETTINGS_GROUPS.flatMap((g) => g.items.map((i) => i.to))];
  const router = createRouter({
    routeTree: root.addChildren(
      paths.map((path) => createRoute({ getParentRoute: () => root, path })),
    ),
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findAllByRole('link');
}

describe('SettingsNav', () => {
  it('shows the groups with their headings and every page as a link', async () => {
    await renderInRouter(<SettingsNav variant="rail" />);
    const nav = screen.getByRole('navigation', { name: 'Einstellungen' });
    for (const group of SETTINGS_GROUPS) {
      const list = within(nav).getByRole('list', { name: group.label });
      const links = within(list).getAllByRole('link');
      expect(links.map((link) => link.textContent)).toEqual(group.items.map((i) => i.label));
      links.forEach((link, index) =>
        expect(link.getAttribute('href')).toBe(group.items[index]?.to),
      );
    }
  });

  it('marks only the open page with aria-current', async () => {
    await renderInRouter(<SettingsNav variant="rail" />, '/einstellungen/datenquellen');
    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.textContent)).toEqual(['Datenquellen']);
  });

  it('marks nothing on the index', async () => {
    await renderInRouter(<SettingsNav variant="index" />);
    expect(
      screen.getAllByRole('link').filter((link) => link.hasAttribute('aria-current')),
    ).toHaveLength(0);
  });

  it('is reachable by keyboard in reading order', async () => {
    await renderInRouter(<SettingsNav variant="rail" />);
    const user = userEvent.setup();
    const expected = SETTINGS_GROUPS.flatMap((group) => group.items.map((item) => item.label));
    for (const label of expected) {
      await user.tab();
      expect(document.activeElement?.textContent).toBe(label);
    }
  });
});

describe('SettingsBack', () => {
  it('links back to the index and names the open page', async () => {
    await renderInRouter(<SettingsBack current="sicherheit" />);
    expect(screen.getByRole('link', { name: 'Einstellungen' }).getAttribute('href')).toBe(
      '/einstellungen',
    );
    expect(screen.getByText('Sicherheit')).toBeTruthy();
  });
});
