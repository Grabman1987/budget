import { Button, CircleNumber, ClassTag, Switch, cx } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { EyeOff, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { EINSTELLUNGEN_KATEGORIEN } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { deleteGroup, sortCategories, type CategoryRow } from './api';
import {
  orderOf,
  moveCategory,
  sameOrder,
  stepCategory,
  stepGroup,
  type Order,
} from './categories-model';
import { CategoryIcon } from './category-icon';
import { CategoryPanel, type PanelState } from './category-panel';
import { KIND_LABEL, STAGES, targetText } from './labels';
import { categoriesQuery, useBudgetWrite } from './use-category-writes';

const CLASS_TEXT = { need: 'Bedarf', want: 'Wunsch', future: 'Zukunft' } as const;

type Drag = { kind: 'category' | 'group'; id: string } | null;

/**
 * Einstellungen › Kategorien: the parts list of groups and categories with class, kind, stage and
 * target. Drag a row (or use ↑ ↓ on its handle) to sort; the panel edits, hides, merges and splits
 * off. Every change is one "Rückgängig".
 */
export function CategoriesPage() {
  const tree = useQuery(categoriesQuery());
  const write = useBudgetWrite();
  const [showHidden, setShowHidden] = useState(false);
  const [panel, setPanel] = useState<PanelState>(null);
  const [drag, setDrag] = useState<Drag>(null);

  const data = tree.data;
  const order = data ? orderOf(data) : [];
  const byId = new Map(data?.categories.map((c) => [c.id, c]));
  const hiddenCount = data?.categories.filter((c) => c.hiddenAt).length ?? 0;

  const saveOrder = (next: Order) => {
    if (sameOrder(next, order)) return;
    void write(
      () => sortCategories(next),
      () => 'Reihenfolge gespeichert.',
    );
  };
  const onDrop = (event: DragEvent, groupId: string, beforeId: string | null) => {
    event.preventDefault();
    if (drag?.kind === 'category') saveOrder(moveCategory(order, drag.id, groupId, beforeId));
    if (drag?.kind === 'group') {
      const rest = order.filter((g) => g.id !== drag.id);
      const at = rest.findIndex((g) => g.id === groupId);
      const moved = order.find((g) => g.id === drag.id);
      if (moved) saveOrder([...rest.slice(0, at), moved, ...rest.slice(at)]);
    }
    setDrag(null);
  };
  const keys = (event: KeyboardEvent, step: (delta: -1 | 1) => Order) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    saveOrder(step(event.key === 'ArrowUp' ? -1 : 1));
  };
  const dropTarget = (groupId: string, beforeId: string | null) => ({
    onDragOver: (e: DragEvent) => drag && e.preventDefault(),
    onDrop: (e: DragEvent) => onDrop(e, groupId, beforeId),
  });

  return (
    <PageFrame meta={EINSTELLUNGEN_KATEGORIEN}>
      <div className="kview">
        <div className="kbar cat-bar">
          <span className="cat-hidden-toggle">
            <span id="show-hidden">
              Ausgeblendete zeigen{hiddenCount > 0 && ` (${hiddenCount})`}
            </span>
            <Switch labelledBy="show-hidden" checked={showHidden} onChange={setShowHidden} />
          </span>
          <span className="spacer" />
          <Button size="sm" variant="ghost" onClick={() => setPanel({ mode: 'group' })}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            Gruppe
          </Button>
          <Button
            size="sm"
            disabled={!data?.groups.length}
            onClick={() => setPanel({ mode: 'edit', groupId: data?.groups[0]?.id ?? '' })}
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            Kategorie anlegen
          </Button>
        </div>
        {tree.isPending && <LoadingNote what="Kategorien" />}
        {tree.isError && (
          <ErrorNote what="Kategorien" error={tree.error} onRetry={() => void tree.refetch()} />
        )}
        {data && (
          <section aria-labelledby="cat-title">
            <h2 id="cat-title" className="sr-only">
              Gruppen und Kategorien
            </h2>
            <p className="panel-sub cat-help">
              Ziehen am Griff sortiert, auch über Gruppen hinweg (mit der Tastatur: Griff
              fokussieren, Pfeil hoch oder runter). Ausgeblendete Kategorien behalten ihr Geld.
            </p>
            <table className="ktable cat-table">
              <caption className="sr-only">Kategorien nach Gruppe</caption>
              <thead>
                <tr>
                  <th className="tech kc-pos" scope="col">
                    Pos.
                  </th>
                  <th className="tech" scope="col">
                    Kategorie
                  </th>
                  <th className="tech kc-num" scope="col">
                    Buchungen
                  </th>
                  <th className="tech kc-act" scope="col">
                    <span className="sr-only">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.map((g, gi) => {
                  const group = data.groups.find((x) => x.id === g.id)!;
                  const rows = g.categoryIds
                    .map((id) => byId.get(id)!)
                    .filter((c) => showHidden || !c.hiddenAt);
                  return (
                    <GroupRows
                      key={g.id}
                      index={gi + 1}
                      id={g.id}
                      name={group.name}
                      count={g.categoryIds.length}
                      rows={rows}
                      dragging={drag}
                      handle={{
                        draggable: true,
                        onDragStart: () => setDrag({ kind: 'group', id: g.id }),
                        onDragEnd: () => setDrag(null),
                        onKeyDown: (e) => keys(e, (d) => stepGroup(order, g.id, d)),
                      }}
                      rowHandle={(c) => ({
                        draggable: true,
                        onDragStart: () => setDrag({ kind: 'category', id: c.id }),
                        onDragEnd: () => setDrag(null),
                        onKeyDown: (e) => keys(e, (d) => stepCategory(order, c.id, d)),
                      })}
                      dropOnGroup={dropTarget(g.id, g.categoryIds[0] ?? null)}
                      dropOnRow={(c) => dropTarget(g.id, c.id)}
                      onRename={() => setPanel({ mode: 'group', group })}
                      onDelete={() =>
                        void write(
                          () => deleteGroup(g.id),
                          () => `Gruppe „${group.name}“ entfernt.`,
                        )
                      }
                      onAdd={() => setPanel({ mode: 'edit', groupId: g.id })}
                      onEdit={(c) => setPanel({ mode: 'edit', groupId: c.groupId, category: c })}
                      target={(c) => {
                        const versions = data.targets.filter((t) => t.categoryId === c.id);
                        return versions[versions.length - 1];
                      }}
                    />
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
      </div>
      {data && (
        <CategoryPanel
          state={panel}
          tree={data}
          onClose={() => setPanel(null)}
          onSwitch={setPanel}
        />
      )}
    </PageFrame>
  );
}

type HandleProps = {
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
};
type DropProps = { onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void };

function Handle({ label, ...props }: HandleProps & { label: string }) {
  return (
    <button type="button" className="icon-btn cat-grip" aria-label={label} {...props}>
      <GripVertical size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

function GroupRows(props: {
  index: number;
  id: string;
  name: string;
  count: number;
  rows: CategoryRow[];
  dragging: Drag;
  handle: HandleProps;
  rowHandle: (c: CategoryRow) => HandleProps;
  dropOnGroup: DropProps;
  dropOnRow: (c: CategoryRow) => DropProps;
  onRename: () => void;
  onDelete: () => void;
  onAdd: () => void;
  onEdit: (c: CategoryRow) => void;
  target: (c: CategoryRow) => Parameters<typeof targetText>[0] | undefined;
}) {
  const { index, name, count, rows, dragging } = props;
  return (
    <>
      <tr className={cx('kgroup', dragging?.id === props.id && 'is-drag')} {...props.dropOnGroup}>
        <td className="kc-pos">
          <span className="cat-pos">
            <Handle label={`Gruppe ${name} verschieben`} {...props.handle} />
            <CircleNumber n={index} size="sm" />
          </span>
        </td>
        <td>
          <span className="grp-title">{name}</span>
          <span className="grp-sub">{count === 1 ? '1 Kategorie' : `${count} Kategorien`}</span>
        </td>
        <td className="kc-num" />
        <td className="kc-act">
          <button
            type="button"
            className="icon-btn"
            aria-label={`Gruppe ${name} umbenennen`}
            onClick={props.onRename}
          >
            <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {count === 0 && (
            <button
              type="button"
              className="icon-btn"
              aria-label={`Gruppe ${name} entfernen`}
              onClick={props.onDelete}
            >
              <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label={`Kategorie in ${name} anlegen`}
            onClick={props.onAdd}
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </td>
      </tr>
      {rows.map((c, i) => {
        const target = props.target(c);
        return (
          <tr
            key={c.id}
            className={cx('krow', c.hiddenAt && 'is-hidden', dragging?.id === c.id && 'is-drag')}
            {...props.dropOnRow(c)}
          >
            <td className="kc-pos">
              <span className="cat-pos">
                <Handle label={`${c.name} verschieben`} {...props.rowHandle(c)} />
                <span className="pos">{`${index}.${i + 1}`}</span>
              </span>
            </td>
            <td>
              <button type="button" className="kname-btn" onClick={() => props.onEdit(c)}>
                <span className="kname-s">
                  <CategoryIcon icon={c.icon} /> {c.name}
                </span>
              </button>
              <span className="kmeta">
                {c.class && <ClassTag kind={c.class}>{CLASS_TEXT[c.class]}</ClassTag>}
                <span>{KIND_LABEL[c.kind]}</span>
                {c.stage && (
                  <span>
                    Stufe {c.stage} · {STAGES[c.stage - 1]?.short}
                  </span>
                )}
                {target && <span>Ziel {targetText(target)}</span>}
                {c.hiddenAt && (
                  <span className="cat-hidden">
                    <EyeOff size={14} strokeWidth={1.75} aria-hidden="true" />
                    ausgeblendet
                  </span>
                )}
              </span>
            </td>
            <td className="kc-num">
              {c.splitCount}
              <span className="cat-unit"> Buchungen</span>
            </td>
            <td className="kc-act">
              <button
                type="button"
                className="icon-btn"
                aria-label={`${c.name} bearbeiten`}
                onClick={() => props.onEdit(c)}
              >
                <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </td>
          </tr>
        );
      })}
    </>
  );
}
