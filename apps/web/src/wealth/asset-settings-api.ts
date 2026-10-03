import type { AssetClassRow, SecurityRecord, TargetSetView, TargetTierView } from '@budget/db';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import type { WriteResult } from '../ledger/types';

export type { TargetSetView, TargetTierView } from '@budget/db';

export interface AssetClassListing extends AssetClassRow {
  inUse: boolean;
}

export const assetClassListQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'asset-classes', 'settings'],
    retry: false,
    queryFn: () =>
      request<{ assetClasses: AssetClassListing[]; targetSet: TargetSetView }>(
        'GET',
        '/api/asset-classes',
      ),
  });

export const targetTiersQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'asset-tiers'],
    retry: false,
    queryFn: () =>
      request<{ tiers: TargetTierView[]; active: TargetSetView }>(
        'GET',
        '/api/asset-classes/tiers',
      ),
  });

export const securityListQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'instruments', 'settings'],
    retry: false,
    queryFn: () => request<{ securities: SecurityRecord[] }>('GET', '/api/securities'),
  });

export const createAssetClass = (name: string) =>
  request<{ assetClass: AssetClassRow } & WriteResult>('POST', '/api/asset-classes', { name });

export const renameAssetClass = (id: string, name: string) =>
  request<{ assetClass: AssetClassRow } & WriteResult>(
    'PATCH',
    `/api/asset-classes/${encodeURIComponent(id)}`,
    { name },
  );

export const orderAssetClasses = (ids: string[]) =>
  request<{ order: string[] } & WriteResult>('PATCH', '/api/asset-classes/order', { ids });

export const assignSecurityClass = (securityId: string, assetClassId: string | null) =>
  request<{ security: SecurityRecord } & WriteResult>(
    'PATCH',
    `/api/securities/${encodeURIComponent(securityId)}`,
    { assetClassId },
  );

export interface TierDraftInput {
  upToCents: number | null;
  targets: { assetClassId: string; targetShareBp: number; bandBp?: number }[];
}

export const saveTargetTiers = (tiers: TierDraftInput[]) =>
  request<{ tiers: TargetTierView[]; active: TargetSetView } & WriteResult>(
    'PUT',
    '/api/asset-classes/tiers',
    { tiers },
  );
