-- Hand edit: IF EXISTS (drizzle-kit emits a plain DROP INDEX) so a re-run on a migrated copy is harmless.
DROP INDEX IF EXISTS `occurrence_booking_uq`;