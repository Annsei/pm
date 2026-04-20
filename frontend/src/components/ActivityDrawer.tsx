"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AuthError,
  listBoardActivity,
  type ActivityEntry,
} from "@/lib/api";

const PAGE_SIZE = 25;

const KIND_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All activity" },
  { value: "card_add,card_move,card_edit,card_delete", label: "Card changes" },
  { value: "comment_add,comment_edit,comment_delete", label: "Comments" },
  {
    value: "board_create,board_meta_update,board_archive,board_unarchive",
    label: "Board meta",
  },
  {
    value: "collaborator_add,collaborator_role_change,collaborator_remove",
    label: "Members",
  },
];

interface ActivityDrawerProps {
  boardId: string;
  open: boolean;
  onClose: () => void;
  onAuthLost: () => void;
}

export function describeActivity(entry: ActivityEntry): string {
  const meta = entry.meta ?? {};
  switch (entry.action) {
    case "board_create":
      return meta.seeded
        ? `Created default board “${meta.name ?? ""}”`
        : `Created board “${meta.name ?? ""}”`;
    case "board_archive":
      return `Archived board “${meta.name ?? ""}”`;
    case "board_unarchive":
      return `Restored board “${meta.name ?? ""}”`;
    case "board_meta_update": {
      const changes = (meta.changes ?? {}) as Record<
        string,
        { from?: unknown; to?: unknown }
      >;
      const parts = Object.entries(changes).map(
        ([field, { from, to }]) =>
          `${field}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`
      );
      return `Updated board (${parts.join(", ")})`;
    }
    case "card_add":
      return `Added card “${meta.title ?? ""}”${
        meta.column_title ? ` to ${meta.column_title}` : ""
      }`;
    case "card_delete":
      return `Deleted card “${meta.title ?? ""}”`;
    case "card_move":
      return `Moved “${meta.title ?? ""}” from ${meta.from_column ?? "?"} to ${
        meta.to_column ?? "?"
      }`;
    case "card_edit": {
      const fields = Array.isArray(meta.fields)
        ? (meta.fields as string[]).join(", ")
        : "";
      return `Edited “${meta.title ?? ""}”${fields ? ` (${fields})` : ""}`;
    }
    case "column_rename":
      return `Renamed column “${meta.from_title ?? ""}” to “${
        meta.to_title ?? ""
      }”`;
    default:
      return entry.action;
  }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function actorLabel(entry: ActivityEntry): string {
  return entry.user_display_name || entry.username || "someone";
}

export function ActivityDrawer({
  boardId,
  open,
  onClose,
  onAuthLost,
}: ActivityDrawerProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<string>("");

  const kinds = useMemo(() => {
    if (!kindFilter) return undefined;
    return kindFilter.split(",").map((k) => k.trim()).filter(Boolean);
  }, [kindFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBoardActivity(boardId, {
        limit: PAGE_SIZE,
        kinds,
      });
      setEntries(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthLost();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, [boardId, onAuthLost, kinds]);

  const loadMore = useCallback(async () => {
    if (entries.length === 0) return;
    const oldest = entries[entries.length - 1];
    setLoadingMore(true);
    setError(null);
    try {
      const data = await listBoardActivity(boardId, {
        limit: PAGE_SIZE,
        before: oldest.created_at,
        kinds,
      });
      setEntries((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthLost();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoadingMore(false);
    }
  }, [boardId, onAuthLost, kinds, entries]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-label="Board activity"
      className="fixed right-0 top-0 z-40 flex h-screen w-[380px] flex-col border-l border-[var(--stroke)] bg-white shadow-[-4px_0_24px_rgba(3,33,71,0.08)]"
    >
      <header className="flex items-center justify-between border-b border-[var(--stroke)] px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
            Activity
          </p>
          <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
            Recent changes
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--navy-dark)] hover:bg-[var(--surface)]"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stroke)] text-[var(--navy-dark)] hover:bg-[var(--surface)]"
            aria-label="Close activity"
          >
            ×
          </button>
        </div>
      </header>
      <div className="border-b border-[var(--stroke)] px-5 py-2">
        <label className="flex items-center gap-2 text-xs text-[var(--gray-text)]">
          <span className="font-semibold uppercase tracking-wide">Filter</span>
          <select
            aria-label="Activity kind filter"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="flex-1 rounded-md border border-[var(--stroke)] bg-white px-2 py-1 text-xs text-[var(--navy-dark)]"
          >
            {KIND_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading && entries.length === 0 && (
          <p className="text-sm text-[var(--gray-text)]">Loading…</p>
        )}
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {!loading && entries.length === 0 && !error && (
          <p className="text-sm text-[var(--gray-text)]">No activity yet.</p>
        )}
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-2xl border border-[var(--stroke)] bg-white/80 px-4 py-3 text-sm shadow-sm"
            >
              <p className="font-semibold text-[var(--navy-dark)]">
                {describeActivity(entry)}
              </p>
              <p className="mt-1 text-xs text-[var(--gray-text)]">
                by {actorLabel(entry)} · {formatTimestamp(entry.created_at)}
                {entry.meta?.source === "ai" ? " · via AI" : ""}
              </p>
            </li>
          ))}
        </ol>
        {entries.length > 0 && hasMore && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--navy-dark)] hover:bg-[var(--surface)] disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
