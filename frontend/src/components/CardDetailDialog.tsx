"use client";

import { useState, type FormEvent } from "react";
import {
  PRIORITIES,
  PRIORITY_META,
  type Card,
  type Priority,
} from "@/lib/kanban";
import { CardCommentsPanel } from "@/components/CardCommentsPanel";

interface CardDetailDialogProps {
  card: Card;
  onClose: () => void;
  onSave: (update: Partial<Card> & { id: string }) => void;
  onDelete?: () => void;
  readOnly?: boolean;
  boardId?: string;
  currentUserId?: string | null;
  /** True for editor or owner; false for viewers who cannot post. */
  canComment?: boolean;
  /** True for board owner — can delete any comment. */
  canModerate?: boolean;
  onAuthLost?: () => void;
}

export const CardDetailDialog = ({
  card,
  onClose,
  onSave,
  onDelete,
  readOnly = false,
  boardId,
  currentUserId = null,
  canComment = false,
  canModerate = false,
  onAuthLost,
}: CardDetailDialogProps) => {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [labels, setLabels] = useState((card.labels ?? []).join(", "));
  const [priority, setPriority] = useState<Priority | "">(card.priority ?? "");
  const [dueDate, setDueDate] = useState(card.due_date ?? "");
  const [error, setError] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (readOnly) {
      onClose();
      return;
    }
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    const cleanedLabels = labels
      .split(",")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.length <= 40);
    if (cleanedLabels.length > 20) {
      setError("Too many labels (max 20)");
      return;
    }
    onSave({
      id: card.id,
      title: title.trim(),
      details,
      labels: cleanedLabels,
      priority: priority || null,
      due_date: dueDate || null,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-detail-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(3,33,71,0.45)] px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="card-detail-title" className="font-display text-lg font-semibold text-[var(--navy-dark)]">
            {readOnly ? "Card details" : "Edit card"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-2 py-1 text-[var(--gray-text)] hover:bg-[var(--surface)]"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="cd-title" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Title
            </label>
            <input
              id="cd-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={readOnly}
              className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
              required
            />
          </div>

          <div>
            <label htmlFor="cd-details" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Details
            </label>
            <textarea
              id="cd-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              readOnly={readOnly}
              className="w-full resize-y rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cd-priority" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                Priority
              </label>
              <select
                id="cd-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority | "")}
                disabled={readOnly}
                className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)] disabled:opacity-60"
              >
                <option value="">None</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cd-due" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                Due date
              </label>
              <input
                id="cd-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                readOnly={readOnly}
                className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="cd-labels" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Labels (comma separated)
            </label>
            <input
              id="cd-labels"
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              readOnly={readOnly}
              placeholder="bug, frontend, q2"
              className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            {onDelete && !readOnly ? (
              <button
                type="button"
                onClick={() => {
                  onDelete();
                  onClose();
                }}
                className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Delete card
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
              >
                {readOnly ? "Close" : "Cancel"}
              </button>
              {!readOnly && (
                <button
                  type="submit"
                  className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:brightness-110"
                >
                  Save
                </button>
              )}
            </div>
          </div>
        </form>

        {boardId && (
          <div className="mt-5 border-t border-[var(--stroke)] pt-5">
            <CardCommentsPanel
              boardId={boardId}
              cardId={card.id}
              currentUserId={currentUserId}
              canComment={canComment && !readOnly}
              canModerate={canModerate}
              onAuthLost={onAuthLost}
            />
          </div>
        )}
      </div>
    </div>
  );
};
