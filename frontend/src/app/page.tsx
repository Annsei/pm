"use client";

import { useCallback, useState } from "react";
import { BoardList } from "@/components/BoardList";
import { DashboardView } from "@/components/DashboardView";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ProfileDialog } from "@/components/ProfileDialog";
import { AuthProvider, useAuth } from "@/lib/auth";
import type { BoardSummary } from "@/lib/api";

const AppContent = () => {
  const { user, loading, logout } = useAuth();
  const [selected, setSelected] = useState<BoardSummary | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);

  const handleAuthLost = useCallback(async () => {
    await logout();
    setSelected(null);
  }, [logout]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--gray-text)]">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  if (selected) {
    return (
      <div className="relative">
        <KanbanBoard
          board={selected}
          onBack={() => setSelected(null)}
          onAuthLost={handleAuthLost}
        />
        {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="relative">
      <BoardList
        onSelect={setSelected}
        onAuthLost={handleAuthLost}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenDashboard={() => setDashboardOpen(true)}
      />
      <div className="fixed top-4 right-4 flex items-center gap-3">
        <NotificationsBell onAuthLost={handleAuthLost} />
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--navy-dark)] shadow-sm hover:bg-[var(--surface)]"
        >
          {user.display_name || user.username}
        </button>
        <button
          onClick={logout}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          Logout
        </button>
      </div>
      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}
      <DashboardView
        open={dashboardOpen}
        onClose={() => setDashboardOpen(false)}
        onAuthLost={handleAuthLost}
      />
    </div>
  );
};

export default function Home() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
