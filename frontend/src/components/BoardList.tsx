"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  AuthError,
  createBoardApi,
  deleteBoardApi,
  importBoardApi,
  listBoards,
  patchBoardApi,
  type BoardSummary,
} from "@/lib/api";

interface BoardListProps {
  onSelect: (board: BoardSummary) => void;
  onAuthLost: () => void;
  onOpenProfile?: () => void;
  onOpenDashboard?: () => void;
}

const COLOR_OPTIONS = ["#209dd7", "#753991", "#ecad0a", "#0bad7d", "#e44c65", "#032147"];

export const BoardList = ({
  onSelect,
  onAuthLost,
  onOpenProfile,
  onOpenDashboard,
}: BoardListProps) => {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLOR_OPTIONS[0]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleError = (err: unknown, fallback: string) => {
    if (err instanceof AuthError) {
      onAuthLost();
      return;
    }
    if (err instanceof ApiError) setError(err.message);
    else setError(err instanceof Error ? err.message : fallback);
  };

  const load = async (archived: boolean) => {
    try {
      setBoards(await listBoards(archived));
      setError("");
    } catch (err) {
      handleError(err, "Failed to load boards");
    }
  };

  useEffect(() => {
    load(includeArchived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeArchived]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const board = await createBoardApi({ name: newName.trim(), color: newColor });
      setBoards((prev) => (prev ? [...prev, board] : [board]));
      setNewName("");
    } catch (err) {
      handleError(err, "Failed to create board");
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (board: BoardSummary) => {
    const name = window.prompt("Rename board", board.name);
    if (!name || name.trim() === board.name) return;
    setBusyId(board.id);
    try {
      const updated = await patchBoardApi(board.id, { name: name.trim() });
      setBoards((prev) => prev?.map((b) => (b.id === board.id ? updated : b)) ?? prev);
    } catch (err) {
      handleError(err, "Failed to rename board");
    } finally {
      setBusyId(null);
    }
  };

  const handleArchive = async (board: BoardSummary, archive: boolean) => {
    setBusyId(board.id);
    try {
      const updated = await patchBoardApi(board.id, { is_archived: archive });
      const removedFromList = archive && !includeArchived;
      setBoards((prev) => {
        if (!prev) return prev;
        if (removedFromList) return prev.filter((b) => b.id !== board.id);
        return prev.map((b) => (b.id === board.id ? updated : b));
      });
    } catch (err) {
      handleError(err, "Failed to update board");
    } finally {
      setBusyId(null);
    }
  };

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsText(file);
    });

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setError("");
    try {
      const text = await readFileAsText(file);
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("File is not valid JSON");
      }
      const created = await importBoardApi(payload);
      setBoards((prev) => (prev ? [...prev, created] : [created]));
    } catch (err) {
      handleError(err, "Failed to import board");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (board: BoardSummary) => {
    if (!window.confirm(`Delete "${board.name}"? This cannot be undone.`)) return;
    setBusyId(board.id);
    try {
      await deleteBoardApi(board.id);
      setBoards((prev) => prev?.filter((b) => b.id !== board.id) ?? prev);
    } catch (err) {
      handleError(err, "Failed to delete board");
    } finally {
      setBusyId(null);
    }
  };

  if (boards === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--gray-text)]">Loading boards...</p>
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
            Your workspace
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Boards
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-[var(--navy-dark)]">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            Show archived
          </label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--navy-dark)] hover:bg-[var(--surface)] disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import board"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            aria-label="Import board JSON"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
            }}
            className="hidden"
          />
          {onOpenDashboard && (
            <button
              type="button"
              onClick={onOpenDashboard}
              className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--navy-dark)] hover:bg-[var(--surface)]"
            >
              Dashboard
            </button>
          )}
          {onOpenProfile && (
            <button
              type="button"
              onClick={onOpenProfile}
              className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--navy-dark)] hover:bg-[var(--surface)]"
            >
              Profile
            </button>
          )}
        </div>
      </header>

      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--stroke)] bg-white/80 px-4 py-3 shadow-[var(--shadow)]"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New board name"
          className="min-w-[220px] flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
          aria-label="New board name"
          required
        />
        <div className="flex items-center gap-1.5" aria-label="Color">
          {COLOR_OPTIONS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setNewColor(c)}
              className="h-7 w-7 rounded-full border-2 transition"
              style={{
                backgroundColor: c,
                borderColor: newColor === c ? "var(--navy-dark)" : "transparent",
              }}
              aria-label={`Pick color ${c}`}
              aria-pressed={newColor === c}
            />
          ))}
        </div>
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="rounded-xl bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create board"}
        </button>
      </form>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {boards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--stroke)] bg-white/60 p-12 text-center text-[var(--gray-text)]">
          No boards yet. Create one above to get started.
        </div>
      ) : (
        <BoardGrid
          boards={boards}
          busyId={busyId}
          onSelect={onSelect}
          onRename={handleRename}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />
      )}
    </main>
  );
};

