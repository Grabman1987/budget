interface BookingCounterparty {
  payeeName: string | null;
  transferId?: string | null;
  transferAccountName?: string | null;
  memo: string | null;
  amountCents: number;
}

/** Shared read-only label for the register and recent bookings. */
export function bookingCounterparty(booking: BookingCounterparty): string {
  if (booking.payeeName?.trim()) return booking.payeeName;
  if (booking.transferId) {
    return booking.transferAccountName?.trim()
      ? `Umbuchung ${booking.amountCents < 0 ? 'nach' : 'von'} ${booking.transferAccountName}`
      : 'Umbuchung';
  }
  return booking.memo?.trim() || 'Ohne Empfänger';
}
