"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AuthError,
  getDashboardApi,
  type DashboardResponse,
  type BoardSummary,
} from "@/lib/api";

interface DashboardViewProps {
  open: boolean;
  onClose: () => void;
  onOpenBoard?: (board: BoardSummary) => void;
  onAuthLost?: () => void;
}

function formatDueLabel(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function DashboardView({ open, onClose, onAuthLost }: DashboardViewProps) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDashboardApi();
      setData(res);
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthLost?.();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [onAuthLost]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Dashboard"
      className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-[rgba(3,33,71,0.45)] px-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
              Dashboard
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold text-[var(--navy-dark)]">
              Across all boards
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close dashboard"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-[var(--gray-text)] hover:bg-[var(--surface)]"
          >
            ×
          </button>
        </div>

        {loading && !data && (
          <p className="text-sm text-[var(--gray-text)]">Loading…</p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {data && (
          <div className="flex flex-col gap-6">
            <section
              aria-label="Totals"
              className="grid gap-3 sm:grid-cols-4"
            >
              <StatCard
                label="Boards"
                value={data.summary.total_boards}
                testid="stat-total-boards"
              />
              <StatCard
                label="Cards"
                value={data.summary.total_cards}
                testid="stat-total-cards"
              />
              <StatCard
                label="Overdue"
                value={data.summary.overdue_count}
                testid="stat-overdue"
                tone={data.summary.overdue_count > 0 ? "danger" : undefined}
              />
              <StatCard
                label="Due in 7 days"
                value={data.summary.due_soon_count}
                testid="stat-due-soon"
                tone={data.summary.due_soon_count > 0 ? "warning" : undefined}
              />
            </section>

            <section aria-label="Upcoming cards" className="flex flex-col gap-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Upcoming
              </h3>
              {data.upcoming.length === 0 ? (
                <p className="text-sm text-[var(--gray-text)]">
                  No cards with due dates yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.upcoming.map((c) => (
                    <li
                      key={`${c.board_id}-${c.card_id}`}
                      data-testid={`upcoming-${c.card_id}`}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${
                        c.overdue
                          ? "border-red-200 bg-red-50"
                          : "border-[var(--stroke)] bg-white"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: c.board_color }}
                        />
                        <span className="truncate font-semibold text-[var(--navy-dark)]">
                          {c.title}
                        </span>
                        <span className="text-xs text-[var(--gray-text)]">
                          — {c.board_name} / {c.column_title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {c.priority && (
                          <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 font-semibold uppercase tracking-wide text-[var(--navy-dark)]">
                            {c.priority}
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 font-semibold ${
                            c.overdue
                              ? "bg-red-100 text-red-700"
                              : "bg-[var(--surface)] text-[var(--navy-dark)]"
                          }`}
                        >
                          {c.overdue ? "Overdue" : "Due"} · {formatDueLabel(c.due_date)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Boards" className="flex flex-col gap-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Boards
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.boards.map((b) => (
                  <li
                    key={b.board_id}
                    data-testid={`dash-board-${b.board_id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: b.color }}
                      />
                      <span className="truncate font-semibold text-[var(--navy-dark)]">
                        {b.name}
                      </span>
                      {b.is_shared && (
                        <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--gray-text)]">
                          shared
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 text-xs text-[var(--gray-text)]">
                      <span>{b.card_count} cards</span>
                      {b.overdue_count > 0 && (
                        <span className="font-semibold text-red-600">
                          {b.overdue_count} overdue
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  testid,
}: {
  label: string;
  value: number;
  tone?: "danger" | "warning";
  testid?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "bg-red-50 text-red-700 border-red-200"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-[var(--surface)] text-[var(--navy-dark)] border-[var(--stroke)]";
  return (
    <div
      data-testid={testid}
      className={`flex flex-col gap-1 rounded-2xl border px-4 py-3 ${toneClass}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.3em] opacity-70">
        {label}
      </span>
      <span className="font-display text-3xl font-semibold">{value}</span>
    </div>
  );
}
