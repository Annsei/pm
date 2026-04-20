"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AuthError,
  listNotificationsApi,
  markAllNotificationsReadApi,
  markNotificationReadApi,
  type NotificationEntry,
} from "@/lib/api";

interface NotificationsBellProps {
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

export function describeNotification(entry: NotificationEntry): string {
  const actor =
    entry.actor_display_name || entry.actor_username || "Someone";
  const where = entry.board_name ? ` on "${entry.board_name}"` : "";
  switch (entry.kind) {
    case "comment_mention":
      return `${actor} mentioned you${where}`;
    case "collaborator_added": {
      const role =
        typeof entry.meta?.role === "string" ? (entry.meta.role as string) : "member";
      return `${actor} added you as ${role}${where}`;
    }
    default:
      return `${actor}: ${entry.kind}${where}`;
  }
}

export function NotificationsBell({ onAuthLost }: NotificationsBellProps) {
  const [entries, setEntries] = useState<NotificationEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listNotificationsApi({ limit: 20 });
      setEntries(rows);
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthLost?.();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [onAuthLost]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Lightweight polling so a mention from another user eventually shows up.
    const interval = window.setInterval(() => {
      void load();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const unreadCount = entries.filter((e) => !e.read).length;

  const toggleOpen = () => {
    setOpen((v) => !v);
    if (!open) void load();
  };

  const markOne = async (id: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, read: true } : e))
    );
    try {
      await markNotificationReadApi(id);
    } catch (err) {
      if (err instanceof AuthError) onAuthLost?.();
    }
  };

  const markAll = async () => {
    setEntries((prev) => prev.map((e) => ({ ...e, read: true })));
    try {
      await markAllNotificationsReadApi();
    } catch (err) {
      if (err instanceof AuthError) onAuthLost?.();
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/80 shadow-sm hover:bg-[var(--surface)]"
      >
        <span aria-hidden className="text-base">🔔</span>
        {unreadCount > 0 && (
          <span
            data-testid="notification-unread-badge"
            className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-11 z-[60] flex w-80 flex-col gap-2 rounded-2xl border border-[var(--stroke)] bg-white p-3 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
              Notifications
            </h3>
            <button
              type="button"
              onClick={() => void markAll()}
              disabled={unreadCount === 0}
              className="rounded-full border border-[var(--stroke)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--navy-dark)] disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
          {loading && entries.length === 0 && (
            <p className="text-xs text-[var(--gray-text)]">Loading…</p>
          )}
          {!loading && entries.length === 0 && (
            <p className="text-xs text-[var(--gray-text)]">No notifications.</p>
          )}
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {entries.map((entry) => (
              <li
                key={entry.id}
                data-testid={`notification-${entry.id}`}
                className={`flex flex-col gap-1 rounded-xl px-3 py-2 text-sm ${
                  entry.read ? "bg-white" : "bg-[var(--surface)]"
                }`}
              >
                <span className="text-[var(--navy-dark)]">
                  {describeNotification(entry)}
                </span>
                <span className="flex items-center justify-between text-[11px] text-[var(--gray-text)]">
                  <span>{formatTimestamp(entry.created_at)}</span>
                  {!entry.read && (
                    <button
                      type="button"
                      onClick={() => void markOne(entry.id)}
                      className="rounded-full border border-[var(--stroke)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--navy-dark)]"
                    >
                      Mark read
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
