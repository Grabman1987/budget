import type { Locator, Page } from '@playwright/test';
import { MIN_TARGET_PX } from './ledger-helpers';

export async function compactControls(page: Page) {
  return page.evaluate(
    () =>
      document.querySelector('[data-budget-redesign="1"]') !== null &&
      matchMedia('(pointer: fine) and (min-width: 1024px)').matches,
  );
}

/** Literal #1004 geometry, selected by the actual input mode rather than the project name. */
export async function minimumControlHeight(target: Locator, fallback = MIN_TARGET_PX) {
  return target.evaluate((element, originalMinimum) => {
    const compact =
      document.querySelector('[data-budget-redesign="1"]') !== null &&
      matchMedia('(pointer: fine) and (min-width: 1024px)').matches;
    if (!compact) return originalMinimum;
    if (element.matches('input.input, select.select, .global-search-launch, .review-pill'))
      return 38;
    if (
      element.matches(
        '.btn-sm, .btn-xs, .plan-add, .seg:not(.bk-kind) button, .price-history-ranges button',
      )
    )
      return 34;
    if (element.matches('.btn, .month-switch .icon-btn, .topbar .icon-btn')) return 36;
    return originalMinimum;
  }, fallback);
}

export async function minimumControlWidth(target: Locator, fallback = MIN_TARGET_PX) {
  if (!(await compactControls(target.page()))) return fallback;
  return (await target.evaluate((element) =>
    element.matches('.month-switch .icon-btn, .topbar .icon-btn'),
  ))
    ? 36
    : fallback;
}

/** Keeps width and containment assertions independent from the compact height contract. */
export async function controlBoxes(targets: Locator) {
  return Promise.all(
    (await targets.all()).map(async (target) => ({
      ...(await target.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          name: element.getAttribute('aria-label') ?? element.textContent ?? element.tagName,
        };
      })),
      minimumHeight: await minimumControlHeight(target),
      minimumWidth: await minimumControlWidth(target),
    })),
  );
}
