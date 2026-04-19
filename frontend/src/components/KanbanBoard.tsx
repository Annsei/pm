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
import { createId, moveCard, type BoardData } from "@/lib/kanban";
import { getBoard, updateBoard, clearAuthCredentials } from "@/lib/api";

export const KanbanBoard = ({ userId }: { userId: string }) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersion = useRef(0);

  useEffect(() => {
    getBoard(userId)
      .then((data) => {
        setBoard(data);
        setLoading(false);
      })
      .catch(() => {
        // Stored credentials no longer valid (e.g. backend DB was reset
        // and the seeded user's id changed). Clear and bounce back to login.
        clearAuthCredentials();
        localStorage.removeItem("kanban-user-id");
        localStorage.removeItem("kanban-auth-creds");
        window.location.reload();
      });
  }, [userId]);

  const save = useCallback(
    (next: BoardData) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const version = ++saveVersion.current;
      saveTimer.current = setTimeout(() => {
        if (saveVersion.current === version) {
          updateBoard(userId, next);
        }
      }, 500);
    },
    [userId]
  );

  const update = useCallback(
    (fn: (prev: BoardData) => BoardData) => {
      setBoard((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        if (next === prev) return prev;
        save(next);
        return next;
      });
    },
    [save]
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

    if (!over || active.id === over.id) {
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
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
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
      // Bump version so any pending debounced save becomes stale
      saveVersion.current++;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      // AI endpoint already saved to DB, just update UI
      setBoard(updated);
    },
    []
  );

  if (loading || !board) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-[var(--gray-text)]">Loading board...</p>
      </div>
    );
  }

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  const totalCards = Object.keys(board.cards).length;

  return (
    <div className="relative flex overflow-hidden">
      <div className={`relative flex-1 transition-all ${sidebarOpen ? "mr-[380px]" : ""}`}>
        <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

        <main className="relative mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-6 px-4 pb-10 pt-8 lg:px-8 lg:pt-10">
          <header className="flex flex-wrap items-center justify-between gap-6 rounded-[28px] border border-[var(--stroke)] bg-white/80 px-6 py-5 shadow-[var(--shadow)] backdrop-blur">
            <div className="flex min-w-0 items-center gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary-blue)] text-white shadow-sm">
                <span className="font-display text-lg font-semibold">KS</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                  Single Board Kanban
                </p>
                <h1 className="mt-0.5 font-display text-2xl font-semibold leading-tight text-[var(--navy-dark)]">
                  Kanban Studio
                </h1>
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
                  <span className="text-[var(--gray-text)]">
                    {column.cardIds.length}
                  </span>
                </div>
              ))}
              <div className="ml-2 rounded-full bg-[var(--navy-dark)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                {totalCards} total
              </div>
            </div>
          </header>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section className="grid flex-1 auto-rows-fr gap-4 lg:grid-cols-5">
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                />
              ))}
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

      {/* AI toggle button */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-blue)] text-white shadow-lg transition-colors hover:bg-[#1a88b8]"
        title={sidebarOpen ? "Close AI chat" : "Open AI chat"}
      >
        <span className="text-xl font-bold">AI</span>
      </button>

      {/* AI sidebar */}
      {sidebarOpen && (
        <aside className="fixed right-0 top-0 z-40 h-screen w-[380px] border-l border-[var(--stroke)] bg-white shadow-[-4px_0_24px_rgba(3,33,71,0.08)]">
          <AiChatSidebar
            userId={userId}
            board={board}
            onBoardUpdate={handleAiBoardUpdate}
          />
        </aside>
      )}
    </div>
  );
};
