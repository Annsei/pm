import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { BoardList } from "@/components/BoardList";

const ownerMeta = {
  role: "owner" as const,
  owner_id: "u1",
  owner_username: "alice",
  owner_display_name: "Alice",
  is_shared: false,
};

const initialBoards = [
  {
    id: "b1",
    name: "Work",
    description: "",
    color: "#209dd7",
    is_archived: false,
    position: 0,
    card_count: 3,
    column_count: 5,
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-01T00:00:00",
    ...ownerMeta,
  },
  {
    id: "b2",
    name: "Personal",
    description: "Side projects",
    color: "#753991",
    is_archived: false,
    position: 1,
    card_count: 1,
    column_count: 5,
    created_at: "2026-01-02T00:00:00",
    updated_at: "2026-01-02T00:00:00",
    ...ownerMeta,
  },
];

const { listBoards, createBoardApi, patchBoardApi, deleteBoardApi, importBoardApi } =
  vi.hoisted(() => ({
    listBoards: vi.fn(),
    createBoardApi: vi.fn(),
    patchBoardApi: vi.fn(),
    deleteBoardApi: vi.fn(),
    importBoardApi: vi.fn(),
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
    listBoards,
    createBoardApi,
    patchBoardApi,
    deleteBoardApi,
    importBoardApi,
  };
});

beforeEach(() => {
  listBoards.mockReset();
  createBoardApi.mockReset();
  patchBoardApi.mockReset();
  deleteBoardApi.mockReset();
  importBoardApi.mockReset();
});

describe("BoardList", () => {
  it("renders a list of boards", async () => {
    listBoards.mockResolvedValue(initialBoards);
    render(<BoardList onSelect={vi.fn()} onAuthLost={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Work")).toBeInTheDocument());
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByText(/3 cards/i)).toBeInTheDocument();
  });

  it("selects a board when its title is clicked", async () => {
    listBoards.mockResolvedValue(initialBoards);
    const onSelect = vi.fn();
    render(<BoardList onSelect={onSelect} onAuthLost={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Work")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Work"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "b1" }));
  });

  it("creates a new board", async () => {
    listBoards.mockResolvedValue(initialBoards);
    createBoardApi.mockResolvedValue({
      ...initialBoards[0],
      id: "b3",
      name: "Fresh",
    });
    render(<BoardList onSelect={vi.fn()} onAuthLost={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Work")).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/new board name/i), "Fresh");
    await userEvent.click(screen.getByRole("button", { name: /create board/i }));
    await waitFor(() => expect(screen.getByText("Fresh")).toBeInTheDocument());
    expect(createBoardApi).toHaveBeenCalledWith(expect.objectContaining({ name: "Fresh" }));
  });

  it("notifies on auth lost when listing fails with AuthError", async () => {
    const api = await import("@/lib/api");
    listBoards.mockRejectedValue(new (api.AuthError as typeof Error)("nope"));
    const onAuthLost = vi.fn();
    render(<BoardList onSelect={vi.fn()} onAuthLost={onAuthLost} />);
    await waitFor(() => expect(onAuthLost).toHaveBeenCalled());
  });

  it("deletes a board after confirmation", async () => {
    listBoards.mockResolvedValue(initialBoards);
    deleteBoardApi.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<BoardList onSelect={vi.fn()} onAuthLost={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Work")).toBeInTheDocument());
    const card = screen.getByTestId("board-card-b1");
    const deleteButton = within(card).getByRole("button", { name: /delete/i });
    await userEvent.click(deleteButton);

    await waitFor(() => expect(deleteBoardApi).toHaveBeenCalledWith("b1"));
    await waitFor(() => expect(screen.queryByText("Work")).not.toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it("imports a board from a JSON file", async () => {
    listBoards.mockResolvedValue(initialBoards);
    importBoardApi.mockResolvedValue({
      ...initialBoards[0],
      id: "b-import",
      name: "Imported",
    });
    render(<BoardList onSelect={vi.fn()} onAuthLost={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Work")).toBeInTheDocument());

    const payload = {
      version: 1,
      name: "Imported",
      description: "",
      color: "#123456",
      data: {
        columns: [{ id: "c1", title: "Todo", cardIds: [] }],
        cards: {},
      },
      comments: [],
    };
    const file = new File([JSON.stringify(payload)], "board.json", {
      type: "application/json",
    });
    const input = screen.getByLabelText(/import board json/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(importBoardApi).toHaveBeenCalledTimes(1));
    const arg = importBoardApi.mock.calls[0][0];
    expect(arg).toMatchObject({ name: "Imported" });
    expect(await screen.findByText("Imported")).toBeInTheDocument();
  });

  it("reports a friendly error when the imported file is not JSON", async () => {
    listBoards.mockResolvedValue(initialBoards);
    render(<BoardList onSelect={vi.fn()} onAuthLost={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Work")).toBeInTheDocument());
    const file = new File(["not json"], "board.txt", { type: "text/plain" });
    const input = screen.getByLabelText(/import board json/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/not valid json/i);
    expect(importBoardApi).not.toHaveBeenCalled();
  });

  it("opens the dashboard when the Dashboard button is clicked", async () => {
    listBoards.mockResolvedValue(initialBoards);
    const onOpenDashboard = vi.fn();
    render(
      <BoardList
        onSelect={vi.fn()}
        onAuthLost={vi.fn()}
        onOpenDashboard={onOpenDashboard}
      />
    );
    await waitFor(() => expect(screen.getByText("Work")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /^dashboard$/i }));
    expect(onOpenDashboard).toHaveBeenCalled();
  });

  it("opens the profile dialog when the Profile button is clicked", async () => {
    listBoards.mockResolvedValue(initialBoards);
    const onOpenProfile = vi.fn();
    render(
      <BoardList
        onSelect={vi.fn()}
        onAuthLost={vi.fn()}
        onOpenProfile={onOpenProfile}
      />
    );
    await waitFor(() => expect(screen.getByText("Work")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /^profile$/i }));
    expect(onOpenProfile).toHaveBeenCalled();
  });

  it("groups shared boards under their own section and hides owner-only actions", async () => {
    listBoards.mockResolvedValue([
      ...initialBoards,
      {
        id: "b3",
        name: "Team Plan",
        description: "Roadmap",
        color: "#0bad7d",
        is_archived: false,
        position: 0,
        card_count: 7,
        column_count: 5,
        created_at: "2026-02-01T00:00:00",
        updated_at: "2026-02-01T00:00:00",
        role: "viewer" as const,
        owner_id: "u9",
        owner_username: "carol",
        owner_display_name: "Carol",
        is_shared: true,
      },
    ]);
    render(<BoardList onSelect={vi.fn()} onAuthLost={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Team Plan")).toBeInTheDocument());

    expect(screen.getByText(/shared with you/i)).toBeInTheDocument();
    expect(screen.getByText(/your boards/i)).toBeInTheDocument();
    expect(screen.getByText(/owned by carol/i)).toBeInTheDocument();

    const sharedCard = screen.getByTestId("board-card-b3");
    expect(within(sharedCard).queryByRole("button", { name: /delete/i })).toBeNull();
    expect(within(sharedCard).queryByRole("button", { name: /rename/i })).toBeNull();
    expect(within(sharedCard).queryByRole("button", { name: /archive/i })).toBeNull();
    expect(within(sharedCard).getByTestId("board-card-b3-role")).toHaveTextContent(
      /viewer/i
    );

    const ownedCard = screen.getByTestId("board-card-b1");
    expect(within(ownedCard).getByRole("button", { name: /rename/i })).toBeInTheDocument();
  });
});

