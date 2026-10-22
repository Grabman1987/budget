import type { FxTransferDetail, FxTransferInput, FxTransferPreview } from '@budget/db';
import { request } from '../api/http';

export const previewFxTransfer = (input: FxTransferInput) =>
  request<FxTransferPreview>('POST', '/api/bookings/fx/preview', input);
export const postFxTransfer = (input: FxTransferInput, revision: string, key: string) =>
  request<{ groupId: string; transferId: string; fromBookingId: string; toBookingId: string; feeBookingId: string | null }>(
    'POST', '/api/bookings/fx', { input, revision }, { 'Idempotency-Key': key },
  );
export const fetchFxTransfer = (bookingId: string, asOf: string) =>
  request<FxTransferDetail>('GET', `/api/bookings/fx/${encodeURIComponent(bookingId)}?asOf=${encodeURIComponent(asOf)}`);
