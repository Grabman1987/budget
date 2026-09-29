import type { ComponentProps } from 'react';
import { AppLink } from './app-link';
import { markPanelOpenedInApp } from './panel-state';
import type { PanelId } from './panels';

/** Link that opens a panel on the current page (`?panel=`), keeping the current path. */
export function PanelLink({
  panel,
  onClick,
  ...rest
}: { panel: PanelId } & Omit<ComponentProps<typeof AppLink>, 'to' | 'search'>) {
  return (
    <AppLink
      to="."
      search={{ panel }}
      onClick={(event) => {
        markPanelOpenedInApp();
        onClick?.(event);
      }}
      {...rest}
    />
  );
}
