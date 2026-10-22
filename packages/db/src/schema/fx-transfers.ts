import { sql } from 'drizzle-orm';
import { check, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { id, timestamps } from './common';
import { transfer } from './bookings';

/** Explicit manual FX provenance; ordinary transfer rows retain their equal-currency contract. */
export const transferFx = sqliteTable('transfer_fx', {
  id: id().references(() => transfer.id),
  fromBookingId: text('from_booking_id').notNull(),
  toBookingId: text('to_booking_id').notNull(),
  feeBookingId: text('fee_booking_id'),
  /** Versioned original native facts, quote orientation and separately evidenced fee. */
  factsJson: text('facts_json').notNull(),
  /** Dated EUR reference observations and execution value effect at explicit confirmation. */
  valuationJson: text('valuation_json').notNull(),
  ...timestamps(),
}, (t) => [
  uniqueIndex('transfer_fx_from_uq').on(t.fromBookingId),
  uniqueIndex('transfer_fx_to_uq').on(t.toBookingId),
  uniqueIndex('transfer_fx_fee_uq').on(t.feeBookingId),
  check('transfer_fx_distinct_chk', sql`${t.fromBookingId} <> ${t.toBookingId} AND
    (${t.feeBookingId} IS NULL OR (${t.feeBookingId} <> ${t.fromBookingId} AND ${t.feeBookingId} <> ${t.toBookingId}))`),
  check('transfer_fx_json_chk', sql`json_valid(${t.factsJson}) AND json_valid(${t.valuationJson})`),
]);
