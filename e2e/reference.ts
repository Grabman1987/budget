import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Comparison of a region of the running app with the same region of a reference screenshot in
 * `design/screens` (audit D9). The references show the prototype with its sample data, so the
 * comparison is about layout, not about text: both crops are reduced to luminance, strongly blurred
 * (letters melt into a grey tone, frames, rules, fills and box positions survive) and compared
 * pixel by pixel outside the masked rectangles. A region fails when more than `maxDiff` of its
 * unmasked pixels differ by more than `threshold` grey levels.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RegionCheck {
  /** Name used for the diff attachment. */
  name: string;
  /** Path below `design/screens`, e.g. `desktop/plan-monat.webp`. */
  reference: string;
  /** Region in CSS pixels, cut from the reference (and from the live page unless `live` is set). */
  region: Rect;
  /**
   * Where the same element sits on the live page when its position differs on purpose (the phone
   * title strip shows label and value, which is taller than the prototype's). Same size as `region`.
   */
  live?: { x: number; y: number };
  /** Rectangles (relative to the page, not to the region) that are ignored. */
  masks?: Rect[];
  /** Blur radius in px; default 3. */
  blur?: number;
  /** Grey-level difference (0..255) that counts as different; default 40. */
  threshold?: number;
  /** Allowed share of differing pixels; default 0.02. */
  maxDiff?: number;
}

export interface RegionResult {
  ratio: number;
  compared: number;
  diffPng: Buffer;
}

const SCREENS = fileURLToPath(new URL('../design/screens', import.meta.url));

/** Runs the comparison in a scratch page of the same browser (canvas does the decoding). */
async function compare(page: Page, check: RegionCheck, actual: Buffer): Promise<RegionResult> {
  const reference = readFileSync(resolve(SCREENS, check.reference));
  const scratch = await page.context().newPage();
  try {
    await scratch.setContent('<canvas id="c"></canvas>');
    const result = await scratch.evaluate(
      async ({ actualB64, referenceB64, mime, region, masks, blur, threshold }) => {
        const load = (b64: string, type: string) =>
          new Promise<HTMLImageElement>((resolveImage, reject) => {
            const image = new Image();
            image.onload = () => resolveImage(image);
            image.onerror = () => reject(new Error(`cannot decode ${type} image`));
            image.src = `data:${type};base64,${b64}`;
          });
        const [live, ref] = await Promise.all([
          load(actualB64, 'image/png'),
          load(referenceB64, mime),
        ]);
        const { w, h } = region;
        const luminance = (image: HTMLImageElement, sx: number, sy: number): Float32Array => {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('no 2d context');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(image, sx, sy, w, h, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          const out = new Float32Array(w * h);
          for (let i = 0; i < out.length; i++) {
            out[i] =
              0.2126 * (data[i * 4] ?? 0) +
              0.7152 * (data[i * 4 + 1] ?? 0) +
              0.0722 * (data[i * 4 + 2] ?? 0);
          }
          return out;
        };
        // Separable box blur.
        const boxBlur = (src: Float32Array, radius: number): Float32Array => {
          const tmp = new Float32Array(src.length);
          const dst = new Float32Array(src.length);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              let sum = 0;
              let n = 0;
              for (let k = -radius; k <= radius; k++) {
                const xx = x + k;
                if (xx >= 0 && xx < w) {
                  sum += src[y * w + xx] ?? 0;
                  n++;
                }
              }
              tmp[y * w + x] = sum / n;
            }
          }
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              let sum = 0;
              let n = 0;
              for (let k = -radius; k <= radius; k++) {
                const yy = y + k;
                if (yy >= 0 && yy < h) {
                  sum += tmp[yy * w + x] ?? 0;
                  n++;
                }
              }
              dst[y * w + x] = sum / n;
            }
          }
          return dst;
        };
        const a = boxBlur(luminance(live, 0, 0), blur);
        const b = boxBlur(luminance(ref, region.x, region.y), blur);
        const masked = new Uint8Array(w * h);
        for (const m of masks) {
          const x0 = Math.max(0, Math.floor(m.x - region.x));
          const y0 = Math.max(0, Math.floor(m.y - region.y));
          const x1 = Math.min(w, Math.ceil(m.x + m.w - region.x));
          const y1 = Math.min(h, Math.ceil(m.y + m.h - region.y));
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) masked[y * w + x] = 1;
        }
        const out = document.createElement('canvas');
        out.width = w;
        out.height = h;
        const octx = out.getContext('2d');
        if (!octx) throw new Error('no 2d context');
        const img = octx.createImageData(w, h);
        let compared = 0;
        let different = 0;
        for (let i = 0; i < w * h; i++) {
          const delta = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
          const shade = Math.round(b[i] ?? 0);
          let r = shade;
          let g = shade;
          let bl = shade;
          if (masked[i]) {
            bl = 255; // masked: blue tint
          } else {
            compared++;
            if (delta > threshold) {
              different++;
              r = 255;
              g = 0;
              bl = 0;
            }
          }
          img.data[i * 4] = r;
          img.data[i * 4 + 1] = g;
          img.data[i * 4 + 2] = bl;
          img.data[i * 4 + 3] = 255;
        }
        octx.putImageData(img, 0, 0);
        return {
          compared,
          different,
          diff: out.toDataURL('image/png').split(',')[1] ?? '',
        };
      },
      {
        actualB64: actual.toString('base64'),
        referenceB64: reference.toString('base64'),
        mime: check.reference.endsWith('.webp') ? 'image/webp' : 'image/png',
        region: check.region,
        masks: check.masks ?? [],
        blur: check.blur ?? 3,
        threshold: check.threshold ?? 40,
      },
    );
    return {
      ratio: result.compared === 0 ? 0 : result.different / result.compared,
      compared: result.compared,
      diffPng: Buffer.from(result.diff, 'base64'),
    };
  } finally {
    await scratch.close();
  }
}

/** Screenshot the region of the live page, compare, attach the diff and assert. */
export async function expectMatchesReference(page: Page, check: RegionCheck): Promise<number> {
  const { w, h } = check.region;
  const { x, y } = check.live ?? check.region;
  const actual = await page.screenshot({ clip: { x, y, width: w, height: h } });
  const result = await compare(page, check, actual);
  const dump = process.env['REFERENCE_DUMP'];
  if (dump) {
    // Debugging aid: REFERENCE_DUMP=/tmp/refs npx playwright test ... writes live crop and diff.
    mkdirSync(dump, { recursive: true });
    const tag = `${test.info().project.name}-${check.name}`;
    writeFileSync(resolve(dump, `${tag}-live.png`), actual);
    writeFileSync(resolve(dump, `${tag}-diff.png`), result.diffPng);
  }
  await test.info().attach(`${check.name}-live`, { body: actual, contentType: 'image/png' });
  await test
    .info()
    .attach(`${check.name}-diff`, { body: result.diffPng, contentType: 'image/png' });
  test.info().annotations.push({
    type: `diff ${check.name}`,
    description: `${(result.ratio * 100).toFixed(2)} % differ`,
  });
  expect(
    result.ratio,
    `${check.name}: ${(result.ratio * 100).toFixed(2)} % of ${result.compared} px differ from design/screens/${check.reference}`,
  ).toBeLessThanOrEqual(check.maxDiff ?? 0.02);
  return result.ratio;
}
