import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./styles/tokens.css', import.meta.url), 'utf8');
const blocks = [...css.matchAll(/\{([^{}]*)\}/g)].map((match) => match[1]!);
const modes = ['light', 'system dark', 'forced dark', 'print'];
const precision = readFileSync(
  new URL('../../../apps/web/src/shell/precision.css', import.meta.url),
  'utf8',
);
const hero = /\.hero-kpi\.is-positive \{([^}]+)\}/.exec(precision)![1]!;

function rgb(color: string): number[] {
  return color.match(/[a-f\d]{2}/gi)!.map((channel) => parseInt(channel, 16));
}
function luminance(color: number[]) {
  return color.reduce((sum, channel, index) => {
    const value = channel / 255;
    return (
      sum +
      [0.2126, 0.7152, 0.0722][index]! *
        (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    );
  }, 0);
}
function contrast(a: number[], b: number[]) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('Q1 contrast roles', () => {
  for (const [index, block] of blocks.entries()) {
    const token = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(block)![1]!;
    const color = (name: string) => rgb(token(name));

    it(`${modes[index]}: text reaches AA on every normal surface`, () => {
      for (const background of ['ground', 'ground-2', 'surface', 'surface-2', 'raised'])
        for (const foreground of ['ink', 'ink-2', 'ink-3'])
          expect(
            contrast(color(foreground), color(background)),
            `${foreground} on ${background}`,
          ).toBeGreaterThanOrEqual(4.5);
      for (const [foreground, background] of [
        ['on-primary', 'primary'],
        ['on-primary', 'primary-hover'],
        ['on-good', 'good'],
        ['on-good', 'good-hover'],
        ['on-good-soft', 'good-soft'],
      ])
        expect(
          contrast(color(foreground!), color(background!)),
          `${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
    });

    it(`${modes[index]}: stronger text stays readable on hover and selection tints`, () => {
      for (const background of ['surface', 'surface-2', 'ground-2']) {
        for (const tint of ['tint', 'tint-2']) {
          const [red, green, blue, alpha] = token(tint)
            .match(/[\d.]+/g)!
            .map(Number);
          const base = color(background);
          const mixed = [red!, green!, blue!].map(
            (channel, i) => channel * alpha! + base[i]! * (1 - alpha!),
          );
          expect(
            contrast(color('ink-2'), mixed),
            `ink-2 on ${tint}/${background}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it(`${modes[index]}: controls and positive data marks reach 3:1`, () => {
      for (const background of ['ground', 'ground-2', 'surface', 'surface-2', 'raised'])
        for (const foreground of ['rule-strong', 'line-2', 'good'])
          expect(
            contrast(color(foreground), color(background)),
            `${foreground} on ${background}`,
          ).toBeGreaterThanOrEqual(3);
    });

    it(`${modes[index]}: positive hero metadata and controls keep contrast after local remapping`, () => {
      const background = color('good');
      const foreground = color('on-good');
      for (const [name, minimum] of [
        ['ink-2', 4.5],
        ['ink-3', 4.5],
        ['line-2', 3],
        ['rule-strong', 3],
      ] as const) {
        const alpha =
          Number(
            new RegExp(`--${name}: color-mix\\(in srgb, var\\(--on-good\\) (\\d+)%`).exec(hero)![1],
          ) / 100;
        const mixed = foreground.map(
          (channel, i) => channel * alpha + background[i]! * (1 - alpha),
        );
        expect(contrast(mixed, background), `${name} on positive hero`).toBeGreaterThanOrEqual(
          minimum,
        );
      }
    });
  }
});
