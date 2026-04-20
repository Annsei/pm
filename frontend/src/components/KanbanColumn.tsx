import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onOpenCard: (cardId: string) => void;
  hiddenCount?: number;
  canEdit?: boolean;
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onAddCard,
  onDeleteCard,
  onOpenCard,
  hiddenCount = 0,
  canEdit = true,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, disabled: !canEdit });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[520px] flex-col rounded-2xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-3 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-center gap-2 px-1">
        <div className="h-2 w-8 shrink-0 rounded-full bg-[var(--accent-yellow)]" />
        <input
          value={column.title}
          onChange={(event) => onRename(column.id, event.target.value)}
          readOnly={!canEdit}
          className="min-w-0 flex-1 bg-transparent font-display text-base font-semibold text-[var(--navy-dark)] outline-none"
          aria-label="Column title"
        />
        <span className="shrink-0 rounded-full bg-[var(--surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--gray-text)]">
          {cards.length}
        </span>
      </div>
      <div className="mt-3 flex flex-1 flex-col gap-2.5">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onOpen={onOpenCard}
              canEdit={canEdit}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            {hiddenCount > 0
              ? `${hiddenCount} hidden by filters`
              : "Drop a card here"}
          </div>
        )}
        {cards.length > 0 && hiddenCount > 0 && (
          <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            {hiddenCount} hidden by filters
          </p>
        )}
      </div>
      {canEdit && (
        <NewCardForm
          onAdd={(title, details) => onAddCard(column.id, title, details)}
        />
      )}
    </section>
  );
};
