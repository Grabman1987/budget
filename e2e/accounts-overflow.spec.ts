import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './isolated-ledger';

/**
 * /konten at tablet widths (768 to 900 px) with many accounts and very long names must not push the
 * page sideways. Synthetic names only; the isolated ledger starts empty.
 */
async function create(request: APIRequestContext, origin: string, data: Record<string, unknown>) {
  const response = await request.post(`${origin}/api/accounts`, { headers: { origin }, data });
  expect(response.ok(), await response.text()).toBe(true);
}

const WORD = 'Verbindlichkeitsfinanzierungsvertrag';
const LONG = `${WORD} Zweitwohnsitz Modernisierung`; // 69 characters, names are limited to 80
const TYPES = [
  ['checking', 'budget', true],
  ['savings', 'reserve', true],
  ['credit_card', 'budget', true],
  ['loan', 'debt', false],
  ['brokerage', 'investment', false],
  ['other_liability', 'debt', false],
] as const;

test('Konten stays inside the page at 768 to 900 px with long account names', async ({
  page,
  request,
  isolatedLedger,
}) => {
  test.setTimeout(120_000);
  const origin = isolatedLedger.origin;
  for (let i = 0; i < 24; i++) {
    const [type, role, onBudget] = TYPES[i % TYPES.length]!;
    await create(request, origin, {
      name:
        i % 3 === 0
          ? `${LONG} ${i}`
          : i % 3 === 1
            ? `${WORD}${WORD.slice(0, 30)}${i}`
            : `Konto ${i}`,
      type,
      role,
      onBudget,
      openingDate: '2026-09-01',
      openingBalanceCents: type === 'loan' || type === 'other_liability' ? -1_234_567 : 7_654_321,
      ...(type === 'loan' ? { interestRateBp: 450, installmentCents: 41_200 } : {}),
    });
  }
  for (const path of ['/konten', '/einstellungen/konten']) {
    for (const width of [768, 800, 834, 900]) {
      await page.setViewportSize({ width, height: 1024 });
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: 'Konten', exact: true }).first(),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const offenders = await page.evaluate(() => {
        const limit = window.innerWidth;
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && (r.right > limit + 1 || r.left < -1))
            out.push(`${el.tagName}.${el.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
        }
        return {
          scroll: document.documentElement.scrollWidth - limit,
          offenders: out.slice(0, 8),
        };
      });
      expect(offenders, `${path} at ${width}px`).toEqual({ scroll: 0, offenders: [] });
    }
  }
});
