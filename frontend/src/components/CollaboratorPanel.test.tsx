import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { CollaboratorPanel } from "@/components/CollaboratorPanel";

const {
  listCollaboratorsApi,
  addCollaboratorApi,
  updateCollaboratorRoleApi,
  removeCollaboratorApi,
} = vi.hoisted(() => ({
  listCollaboratorsApi: vi.fn(),
  addCollaboratorApi: vi.fn(),
  updateCollaboratorRoleApi: vi.fn(),
  removeCollaboratorApi: vi.fn(),
}));

vi.mock("@/lib/api", () => {
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
    listCollaboratorsApi,
    addCollaboratorApi,
    updateCollaboratorRoleApi,
    removeCollaboratorApi,
  };
});

const baseRows = [
  {
    user_id: "u1",
    username: "alice",
    display_name: "Alice",
    role: "owner" as const,
    is_owner: true,
    added_at: "2026-01-01T00:00:00",
  },
  {
    user_id: "u2",
    username: "bob",
    display_name: "Bob",
    role: "viewer" as const,
    is_owner: false,
    added_at: "2026-01-02T00:00:00",
  },
];

beforeEach(() => {
  listCollaboratorsApi.mockReset();
  addCollaboratorApi.mockReset();
  updateCollaboratorRoleApi.mockReset();
  removeCollaboratorApi.mockReset();
});

describe("CollaboratorPanel", () => {
  it("renders members with role badges when open", async () => {
    listCollaboratorsApi.mockResolvedValue(baseRows);
    render(
      <CollaboratorPanel
        boardId="b1"
        open
        onClose={vi.fn()}
        onAuthLost={vi.fn()}
        currentUserId="u1"
        viewerRole="owner"
      />
    );
    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByTestId("collab-u1-role")).toHaveTextContent(/owner/i);
    expect(screen.getByTestId("collab-u2-role")).toHaveTextContent(/viewer/i);
  });

  it("renders nothing when closed", () => {
    render(
      <CollaboratorPanel
        boardId="b1"
        open={false}
        onClose={vi.fn()}
        onAuthLost={vi.fn()}
        currentUserId="u1"
        viewerRole="owner"
      />
    );
    expect(listCollaboratorsApi).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/board members/i)).not.toBeInTheDocument();
  });

  it("invites a user when owner submits the form", async () => {
    listCollaboratorsApi.mockResolvedValue(baseRows);
    addCollaboratorApi.mockResolvedValue({
      user_id: "u3",
      username: "carol",
      display_name: "Carol",
      role: "editor",
      is_owner: false,
      added_at: "2026-01-03T00:00:00",
    });
    render(
      <CollaboratorPanel
        boardId="b1"
        open
        onClose={vi.fn()}
        onAuthLost={vi.fn()}
        currentUserId="u1"
        viewerRole="owner"
      />
    );
    await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());

    const input = screen.getByLabelText(/invite by username/i);
    await userEvent.type(input, "carol");
    await userEvent.selectOptions(screen.getAllByRole("combobox")[0], "editor");
    await userEvent.click(screen.getByRole("button", { name: /^invite$/i }));

    await waitFor(() =>
      expect(addCollaboratorApi).toHaveBeenCalledWith("b1", "carol", "editor")
    );
    await waitFor(() => expect(screen.getByText("Carol")).toBeInTheDocument());
  });

  it("hides invite form for non-owners", async () => {
    listCollaboratorsApi.mockResolvedValue(baseRows);
    render(
      <CollaboratorPanel
        boardId="b1"
        open
        onClose={vi.fn()}
        onAuthLost={vi.fn()}
        currentUserId="u2"
        viewerRole="editor"
      />
    );
    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    expect(screen.queryByLabelText(/invite by username/i)).not.toBeInTheDocument();
  });

  it("changes a collaborator role", async () => {
    listCollaboratorsApi.mockResolvedValue(baseRows);
    updateCollaboratorRoleApi.mockResolvedValue({
      ...baseRows[1],
      role: "editor",
    });
    render(
      <CollaboratorPanel
        boardId="b1"
        open
        onClose={vi.fn()}
        onAuthLost={vi.fn()}
        currentUserId="u1"
        viewerRole="owner"
      />
    );
    await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());

    const select = screen.getByLabelText(/change role for bob/i);
    await userEvent.selectOptions(select, "editor");

    await waitFor(() =>
      expect(updateCollaboratorRoleApi).toHaveBeenCalledWith("b1", "u2", "editor")
    );
    await waitFor(() =>
      expect(screen.getByTestId("collab-u2-role")).toHaveTextContent(/editor/i)
    );
  });

  it("removes a collaborator after confirmation", async () => {
    listCollaboratorsApi.mockResolvedValue(baseRows);
    removeCollaboratorApi.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <CollaboratorPanel
        boardId="b1"
        open
        onClose={vi.fn()}
        onAuthLost={vi.fn()}
        currentUserId="u1"
        viewerRole="owner"
      />
    );
    await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());

    const card = screen.getByTestId("collab-u2");
    await userEvent.click(within(card).getByRole("button", { name: /remove/i }));

    await waitFor(() =>
      expect(removeCollaboratorApi).toHaveBeenCalledWith("b1", "u2")
    );
    await waitFor(() =>
      expect(screen.queryByText("Bob")).not.toBeInTheDocument()
    );
    confirmSpy.mockRestore();
  });

  it("calls onSelfLeave when collaborator removes themself", async () => {
    listCollaboratorsApi.mockResolvedValue(baseRows);
    removeCollaboratorApi.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSelfLeave = vi.fn();

    render(
      <CollaboratorPanel
        boardId="b1"
        open
        onClose={vi.fn()}
        onAuthLost={vi.fn()}
        currentUserId="u2"
        viewerRole="viewer"
        onSelfLeave={onSelfLeave}
      />
    );
    await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());

    const card = screen.getByTestId("collab-u2");
    await userEvent.click(within(card).getByRole("button", { name: /leave/i }));

    await waitFor(() => expect(onSelfLeave).toHaveBeenCalled());
    confirmSpy.mockRestore();
  });

  it("surfaces invite failure messages without crashing", async () => {
    listCollaboratorsApi.mockResolvedValue(baseRows);
    const api = await import("@/lib/api");
    addCollaboratorApi.mockRejectedValue(
      new (api.ApiError as new (m: string, s: number) => Error)(
        "User not found",
        404
      )
    );
    render(
      <CollaboratorPanel
        boardId="b1"
        open
        onClose={vi.fn()}
        onAuthLost={vi.fn()}
        currentUserId="u1"
        viewerRole="owner"
      />
    );
    await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/invite by username/i), "ghost");
    await userEvent.click(screen.getByRole("button", { name: /^invite$/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/user not found/i)
    );
  });
});
