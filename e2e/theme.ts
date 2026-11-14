import type { Page } from '@playwright/test';

/**
 * Switches the root theme the way the specs always did (`data-theme` on <html>) and then waits
 * until every CSS transition started by the switch has finished.
 *
 * Without the wait, a spec that runs without reduced motion can read a half-switched page: `color`
 * flips at once while `background` still runs its `--t-fast` transition, so axe's colour-contrast
 * check sees e.g. dark-theme ink on a light surface (Refs #1064). Only CSS transitions are awaited:
 * looping animations (spinners) never finish and are not part of a theme switch.
 */
export async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate(async (value) => {
    document.documentElement.dataset['theme'] = value;
    // getAnimations() flushes styles first, so the transitions started by the switch are included.
    const transitions = document
      .getAnimations()
      .filter((animation) => animation instanceof CSSTransition);
    await Promise.all(transitions.map((transition) => transition.finished.catch(() => undefined)));
  }, theme);
}
