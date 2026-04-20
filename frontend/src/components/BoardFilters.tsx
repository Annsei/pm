"use client";

import { PRIORITIES, PRIORITY_META, type Priority } from "@/lib/kanban";

export interface BoardFiltersState {
  text: string;
  priorities: Set<Priority>;
  labels: Set<string>;
  dueOnly: boolean;
}

export const emptyFilters = (): BoardFiltersState => ({
  text: "",
  priorities: new Set(),
  labels: new Set(),
  dueOnly: false,
});

interface BoardFiltersProps {
  value: BoardFiltersState;
  onChange: (next: BoardFiltersState) => void;
  availableLabels: string[];
}

export const BoardFilters = ({ value, onChange, availableLabels }: BoardFiltersProps) => {
  const togglePriority = (p: Priority) => {
    const next = new Set(value.priorities);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onChange({ ...value, priorities: next });
  };

  const toggleLabel = (label: string) => {
    const next = new Set(value.labels);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    onChange({ ...value, labels: next });
  };

  const anyActive =
    value.text !== "" ||
    value.priorities.size > 0 ||
    value.labels.size > 0 ||
    value.dueOnly;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--stroke)] bg-white/80 px-4 py-3 shadow-[var(--shadow)]">
      <input
        type="search"
        placeholder="Search cards..."
        value={value.text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        className="min-w-[180px] flex-1 rounded-xl border border-[var(--stroke)] px-3 py-1.5 text-sm outline-none focus:border-[var(--primary-blue)]"
        aria-label="Search cards"
        data-shortcut="board-filter"
      />

      <div className="flex items-center gap-1" role="group" aria-label="Priority filter">
        {PRIORITIES.map((p) => {
          const active = value.priorities.has(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => togglePriority(p)}
              aria-pressed={active}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition"
              style={{
                backgroundColor: active ? PRIORITY_META[p].color : "transparent",
                color: active ? PRIORITY_META[p].text : "var(--gray-text)",
                border: "1px solid var(--stroke)",
              }}
            >
              {PRIORITY_META[p].label}
            </button>
          );
        })}
      </div>

      <label className="ml-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--navy-dark)]">
        <input
          type="checkbox"
          checked={value.dueOnly}
          onChange={(e) => onChange({ ...value, dueOnly: e.target.checked })}
        />
        Has due date
      </label>

      {availableLabels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Label filter">
          {availableLabels.map((label) => {
            const active = value.labels.has(label);
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleLabel(label)}
                aria-pressed={active}
                className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition"
                style={{
                  borderColor: active ? "var(--navy-dark)" : "var(--stroke)",
                  backgroundColor: active ? "var(--navy-dark)" : "transparent",
                  color: active ? "#fff" : "var(--navy-dark)",
                }}
              >
                #{label}
              </button>
            );
          })}
        </div>
      )}

      {anyActive && (
        <button
          type="button"
          onClick={() => onChange(emptyFilters())}
          className="ml-auto rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
        >
          Clear filters
        </button>
      )}
    </div>
  );
};

export function applyFilters(cards: import("@/lib/kanban").Card[], f: BoardFiltersState) {
  const text = f.text.trim().toLowerCase();
  return cards.filter((card) => {
    if (text) {
      const hay = [card.title, card.details ?? "", ...(card.labels ?? [])]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(text)) return false;
    }
    if (f.priorities.size > 0) {
      if (!card.priority || !f.priorities.has(card.priority)) return false;
    }
    if (f.labels.size > 0) {
      const cardLabels = new Set(card.labels ?? []);
      let hit = false;
      for (const l of f.labels) {
        if (cardLabels.has(l)) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    if (f.dueOnly && !card.due_date) return false;
    return true;
  });
}
