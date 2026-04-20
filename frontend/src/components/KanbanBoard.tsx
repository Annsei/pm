"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { AiChatSidebar } from "@/components/AiChatSidebar";
import { ActivityDrawer } from "@/components/ActivityDrawer";
import { CardDetailDialog } from "@/components/CardDetailDialog";
import { CollaboratorPanel } from "@/components/CollaboratorPanel";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { useShortcuts } from "@/lib/shortcuts";
import {
  BoardFilters,
  applyFilters,
  emptyFilters,
  type BoardFiltersState,
} from "@/components/BoardFilters";
import { createId, moveCard, type BoardData, type Card } from "@/lib/kanban";
import {
  AuthError,
  exportBoardApi,
  getBoard,
  updateBoard,
  type BoardSummary,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface KanbanBoardProps {
  board: BoardSummary;
  onBack: () => void;
  onAuthLost: () => void;
}

const ROLE_BADGE_CLASS: Record<BoardSummary["role"], string> = {
  owner: "bg-[var(--navy-dark)] text-white",
  editor: "bg-[var(--secondary-purple)] text-white",
  viewer: "bg-[var(--surface)] text-[var(--navy-dark)]",
};

export const KanbanBoard = ({ board: meta, onBack, onAuthLost }: KanbanBoardProps) => {
  const { user } = useAuth();
  const canEdit = meta.role !== "viewer";
  const [boards, setBoards] = useState<Record<string, BoardData>>({});
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [filters, setFilters] = useState<BoardFiltersState>(emptyFilters);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersion = useRef(0);

  const board = boards[meta.id] ?? null;
  const loading = board === null;

  useEffect(() => {
    if (boards[meta.id]) return;
    let cancelled = false;
    getBoard(meta.id)
      .then((data) => {
        if (!cancelled) setBoards((prev) => ({ ...prev, [meta.id]: data }));
      })
      .catch((err) => {
        if (err instanceof AuthError) onAuthLost();
      });
    return () => {
      cancelled = true;
    };
  }, [meta.id, boards, onAuthLost]);

  const setBoard = useCallback(
    (updater: BoardData | ((prev: BoardData) => BoardData)) => {
      setBoards((prev) => {
        const current = prev[meta.id];
        if (!current) return prev;
        const next =
          typeof updater === "function"
            ? (updater as (p: BoardData) => BoardData)(current)
            : updater;
        if (next === current) return prev;
        return { ...prev, [meta.id]: next };
      });
    },
    [meta.id]
  );

  const save = useCallback(
    (next: BoardData) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const version = ++saveVersion.current;
      saveTimer.current = setTimeout(() => {
        if (saveVersion.current === version) {
          updateBoard(meta.id, next).catch((err) => {
            if (err instanceof AuthError) onAuthLost();
          });
        }
      }, 500);
    },
    [meta.id, onAuthLost]
  );

  const update = useCallback(
    (fn: (prev: BoardData) => BoardData) => {
      setBoards((prev) => {
        const current = prev[meta.id];
        if (!current) return prev;
        const next = fn(current);
        if (next === current) return prev;
        save(next);
        return { ...prev, [meta.id]: next };
      });
    },
    [meta.id, save]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board?.cards]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!canEdit || !over || active.id === over.id) {
      return;
    }

    update((prev) => {
      const newColumns = moveCard(prev.columns, active.id as string, over.id as string);
      if (newColumns === prev.columns) return prev;
      return { ...prev, columns: newColumns };
    });
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    update((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    update((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: {
          id,
          title,
          details: details || "No details yet.",
          labels: [],
          priority: null,
          due_date: null,
        },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    }));
  };

  const handleUpdateCard = (patch: Partial<Card> & { id: string }) => {
    update((prev) => {
      const existing = prev.cards[patch.id];
      if (!existing) return prev;
      return {
        ...prev,
        cards: { ...prev.cards, [patch.id]: { ...existing, ...patch } },
      };
    });
  };

  const handleDeleteCardById = (cardId: string) => {
    update((prev) => ({
      ...prev,
      cards: Object.fromEntries(
        Object.entries(prev.cards).filter(([id]) => id !== cardId)
      ),
      columns: prev.columns.map((column) =>
        column.cardIds.includes(cardId)
          ? { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) }
          : column
      ),
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    update((prev) => ({
      ...prev,
      cards: Object.fromEntries(
        Object.entries(prev.cards).filter(([id]) => id !== cardId)
      ),
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) }
          : column
      ),
    }));
  };

  const handleAiBoardUpdate = useCallback(
    (updated: BoardData) => {
      saveVersion.current++;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      setBoard(updated);
    },
    [setBoard]
  );

  const closeTopmostOverlay = useCallback(() => {
    if (shortcutsOpen) {
      setShortcutsOpen(false);
      return;
    }
    if (editingCardId) {
      setEditingCardId(null);
      return;
    }
    if (sidebarOpen) {
      setSidebarOpen(false);
      return;
    }
    if (activityOpen) {
      setActivityOpen(false);
      return;
    }
    if (membersOpen) {
      setMembersOpen(false);
      return;
    }
  }, [shortcutsOpen, editingCardId, sidebarOpen, activityOpen, membersOpen]);

  const handleShortcutAddCard = useCallback(() => {
    if (!canEdit) return;
    const btn = document.querySelector<HTMLButtonElement>(
      '[data-shortcut="add-card"]'
    );
    btn?.click();
    // After the form opens, focus the first input inside it on the next tick.
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(
        '[data-shortcut="add-card-input"], [placeholder="Card title"]'
      );
      input?.focus();
    });
  }, [canEdit]);

  const handleShortcutFocusFilter = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>(
      '[data-shortcut="board-filter"]'
    );
    input?.focus();
    input?.select();
  }, []);

  useShortcuts({
    n: handleShortcutAddCard,
    "/": handleShortcutFocusFilter,
    "?": () => setShortcutsOpen(true),
    Escape: closeTopmostOverlay,
  });

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const payload = await exportBoardApi(meta.id);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = (meta.name || "board")
        .replace(/[^a-z0-9_-]+/gi, "_")
        .slice(0, 60) || "board";
      a.href = url;
      a.download = `${safeName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof AuthError) onAuthLost();
    } finally {
      setExporting(false);
    }
  }, [meta.id, meta.name, onAuthLost]);

  const availableLabels = useMemo(() => {
    const set = new Set<string>();
    if (board) {
      for (const c of Object.values(board.cards)) {
        for (const l of c.labels ?? []) set.add(l);
      }
    }
    return [...set].sort();
  }, [board]);

  if (loading || !board) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-[var(--gray-text)]">Loading board...</p>
      </div>
    );
  }

  const drawerOpen = sidebarOpen || activityOpen || membersOpen;
  const activeCard = canEdit && activeCardId ? cardsById[activeCardId] : null;
  const totalCards = Object.keys(board.cards).length;
  const editingCard = editingCardId ? board.cards[editingCardId] ?? null : null;
  const roleLabel =
    meta.role === "owner" ? "Owner" : meta.role === "editor" ? "Editor" : "Viewer";

  return (
    <div className="relative flex overflow-hidden">
      <div
        className={`relative flex-1 transition-all ${drawerOpen ? "mr-[380px]" : ""}`}
      >
        <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

        <main className="relative mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-6 px-4 pb-10 pt-8 lg:px-8 lg:pt-10">
          <header className="flex flex-wrap items-center justify-between gap-6 rounded-[28px] border border-[var(--stroke)] bg-white/80 px-6 py-5 shadow-[var(--shadow)] backdrop-blur">
            <div className="flex min-w-0 items-center gap-5">
              <button
                type="button"
                onClick={onBack}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--stroke)] text-[var(--navy-dark)] hover:bg-[var(--surface)]"
                aria-label="Back to boards"
                title="Back to boards"
              >
                <span aria-hidden>←</span>
              </button>
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
                style={{ backgroundColor: meta.color }}
              >
                <span className="font-display text-lg font-semibold">
                  {meta.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                  Kanban Board
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl font-semibold leading-tight text-[var(--navy-dark)]">
                    {meta.name}
                  </h1>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ROLE_BADGE_CLASS[meta.role]}`}
                    data-testid="board-role-badge"
                  >
                    {roleLabel}
                  </span>
                </div>
                {meta.is_shared && (
                  <p className="mt-0.5 text-xs text-[var(--gray-text)]">
                    Shared by {meta.owner_display_name || meta.owner_username}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {board.columns.map((column) => (
                <div
                  key={column.id}
                  className="flex items-center gap-2 rounded-full border border-[var(--stroke)] bg-white/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--navy-dark)]"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-yellow)]" />
                  {column.title}
                  <span className="text-[var(--gray-text)]">{column.cardIds.length}</span>
                </div>
              ))}
              <div className="ml-2 rounded-full bg-[var(--navy-dark)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                {totalCards} total
              </div>
              <button
                type="button"
                onClick={() => {
                  setActivityOpen((v) => !v);
                  if (!activityOpen) setMembersOpen(false);
                }}
                aria-pressed={activityOpen}
                className="ml-2 rounded-full border border-[var(--stroke)] bg-white/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--navy-dark)] hover:bg-[var(--surface)]"
              >
                Activity
              </button>
              <button
                type="button"
                onClick={() => {
                  setMembersOpen((v) => !v);
                  if (!membersOpen) setActivityOpen(false);
                }}
                aria-pressed={membersOpen}
                className="rounded-full border border-[var(--stroke)] bg-white/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--navy-dark)] hover:bg-[var(--surface)]"
              >
                Members
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={exporting}
                className="rounded-full border border-[var(--stroke)] bg-white/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--navy-dark)] hover:bg-[var(--surface)] disabled:opacity-50"
              >
                {exporting ? "Exporting…" : "Export"}
              </button>
              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                title="Keyboard shortcuts (?)"
                aria-label="Keyboard shortcuts"
                className="rounded-full border border-[var(--stroke)] bg-white/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--navy-dark)] hover:bg-[var(--surface)]"
              >
                ?
              </button>
            </div>
          </header>

          <BoardFilters
            value={filters}
            onChange={setFilters}
            availableLabels={availableLabels}
          />

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section className="grid flex-1 auto-rows-fr gap-4 lg:grid-cols-5">
              {board.columns.map((column) => {
                const allCards = column.cardIds
                  .map((cardId) => board.cards[cardId])
                  .filter(Boolean);
                const visibleCards = applyFilters(allCards, filters);
                const hiddenCount = allCards.length - visibleCards.length;
                return (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    cards={visibleCards}
                    hiddenCount={hiddenCount}
                    onRename={handleRenameColumn}
                    onAddCard={handleAddCard}
                    onDeleteCard={handleDeleteCard}
                    onOpenCard={setEditingCardId}
                    canEdit={canEdit}
                  />
                );
              })}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[280px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </main>
      </div>

      {canEdit && (
        <button
          onClick={() => {
            setSidebarOpen((v) => !v);
            if (!sidebarOpen) {
              setActivityOpen(false);
              setMembersOpen(false);
            }
          }}
          className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-blue)] text-white shadow-lg transition-colors hover:bg-[#1a88b8]"
          title={sidebarOpen ? "Close AI chat" : "Open AI chat"}
        >
          <span className="text-xl font-bold">AI</span>
        </button>
      )}

      {sidebarOpen && canEdit && (
        <aside className="fixed right-0 top-0 z-40 h-screen w-[380px] border-l border-[var(--stroke)] bg-white shadow-[-4px_0_24px_rgba(3,33,71,0.08)]">
          <AiChatSidebar
            boardId={meta.id}
            board={board}
            onBoardUpdate={handleAiBoardUpdate}
            onAuthLost={onAuthLost}
          />
        </aside>
      )}

      <ActivityDrawer
        boardId={meta.id}
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        onAuthLost={onAuthLost}
      />

      {user && (
        <CollaboratorPanel
          boardId={meta.id}
          open={membersOpen}
          onClose={() => setMembersOpen(false)}
          onAuthLost={onAuthLost}
          currentUserId={user.id}
          viewerRole={meta.role}
          onSelfLeave={() => {
            setMembersOpen(false);
            onBack();
          }}
        />
      )}

      <ShortcutsHelp
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      {editingCard && (
        <CardDetailDialog
          key={editingCard.id}
          card={editingCard}
          onClose={() => setEditingCardId(null)}
          onSave={handleUpdateCard}
          onDelete={canEdit ? () => handleDeleteCardById(editingCard.id) : undefined}
          readOnly={!canEdit}
          boardId={meta.id}
          currentUserId={user?.id ?? null}
          canComment={canEdit}
          canModerate={meta.role === "owner"}
          onAuthLost={onAuthLost}
        />
      )}
    </div>
  );
};
