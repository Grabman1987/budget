export const ASSET_TYPES = ['alle', 'wertpapiere', 'krypto', 'p2p'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export const assetType = (value: unknown): AssetType =>
  ASSET_TYPES.includes(value as AssetType) ? (value as AssetType) : 'alle';
export const matchesAsset = (kind: string, art: AssetType) =>
  art === 'alle' ||
  (art === 'krypto'
    ? kind === 'crypto'
    : art === 'p2p'
      ? kind === 'p2p'
      : kind !== 'crypto' && kind !== 'p2p');
