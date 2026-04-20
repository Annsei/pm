import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import {
  PRIORITY_META,
  dueDateStatus,
  type Card,
} from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onOpen: (cardId: string) => void;
  canEdit?: boolean;
};

const DUE_STATUS_STYLES: Record<
  NonNullable<ReturnType<typeof dueDateStatus>>,
  { bg: string; text: string; label: (due: string) => string }
> = {
  overdue: { bg: "#fde2e4", text: "#8c1325", label: (d) => `Overdue · ${d}` },
  today: { bg: "#fef0bf", text: "#7a5a00", label: () => "Due today" },
  soon: { bg: "#ffe6cc", text: "#a14300", label: (d) => `Due ${d}` },
  later: { bg: "#e4ecf7", text: "#0a4e72", label: (d) => `Due ${d}` },
};

export const KanbanCard = ({ card, onDelete, onOpen, canEdit = true }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priority = card.priority ?? null;
  const due = card.due_date ?? null;
  const dueState = dueDateStatus(due);

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative rounded-2xl border border-transparent bg-white px-4 py-3.5 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150 hover:border-[var(--stroke)]",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen(card.id);
      }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-base font-semibold leading-snug text-[var(--navy-dark)]">
            {card.title}
          </h4>
          {card.details && (
            <p className="mt-1.5 text-sm leading-6 text-[var(--gray-text)] line-clamp-3">
              {card.details}
            </p>
          )}

          {(priority || dueState || (card.labels && card.labels.length > 0)) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {priority && (
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    backgroundColor: PRIORITY_META[priority].color,
                    color: PRIORITY_META[priority].text,
                  }}
                  data-testid={`card-${card.id}-priority`}
                >
                  {PRIORITY_META[priority].label}
                </span>
              )}
              {dueState && due && (
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: DUE_STATUS_STYLES[dueState].bg,
                    color: DUE_STATUS_STYLES[dueState].text,
                  }}
                  data-testid={`card-${card.id}-due`}
                >
                  {DUE_STATUS_STYLES[dueState].label(due)}
                </span>
              )}
              {(card.labels ?? []).map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--navy-dark)]"
                >
                  #{label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(card.id);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--gray-text)] opacity-0 transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)] focus:opacity-100 group-hover:opacity-100"
            aria-label={canEdit ? `Edit ${card.title}` : `View ${card.title}`}
            title={canEdit ? "Edit card" : "View card"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
          {canEdit && (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(card.id);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--gray-text)] opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
            aria-label={`Delete ${card.title}`}
            title="Delete card"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
          )}
        </div>
      </div>
    </article>
  );
};
