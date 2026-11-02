/** Time limit for PDF worker/preview extraction. Slow CI runners (Windows) raise it via the environment. */
export const PDF_TIME_LIMIT_MS = Number(process.env['BUDGET_PDF_TIME_LIMIT_MS']) || 20_000;
