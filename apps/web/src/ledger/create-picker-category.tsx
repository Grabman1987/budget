import { Button, FormDialog } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CategoryPanel, type PanelState } from '../budget/category-panel';
import { categoriesQuery } from '../budget/use-category-writes';

export const CREATE_CATEGORY = '__create-category';

/** Reuse the audited category form without nesting it inside the booking's form. */
export function CreatePickerCategory({
  onSelect,
  onClose,
  excludeIncome = false,
}: {
  onSelect: (id: string) => void;
  onClose: () => void;
  excludeIncome?: boolean;
}) {
  const tree = useQuery(categoriesQuery());
  const [state, setState] = useState<PanelState>(null);
  return createPortal(
    // Portal events still bubble through the booking's React tree.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {tree.data ? (
        <CategoryPanel
          tree={tree.data}
          state={state ?? { mode: 'edit', groupId: tree.data.groups[0]?.id ?? '' }}
          onSwitch={setState}
          onClose={onClose}
          onCreated={(category) => onSelect(category.id)}
          excludeIncome={excludeIncome}
        />
      ) : (
        <FormDialog open title="Kategorie anlegen" onClose={onClose}>
          <div className="bk-body">
            <p role={tree.isError ? 'alert' : 'status'}>
              {tree.isError
                ? 'Kategorien konnten nicht geladen werden.'
                : 'Kategorien werden geladen …'}
            </p>
            {tree.isError && <Button onClick={() => void tree.refetch()}>Erneut versuchen</Button>}
            <Button variant="ghost" onClick={onClose}>
              Schließen
            </Button>
          </div>
        </FormDialog>
      )}
    </div>,
    document.body,
  );
}
