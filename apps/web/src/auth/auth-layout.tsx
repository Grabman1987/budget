import { TitleBlock } from '@budget/ui';
import type { ReactNode } from 'react';

/** Standalone page for login and first-device setup (outside the app shell, no navigation). */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page" id="main">
      <TitleBlock title={title} {...(subtitle ? { subtitle } : {})} />
      <div className="auth-body">{children}</div>
    </main>
  );
}
