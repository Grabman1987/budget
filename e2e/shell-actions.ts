import { expect, type Locator, type Page } from '@playwright/test';

export interface ShellControls {
  kind: 'desktop' | 'avatar' | 'search';
  privacy: Locator;
  theme: Locator;
  entry?: Locator;
  container?: Locator;
  close: () => Promise<void>;
}

/** Existing desktop controls, phone avatar where present, otherwise S3 ON Search utilities. */
export async function openShellControls(page: Page, touch = false): Promise<ShellControls> {
  const activate = (control: Locator) => (touch ? control.tap() : control.click());
  await page.locator('.app').waitFor({ state: 'visible' });
  await page.locator('.m-head').waitFor({ state: 'attached' });
  if (!(await page.locator('.m-head').isVisible())) {
    return {
      kind: 'desktop',
      privacy: page
        .locator('.topbar')
        .getByRole('button', { name: 'Beträge verbergen', exact: true }),
      theme: page.locator('.sidebar-foot').getByTitle('Hell/Dunkel umschalten', { exact: true }),
      close: () => Promise.resolve(),
    };
  }
  const avatar = page.locator('.m-profile > summary');
  if (await avatar.isVisible()) {
    const container = page.locator('.m-profile');
    const openedHere = (await container.getAttribute('open')) === null;
    if (openedHere) await activate(avatar);
    await expect(container).toHaveAttribute('open', '');
    const privacy = container.getByRole('button', { name: 'Beträge verbergen', exact: true });
    const theme = container.getByTitle('Hell/Dunkel umschalten', { exact: true });
    return {
      kind: 'avatar',
      entry: avatar,
      container,
      privacy,
      theme,
      close: async () => {
        if (!openedHere) return;
        if ((await container.getAttribute('open')) !== null) await activate(avatar);
        await expect(container).not.toHaveAttribute('open', '');
      },
    };
  }
  // Missing legacy/Hoje avatar is a failure, not permission to silently choose another control.
  await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
  expect(new URL(page.url()).pathname).not.toBe('/');
  const entry = page.locator('.m-head').getByRole('button', { name: 'Suchen', exact: true });
  const container = page.getByRole('dialog', { name: 'Suchen', exact: true });
  const openedHere = !(await container.isVisible());
  if (openedHere) await activate(entry);
  await expect(container).toBeVisible();
  const utilities = container.getByRole('group', { name: 'Darstellung', exact: true });
  const privacy = utilities.getByRole('button', { name: 'Beträge verbergen', exact: true });
  const theme = utilities.getByTitle('Hell/Dunkel umschalten', { exact: true });
  await expect(privacy).toBeVisible();
  return {
    kind: 'search',
    entry,
    container,
    privacy,
    theme,
    close: async () => {
      if (!openedHere) return;
      if (await container.isVisible())
        await activate(container.getByRole('button', { name: 'Schließen', exact: true }));
      await expect(container).toBeHidden();
    },
  };
}

/** Keep the caller's exact click/tap and assertions; close only a surface this helper opened. */
export async function withShellControls(
  page: Page,
  action: (controls: ShellControls) => Promise<void>,
  touch = false,
) {
  const controls = await openShellControls(page, touch);
  try {
    await action(controls);
  } finally {
    await controls.close();
  }
}
