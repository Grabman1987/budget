import type { SourceFailureCategory } from '@budget/domain';

/** Carries only an allowlisted category; upstream text never crosses this boundary. */
export class SourceReadError extends Error {
  constructor(readonly category: SourceFailureCategory) {
    super('source_failed');
  }
}

export const sourceFailureCategory = (error: unknown): SourceFailureCategory =>
  error instanceof SourceReadError ? error.category : 'http';
