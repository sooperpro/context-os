import {
  closestCenter,
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";
import { createContext, use, useRef, type CSSProperties, type ReactNode } from "react";
import { DragIndicatorIcon } from "@/components/ui/icons";

/*
 * Drag to reorder (prototype: rows reorder by their ⋮⋮ handle). Works with a mouse, touch or the
 * keyboard: focus the handle, press Space to pick the row up, the arrow keys to move it (into the
 * next group too) and Space to drop it; Escape cancels. Screen readers hear each step. Rows still
 * offer a way to move without dragging (a menu), and the handle shows on hover or focus.
 */

/** One reorderable group: a list, or one of several (stages) that rows can move between. */
export interface SortableGroupData<T> {
  id: string;
  label: string;
  items: T[];
}

/** What a row puts on its own element so it can be dragged by its handle. */
export interface SortableRow {
  /** Attach to the row's root element. */
  setRow: (element: HTMLElement | null) => void;
  style: CSSProperties;
  /** Put on the row's root: shows the handle while the row is hovered or focused. */
  className: string;
  handle: SortableHandle;
}

export interface SortableHandle {
  /** Attach to the handle element (it's what a keyboard user focuses). */
  setActivator: (element: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  dragging: boolean;
  disabled: boolean;
}

interface Scope {
  getId: (item: unknown) => string;
  disabled: boolean;
}
const ScopeContext = createContext<Scope | null>(null);

/**
 * The drag area: one or several groups (`SortableGroup`) whose rows can be reordered, and moved
 * between groups when there are several. `onChange` gets every group's new order, as it changes.
 */
export function SortableScope<T>({
  groups,
  getId,
  getLabel,
  onChange,
  disabled = false,
  children,
}: {
  groups: Array<SortableGroupData<T>>;
  getId: (item: T) => string;
  /** How a row is named in announcements: its title. */
  getLabel: (item: T) => string;
  onChange: (groups: Array<SortableGroupData<T>>) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const sensors = useSensors(
    // A small move starts a drag, so clicking the handle doesn't.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // The order when the drag started, to put back if it's cancelled.
  const before = useRef<Array<SortableGroupData<T>> | null>(null);
  const several = groups.length > 1;
  const groupOf = (id: UniqueIdentifier) =>
    groups.find((group) => group.id === id || group.items.some((item) => getId(item) === id));
  const name = (id: UniqueIdentifier) => {
    const item = groups.flatMap((group) => group.items).find((entry) => getId(entry) === id);
    return item ? `“${getLabel(item)}”` : "The item";
  };
  const where = (id: UniqueIdentifier) => {
    const group = groupOf(id);
    if (!group) return "outside the list";
    const index = group.items.findIndex((item) => getId(item) === id);
    const position = `position ${index < 0 ? group.items.length : index + 1} of ${group.items.length}`;
    return several ? `${position} in ${group.label}` : position;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}, in ${where(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${name(active.id)} moved to ${where(over.id)}.`
        : `${name(active.id)} is outside the list.`,
    onDragEnd: ({ active, over }) =>
      over ? `${name(active.id)} dropped in ${where(over.id)}.` : `${name(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`,
  };

  // Into another group as soon as it's over it, so the row shows where it will land.
  const over = ({ active, over: target }: DragOverEvent) => {
    if (!target) return;
    const from = groupOf(active.id);
    const to = groupOf(target.id);
    if (!from || !to || from.id === to.id) return;
    const item = from.items.find((entry) => getId(entry) === active.id);
    if (!item) return;
    const index = to.items.findIndex((entry) => getId(entry) === target.id);
    onChange(
      groups.map((group) =>
        group.id === from.id
          ? { ...group, items: group.items.filter((entry) => getId(entry) !== active.id) }
          : group.id === to.id
            ? {
                ...group,
                items: [
                  ...group.items.slice(0, index < 0 ? group.items.length : index),
                  item,
                  ...group.items.slice(index < 0 ? group.items.length : index),
                ],
              }
            : group,
      ),
    );
  };
  const end = ({ active, over: target }: DragEndEvent) => {
    before.current = null;
    if (!target || active.id === target.id) return;
    const group = groupOf(active.id);
    if (!group || groupOf(target.id)?.id !== group.id) return;
    const ids = group.items.map(getId);
    const to = ids.indexOf(String(target.id));
    if (to < 0) return;
    onChange(
      groups.map((entry) =>
        entry.id === group.id
          ? { ...entry, items: arrayMove(entry.items, ids.indexOf(String(active.id)), to) }
          : entry,
      ),
    );
  };

  return (
    <ScopeContext value={{ getId: getId as (item: unknown) => string, disabled }}>
      <DndContext
        sensors={sensors}
        collisionDetection={several ? closestCorners : closestCenter}
        modifiers={
          several ? [restrictToVerticalAxis] : [restrictToVerticalAxis, restrictToParentElement]
        }
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: several
              ? "To move it, press Space or Enter to pick it up, use the up and down arrow keys to move it, also into the next stage, then press Space or Enter to drop it. Press Escape to cancel."
              : "To reorder, press Space or Enter to pick it up, use the up and down arrow keys to move it, then press Space or Enter to drop it. Press Escape to cancel.",
          },
        }}
        onDragStart={() => {
          before.current = groups;
        }}
        onDragOver={over}
        onDragEnd={end}
        onDragCancel={() => {
          if (before.current) onChange(before.current);
          before.current = null;
        }}
      >
        {children}
      </DndContext>
    </ScopeContext>
  );
}

/**
 * One group's rows. `children` renders each row and puts `row.setRow`, `row.style` and
 * `row.className` on the row's own element, so list styles that rely on direct children still
 * apply. `empty` shows (and takes drops) while the group has no rows.
 */
export function SortableGroup<T>({
  id,
  items,
  label,
  as: Tag = "ol",
  className,
  empty,
  children,
}: {
  id: string;
  items: T[];
  /** The list's accessible name. */
  label: string;
  as?: "ol" | "div";
  className?: string;
  empty?: ReactNode;
  children: (item: T, index: number, row: SortableRow) => ReactNode;
}) {
  const scope = use(ScopeContext);
  if (!scope) throw new Error("SortableGroup must be inside a SortableScope");
  const { setNodeRef } = useDroppable({ id, disabled: scope.disabled });
  const ids = items.map((item) => scope.getId(item));
  return (
    <SortableContext id={id} items={ids} strategy={verticalListSortingStrategy}>
      <Tag
        ref={setNodeRef}
        aria-label={label}
        {...(Tag === "div" ? { role: "list" } : {})}
        className={cn("flex flex-col gap-0.5", className)}
      >
        {items.length
          ? items.map((item, index) => (
              <SortableItem key={ids[index]} id={ids[index]!} disabled={scope.disabled}>
                {(row) => children(item, index, row)}
              </SortableItem>
            ))
          : empty}
      </Tag>
    </SortableContext>
  );
}

function SortableItem({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: (row: SortableRow) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  return children({
    setRow: setNodeRef,
    style: {
      transform: CSS.Translate.toString(transform),
      transition,
      ...(isDragging ? { position: "relative", zIndex: 10 } : {}),
    },
    className: cn("group/sortable", isDragging && "shadow-elevation-2"),
    handle: {
      setActivator: setActivatorNodeRef,
      attributes,
      listeners,
      dragging: isDragging,
      disabled,
    },
  });
}

/** One list on its own: `SortableScope` with a single group. */
export function SortableList<T>({
  items,
  getId,
  getLabel,
  onReorder,
  label,
  className,
  children,
}: {
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  onReorder: (items: T[]) => void;
  label: string;
  className?: string;
  children: (item: T, index: number, row: SortableRow) => ReactNode;
}) {
  return (
    <SortableScope
      groups={[{ id: "list", label, items }]}
      getId={getId}
      getLabel={getLabel}
      onChange={([group]) => group && onReorder(group.items)}
    >
      <SortableGroup id="list" items={items} label={label} className={className}>
        {children}
      </SortableGroup>
    </SortableScope>
  );
}

/**
 * The ⋮⋮ a row is dragged by, and its keyboard handle. It shows while the row is hovered or has
 * focus, always on touch screens, and not at all when the list can't be changed.
 */
export function DragHandle({ handle, label }: { handle: SortableHandle; label: string }) {
  const { setActivator, attributes, listeners, dragging, disabled } = handle;
  if (disabled) return null;
  return (
    <button
      type="button"
      ref={setActivator}
      {...attributes}
      {...listeners}
      aria-label={label}
      className={cn(
        "grid size-8 shrink-0 touch-none place-items-center rounded-full text-on-surface-variant opacity-0 transition-opacity outline-none group-focus-within/sortable:opacity-100 group-hover/sortable:opacity-100 hover:bg-on-surface/8 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-5 [@media(hover:none)]:opacity-100",
        dragging ? "cursor-grabbing opacity-100" : "cursor-grab",
      )}
    >
      <DragIndicatorIcon aria-hidden />
    </button>
  );
}
