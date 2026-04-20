import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardSummary } from "@/lib/api";

const { exportBoardApi } = vi.hoisted(() => ({ exportBoardApi: vi.fn() }));

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
    exportBoardApi,
    listBoardActivity: vi.fn().mockResolvedValue([]),
    listCardCommentsApi: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "u1", username: "alice", display_name: "Alice", email: null },
    isAuthenticated: true,
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

const boardMeta: BoardSummary = {
  id: "board-1",
  name: "Test Board",
  description: "",
  color: "#209dd7",
  is_archived: false,
  position: 0,
  card_count: 0,
  column_count: 5,
  created_at: "2026-01-01T00:00:00",
  updated_at: "2026-01-01T00:00:00",
  role: "owner",
  owner_id: "u1",
  owner_username: "alice",
  owner_display_name: "Alice",
  is_shared: false,
};

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders five columns", async () => {
    render(<KanbanBoard board={boardMeta} onBack={vi.fn()} onAuthLost={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    });
  });

  it("renames a column", async () => {
    render(<KanbanBoard board={boardMeta} onBack={vi.fn()} onAuthLost={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    });
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard board={boardMeta} onBack={vi.fn()} onAuthLost={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    });
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", { name: /add a card/i });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("exports the board via the Export button", async () => {
    exportBoardApi.mockResolvedValue({
      version: 1,
      name: "Test Board",
      description: "",
      color: "#209dd7",
      data: { columns: [], cards: {} },
      comments: [],
      exported_at: null,
    });
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();

    render(<KanbanBoard board={boardMeta} onBack={vi.fn()} onAuthLost={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    });
    await userEvent.click(screen.getByRole("button", { name: /^export$/i }));
    await waitFor(() => expect(exportBoardApi).toHaveBeenCalledWith("board-1"));

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevoke;
  });

  it("opens the shortcut help dialog on `?`", async () => {
    render(<KanbanBoard board={boardMeta} onBack={vi.fn()} onAuthLost={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    });
    await userEvent.keyboard("?");
    expect(
      await screen.findByRole("dialog", { name: /keyboard shortcuts/i })
    ).toBeInTheDocument();
    // Esc closes it.
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /keyboard shortcuts/i })
      ).toBeNull()
    );
  });

  it("focuses the search filter on `/`", async () => {
    render(<KanbanBoard board={boardMeta} onBack={vi.fn()} onAuthLost={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    });
    await userEvent.keyboard("/");
    const filter = screen.getByLabelText(/search cards/i);
    expect(filter).toHaveFocus();
  });

  it("opens the add-card form on `n`", async () => {
    render(<KanbanBoard board={boardMeta} onBack={vi.fn()} onAuthLost={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    });
    await userEvent.keyboard("n");
    const firstColumn = screen.getAllByTestId(/column-/i)[0];
    expect(
      within(firstColumn).getByPlaceholderText(/card title/i)
    ).toBeInTheDocument();
  });

  it("invokes onBack when back button clicked", async () => {
    const onBack = vi.fn();
    render(<KanbanBoard board={boardMeta} onBack={onBack} onAuthLost={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    });
    await userEvent.click(screen.getByRole("button", { name: /back to boards/i }));
    expect(onBack).toHaveBeenCalled();
  });
});
