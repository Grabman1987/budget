/** Application-wide account chart horizon (whole days, zero disables the preview). */
export const DEFAULT_FUTURE_PREVIEW_DAYS = 35;
export const validFuturePreviewDays = (days: unknown): days is number =>
  typeof days === 'number' && Number.isInteger(days) && days >= 0 && days <= 365;
