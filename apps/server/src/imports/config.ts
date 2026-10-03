/** Legacy HTTP importer is opt-in for local development/tests, never production. */
export const importHttpEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env['NODE_ENV'] !== 'production' && env['BUDGET_IMPORT_HTTP'] === '1';
