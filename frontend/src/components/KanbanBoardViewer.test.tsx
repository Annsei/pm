import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardSummary } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const { initialData } = await import("@/lib/kanban");
  class AuthError extends Error {
    status = 401;
  }
  class ApiError extends Error {
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.status = status;
    }
  }
  return {
    AuthError,
    ApiError,
    getBoard: vi.fn().mockResolvedValue(initialData),
    updateBoard: vi.fn().mockResolvedValue(undefined),
    listCollaboratorsApi: vi.fn().mockResolvedValue([]),
    addCollaboratorApi: vi.fn(),
    updateCollaboratorRoleApi: vi.fn(),
    removeCollaboratorApi: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "u-bob", username: "bob", display_name: "Bob", email: null },
    isAuthenticated: true,
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

const viewerMeta: BoardSummary = {
  id: "shared-1",
  name: "Shared Board",
  description: "",
  color: "#209dd7",
  is_archived: false,
  position: 0,
  card_count: 0,
  column_count: 5,
  created_at: "2026-01-01T00:00:00",
  updated_at: "2026-01-01T00:00:00",
  role: "viewer",
  owner_id: "u-alice",
  owner_username: "alice",
  owner_display_name: "Alice",
  is_shared: true,
};

const editorMeta: BoardSummary = { ...viewerMeta, role: "editor" };

describe("KanbanBoard read-only modes", () => {
  it("hides write controls for viewers", async () => {
    render(<KanbanBoard board={viewerMeta} onBack={vi.fn()} onAuthLost={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5)
    );
    // Add-card buttons + AI button hidden.
    expect(screen.queryByRole("button", { name: /add a card/i })).toBeNull();
    expect(screen.queryByTitle(/open ai chat/i)).toBeNull();
    // Role badge + sharing label visible.
    expect(screen.getByTestId("board-role-badge")).toHaveTextContent(/viewer/i);
    expect(screen.getByText(/shared by alice/i)).toBeInTheDocument();
  });

  it("shows AI chat trigger for editors", async () => {
    render(<KanbanBoard board={editorMeta} onBack={vi.fn()} onAuthLost={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5)
    );
    expect(screen.getByTitle(/open ai chat/i)).toBeInTheDocument();
    expect(screen.getByTestId("board-role-badge")).toHaveTextContent(/editor/i);
  });
});
