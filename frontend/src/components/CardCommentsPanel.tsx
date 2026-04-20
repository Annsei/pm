"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  AuthError,
  addCardCommentApi,
  deleteCardCommentApi,
  listCardCommentsApi,
  updateCardCommentApi,
  type CardCommentEntry,
} from "@/lib/api";

interface CardCommentsPanelProps {
  boardId: string;
  cardId: string;
  currentUserId: string | null;
  canComment: boolean;
  canModerate: boolean;
  onAuthLost?: () => void;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

// Matches @username where username is 3-32 chars of [A-Za-z0-9_.-],
// and preceded by start or a non-word / non-@ char (so "a@b.com" doesn't match).
const MENTION_RE = /(^|[^A-Za-z0-9_@.])@([A-Za-z0-9_.-]{3,32})/g;

export function renderCommentBody(body: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  for (const match of body.matchAll(MENTION_RE)) {
    const start = match.index ?? 0;
    const leading = match[1];
    const username = match[2];
    const atIdx = start + leading.length;
    if (atIdx > lastIdx) {
      nodes.push(body.slice(lastIdx, atIdx));
    }
    nodes.push(
      <span
        key={`m-${key++}-${atIdx}`}
        data-testid="mention-chip"
        className="rounded bg-[var(--secondary-purple)]/10 px-1 font-semibold text-[var(--secondary-purple)]"
      >
        @{username}
      </span>
    );
    lastIdx = atIdx + 1 + username.length;
  }
  if (lastIdx < body.length) {
    nodes.push(body.slice(lastIdx));
  }
  return nodes;
}

export function CardCommentsPanel({
  boardId,
  cardId,
  currentUserId,
  canComment,
  canModerate,
  onAuthLost,
}: CardCommentsPanelProps) {
  const [comments, setComments] = useState<CardCommentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listCardCommentsApi(boardId, cardId);
      setComments(rows);
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthLost?.();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load comments");
    } finally {
      setLoading(false);
    }
  }, [boardId, cardId, onAuthLost]);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePost = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    setError(null);
    try {
      const created = await addCardCommentApi(boardId, cardId, body);
      setComments((prev) => [...prev, created]);
      setDraft("");
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthLost?.();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setPosting(false);
    }
  };

  const startEdit = (entry: CardCommentEntry) => {
    setEditingId(entry.id);
    setEditDraft(entry.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const saveEdit = async (id: string) => {
    const body = editDraft.trim();
    if (!body) return;
    setError(null);
    try {
      const updated = await updateCardCommentApi(boardId, cardId, id, body);
      setComments((prev) => prev.map((c) => (c.id === id ? updated : c)));
      cancelEdit();
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthLost?.();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to update comment");
    }
  };

  const deleteComment = async (id: string) => {
    setError(null);
    try {
      await deleteCardCommentApi(boardId, cardId, id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthLost?.();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to delete comment");
    }
  };

  return (
    <section aria-label="Card comments" className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
        Comments ({comments.length})
      </h3>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {loading && <p className="text-xs text-[var(--gray-text)]">Loading comments…</p>}
      {!loading && comments.length === 0 && (
        <p className="text-xs text-[var(--gray-text)]">No comments yet.</p>
      )}
      <ul className="flex flex-col gap-2">
        {comments.map((entry) => {
          const isAuthor = currentUserId === entry.user_id;
          const canEdit = isAuthor;
          const canDelete = isAuthor || canModerate;
          const authorLabel =
            entry.user_display_name || entry.username || "Someone";
          return (
            <li
              key={entry.id}
              data-testid={`comment-${entry.id}`}
              className="rounded-xl border border-[var(--stroke)] bg-white/90 px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-2 text-xs text-[var(--gray-text)]">
                <span>
                  <span className="font-semibold text-[var(--navy-dark)]">
                    {authorLabel}
                  </span>{" "}
                  · {formatTimestamp(entry.created_at)}
                  {entry.edited && " · edited"}
                </span>
                <span className="flex gap-1">
                  {canEdit && editingId !== entry.id && (
                    <button
                      type="button"
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--secondary-purple)] hover:bg-[var(--surface)]"
                      onClick={() => startEdit(entry)}
                    >
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-600 hover:bg-red-50"
                      onClick={() => deleteComment(entry.id)}
                      aria-label={`Delete comment by ${authorLabel}`}
                    >
                      Delete
                    </button>
                  )}
                </span>
              </div>
              {editingId === entry.id ? (
                <div className="mt-1 flex flex-col gap-2">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={3}
                    className="w-full resize-y rounded-lg border border-[var(--stroke)] px-2 py-1 text-sm outline-none focus:border-[var(--primary-blue)]"
                    aria-label="Edit comment body"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-full bg-[var(--secondary-purple)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white hover:brightness-110"
                      onClick={() => void saveEdit(entry.id)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-[var(--stroke)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-text)]"
                      onClick={cancelEdit}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-[var(--navy-dark)]">
                  {renderCommentBody(entry.body)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {canComment && (
        <form onSubmit={handlePost} className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Write a comment…"
            aria-label="New comment"
            className="w-full resize-y rounded-lg border border-[var(--stroke)] px-2 py-1 text-sm outline-none focus:border-[var(--primary-blue)]"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={posting || draft.trim() === ""}
              className="rounded-full bg-[var(--primary-blue)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {posting ? "Posting…" : "Post comment"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
