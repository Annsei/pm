"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";

interface ProfileDialogProps {
  onClose: () => void;
}

export function ProfileDialog({ onClose }: ProfileDialogProps) {
  const { user, updateProfile, logout } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    const params: Parameters<typeof updateProfile>[0] = {};
    if (displayName.trim() !== user.display_name) {
      params.display_name = displayName.trim();
    }
    if ((email || null) !== (user.email ?? null)) {
      params.email = email.trim() === "" ? null : email.trim();
    }
    if (newPassword) {
      if (!currentPassword) {
        setError("Current password is required to set a new password");
        setSaving(false);
        return;
      }
      params.current_password = currentPassword;
      params.new_password = newPassword;
    }
    if (Object.keys(params).length === 0) {
      setSaving(false);
      setError("No changes to save");
      return;
    }
    const result = await updateProfile(params);
    setSaving(false);
    if (result.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setSuccess("Profile updated.");
    } else {
      setError(result.message);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Profile settings"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(3,33,71,0.45)] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
              Profile
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-[var(--navy-dark)]">
              {user.username}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close profile"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-[var(--gray-text)] hover:bg-[var(--surface)]"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="profile-display-name"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
            >
              Display name
            </label>
            <input
              id="profile-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
              maxLength={120}
            />
          </div>
          <div>
            <label
              htmlFor="profile-email"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
            >
              Email
            </label>
            <input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
              placeholder="you@example.com"
            />
          </div>

          <fieldset className="rounded-2xl border border-[var(--stroke)] p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Change password
            </legend>
            <div className="flex flex-col gap-3">
              <div>
                <label
                  htmlFor="profile-current-password"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
                >
                  Current password
                </label>
                <input
                  id="profile-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
                />
              </div>
              <div>
                <label
                  htmlFor="profile-new-password"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
                >
                  New password
                </label>
                <input
                  id="profile-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  className="w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]"
                />
              </div>
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {success && (
            <p
              role="status"
              className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            >
              {success}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
            >
              Log out
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:brightness-110 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
