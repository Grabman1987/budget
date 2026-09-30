export function parseColors(designMd: string): Record<string, string>;
export function parseRadii(designMd: string): Record<string, string>;
export function parseSpacing(designMd: string): Record<string, string>;
export function parseFontSizes(designMd: string): Record<string, string>;
export function generateTokensCss(designMd: string): string;
export function generateScaleTokensCss(designMd: string): string;
