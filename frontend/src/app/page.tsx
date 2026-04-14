"use client";

import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { AuthProvider, useAuth } from "@/lib/auth";

const AppContent = () => {
  const { isAuthenticated, userId, login, logout } = useAuth();

  if (!isAuthenticated || !userId) {
    return <LoginForm onLogin={login} />;
  }

  return (
    <div className="relative">
      <KanbanBoard userId={userId} />
      <button
        onClick={logout}
        className="fixed top-6 right-6 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
      >
        Logout
      </button>
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
