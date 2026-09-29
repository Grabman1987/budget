import { afterEach } from 'vitest';

// React Testing Library only in DOM test files (`// @vitest-environment jsdom`).
afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
