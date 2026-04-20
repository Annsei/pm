"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  AuthError,
  addCollaboratorApi,
  listCollaboratorsApi,
  removeCollaboratorApi,
  updateCollaboratorRoleApi,
  type BoardRole,
  type CollaboratorEntry,
  type CollaboratorRole,
} from "@/lib/api";

interface CollaboratorPanelProps {
  boardId: string;
  open: boolean;
  onClose: () => void;
  onAuthLost: () => void;
  currentUserId: string;
  viewerRole: BoardRole;
  onSelfLeave?: () => void;
}

const ROLE_LABELS: Record<BoardRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

const ROLE_BADGE: Record<BoardRole, string> = {
  owner: "bg-[var(--navy-dark)] text-white",
  editor: "bg-[var(--secondary-purple)] text-white",
  viewer: "bg-[var(--surface)] text-[var(--navy-dark)]",
};

export function CollaboratorPanel({
  boardId,
  open,
  onClose,
  onAuthLost,
  currentUserId,
  viewerRole,
  onSelfLeave,
}: CollaboratorPanelProps) {
  const [entries, setEntries] = useState<CollaboratorEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>("viewer");
  const [inviting, setInviting] = useState(false);
  const isOwner = viewerRole === "owner";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listCollaboratorsApi(boardId));
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthLost();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [boardId, onAuthLost]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = inviteName.trim();
    if (!name || inviting) return;
    setInviting(true);
    setError(null);
    try {
      const entry = await addCollaboratorApi(boardId, name, inviteRole);
      setEntries((prev) => [...prev, entry]);
      setInviteName("");
      setInviteRole("viewer");
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthLost();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Failed to invite user");
    } finally {
      setInviting(false);
    }
  };

  const handleChangeRole = async (entry: CollaboratorEntry, role: CollaboratorRole) => {
    if (entry.role === role) return;
    setBusyId(entry.user_id);
    setError(null);
    try {
      const updated = await updateCollaboratorRoleApi(boardId, entry.user_id, role);
      setEntries((prev) =>
        prev.map((e) => (e.user_id === entry.user_id ? updated : e))
      );
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthLost();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Failed to change role");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (entry: CollaboratorEntry) => {
    const isSelf = entry.user_id === currentUserId;
    const confirmMsg = isSelf
      ? "Leave this board? You will lose access."
      : `Remove ${entry.display_name || entry.username}?`;
    if (!window.confirm(confirmMsg)) return;
    setBusyId(entry.user_id);
    setError(null);
    try {
      await removeCollaboratorApi(boardId, entry.user_id);
      if (isSelf && onSelfLeave) {
        onSelfLeave();
        return;
      }
      setEntries((prev) => prev.filter((e) => e.user_id !== entry.user_id));
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthLost();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Failed to remove");
    } finally {
      setBusyId(null);
    }
  };

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-label="Board members"
      className="fixed right-0 top-0 z-40 flex h-screen w-[380px] flex-col border-l border-[var(--stroke)] bg-white shadow-[-4px_0_24px_rgba(3,33,71,0.08)]"
    >
      <header className="flex items-center justify-between border-b border-[var(--stroke)] px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
            Sharing
          </p>
          <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
            Board members
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stroke)] text-[var(--navy-dark)] hover:bg-[var(--surface)]"
          aria-label="Close members"
        >
          ×
        </button>
      </header>

      {isOwner && (
        <form
          onSubmit={handleInvite}
          className="flex flex-col gap-2 border-b border-[var(--stroke)] px-5 py-4"
        >
          <label
            htmlFor="invite-username"
            className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]"
          >
            Invite by username
          </label>
          <div className="flex gap-2">
            <input
              id="invite-username"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="username"
              className="flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
              required
              autoComplete="off"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as CollaboratorRole)}
              aria-label="Role"
              className="rounded-xl border border-[var(--stroke)] bg-white px-2 py-2 text-sm"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={inviting || !inviteName.trim()}
            className="self-start rounded-xl bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {inviting ? "Inviting…" : "Invite"}
          </button>
        </form>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading && entries.length === 0 && (
          <p className="text-sm text-[var(--gray-text)]">Loading…</p>
        )}
        {error && (
          <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => {
            const isSelf = entry.user_id === currentUserId;
            const canEditRole = isOwner && !entry.is_owner;
            const canRemove = (isOwner && !entry.is_owner) || (isSelf && !entry.is_owner);
            return (
              <li
                key={entry.user_id}
                className="rounded-2xl border border-[var(--stroke)] bg-white/80 px-4 py-3 text-sm shadow-sm"
                data-testid={`collab-${entry.user_id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--navy-dark)]">
                      {entry.display_name || entry.username}
                      {isSelf && (
                        <span className="ml-1 text-xs font-normal text-[var(--gray-text)]">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-[var(--gray-text)]">
                      @{entry.username}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ROLE_BADGE[entry.role]}`}
                    data-testid={`collab-${entry.user_id}-role`}
                  >
                    {ROLE_LABELS[entry.role]}
                  </span>
                </div>
                {(canEditRole || canRemove) && (
                  <div className="mt-3 flex items-center gap-2">
                    {canEditRole && (
                      <select
                        value={entry.role}
                        onChange={(e) =>
                          handleChangeRole(entry, e.target.value as CollaboratorRole)
                        }
                        disabled={busyId === entry.user_id}
                        aria-label={`Change role for ${entry.username}`}
                        className="rounded-full border border-[var(--stroke)] bg-white px-2 py-1 text-xs"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                      </select>
                    )}
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => handleRemove(entry)}
                        disabled={busyId === entry.user_id}
                        className="ml-auto rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        {isSelf ? "Leave" : "Remove"}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {!loading && entries.length === 0 && !error && (
          <p className="text-sm text-[var(--gray-text)]">No members yet.</p>
        )}
      </div>
    </aside>
  );
}