interface BoardGridProps {
  boards: BoardSummary[];
  busyId: string | null;
  onSelect: (board: BoardSummary) => void;
  onRename: (board: BoardSummary) => void;
  onArchive: (board: BoardSummary, archive: boolean) => void;
  onDelete: (board: BoardSummary) => void;
}

const ROLE_BADGE_CLASS: Record<BoardSummary["role"], string> = {
  owner: "bg-[var(--navy-dark)] text-white",
  editor: "bg-[var(--secondary-purple)] text-white",
  viewer: "bg-[var(--surface)] text-[var(--navy-dark)]",
};

function BoardGrid({
  boards,
  busyId,
  onSelect,
  onRename,
  onArchive,
  onDelete,
}: BoardGridProps) {
  const owned = boards.filter((b) => !b.is_shared);
  const shared = boards.filter((b) => b.is_shared);

  return (
    <div className="flex flex-col gap-6">
      {owned.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
            Your boards
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {owned.map((board) => (
              <BoardCardItem
                key={board.id}
                board={board}
                busyId={busyId}
                onSelect={onSelect}
                onRename={onRename}
                onArchive={onArchive}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </section>
      )}
      {shared.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
            Shared with you
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shared.map((board) => (
              <BoardCardItem
                key={board.id}
                board={board}
                busyId={busyId}
                onSelect={onSelect}
                onRename={onRename}
                onArchive={onArchive}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

interface BoardCardItemProps {
  board: BoardSummary;
  busyId: string | null;
  onSelect: (board: BoardSummary) => void;
  onRename: (board: BoardSummary) => void;
  onArchive: (board: BoardSummary, archive: boolean) => void;
  onDelete: (board: BoardSummary) => void;
}

function BoardCardItem({
  board,
  busyId,
  onSelect,
  onRename,
  onArchive,
  onDelete,
}: BoardCardItemProps) {
  const isOwner = board.role === "owner";
  const roleLabel = board.role.charAt(0).toUpperCase() + board.role.slice(1);
  return (
    <li>
      <article
        className="flex h-full flex-col justify-between rounded-2xl border border-[var(--stroke)] bg-white p-5 shadow-[var(--shadow)] transition hover:-translate-y-0.5"
        data-testid={`board-card-${board.id}`}
      >
        <button
          type="button"
          onClick={() => onSelect(board)}
          className="flex flex-1 flex-col items-start text-left"
        >
          <div className="mb-3 flex w-full items-center justify-between gap-2">
            <span
              className="inline-block h-2 w-12 rounded-full"
              style={{ backgroundColor: board.color }}
            />
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ROLE_BADGE_CLASS[board.role]}`}
              data-testid={`board-card-${board.id}-role`}
            >
              {roleLabel}
            </span>
          </div>
          <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
            {board.name}
          </h2>
          {board.description && (
            <p className="mt-1 text-sm text-[var(--gray-text)] line-clamp-2">
              {board.description}
            </p>
          )}
          {!isOwner && (
            <p className="mt-1 text-xs text-[var(--gray-text)]">
              Owned by {board.owner_display_name || board.owner_username}
            </p>
          )}
          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[var(--gray-text)]">
            {board.column_count} columns · {board.card_count} cards
            {board.is_archived && " · archived"}
          </p>
        </button>
        {isOwner && (
          <div className="mt-4 flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => onRename(board)}
              disabled={busyId === board.id}
              className="rounded-full border border-[var(--stroke)] px-3 py-1.5 font-semibold text-[var(--navy-dark)] hover:bg-[var(--surface)]"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => onArchive(board, !board.is_archived)}
              disabled={busyId === board.id}
              className="rounded-full border border-[var(--stroke)] px-3 py-1.5 font-semibold text-[var(--navy-dark)] hover:bg-[var(--surface)]"
            >
              {board.is_archived ? "Restore" : "Archive"}
            </button>
            <button
              type="button"
              onClick={() => onDelete(board)}
              disabled={busyId === board.id}
              className="ml-auto rounded-full border border-red-200 px-3 py-1.5 font-semibold text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}
      </article>
    </li>
  );
}
