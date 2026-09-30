import type { ComponentProps } from 'react';
import { AppLink } from './app-link';
import type { PanelId } from './panels';

/**
 * Link that opens a panel on the current page (`?panel=`). Keeps the current path and every other
 * search param, and marks the new history entry so closing the panel can step back.
 */
export function PanelLink({
  panel,
  ...rest
}: { panel: PanelId } & Omit<ComponentProps<typeof AppLink>, 'to' | 'search' | 'state'>) {
  return (
    <AppLink
      to="."
      search={(prev) => ({ ...prev, panel })}
      state={{ panelOpenedInApp: true }}
      {...rest}
    />
  );
}
