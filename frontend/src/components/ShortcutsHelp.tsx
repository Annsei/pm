"use client";

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const ROWS: Array<{ key: string; description: string }> = [
  { key: "n", description: "Add a card to the first column" },
  { key: "/", description: "Focus the card search filter" },
  { key: "?", description: "Show this shortcut list" },
  { key: "Esc", description: "Close open dialogs and drawers" },
];

export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(3,33,71,0.35)] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[var(--navy-dark)]">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            aria-label="Close shortcuts help"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-[var(--gray-text)] hover:bg-[var(--surface)]"
          >
            ×
          </button>
        </div>
        <dl className="flex flex-col gap-2">
          {ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4">
              <dt>
                <kbd className="rounded-md border border-[var(--stroke)] bg-[var(--surface)] px-2 py-0.5 text-xs font-mono font-semibold text-[var(--navy-dark)]">
                  {row.key}
                </kbd>
              </dt>
              <dd className="text-sm text-[var(--navy-dark)]">{row.description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
