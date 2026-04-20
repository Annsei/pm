import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import {
  ActivityDrawer,
  describeActivity,
} from "@/components/ActivityDrawer";
import type { ActivityEntry } from "@/lib/api";

const sample: ActivityEntry[] = [
  {
    id: "a1",
    action: "card_add",
    meta: { title: "Ship feature", column_title: "To Do" },
    user_id: "u1",
    user_display_name: "Alice",
    username: "alice",
    created_at: "2026-04-20T05:30:00",
  },
  {
    id: "a2",
    action: "card_move",
    meta: {
      title: "Ship feature",
      from_column: "To Do",
      to_column: "Done",
      source: "ai",
    },
    user_id: "u1",
    user_display_name: "Alice",
    username: "alice",
    created_at: "2026-04-20T05:35:00",
  },
];

const { listBoardActivity } = vi.hoisted(() => ({
  listBoardActivity: vi.fn(),
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
  return { AuthError, ApiError, listBoardActivity };
});

beforeEach(() => {
  listBoardActivity.mockReset();
});

describe("describeActivity", () => {
  it("formats card_add entries", () => {
    expect(
      describeActivity({
        id: "x",
        action: "card_add",
        meta: { title: "Fix bug", column_title: "To Do" },
        user_id: "u",
        user_display_name: null,
        username: null,
        created_at: "2026-04-20T00:00:00",
      })
    ).toBe('Added card “Fix bug” to To Do');
  });

  it("formats card_move entries", () => {
    expect(
      describeActivity({
        id: "x",
        action: "card_move",
        meta: { title: "T", from_column: "A", to_column: "B" },
        user_id: "u",
        user_display_name: null,
        username: null,
        created_at: "2026-04-20T00:00:00",
      })
    ).toBe('Moved “T” from A to B');
  });

  it("formats board_meta_update with changes", () => {
    const result = describeActivity({
      id: "x",
      action: "board_meta_update",
      meta: { changes: { name: { from: "Old", to: "New" } } },
      user_id: "u",
      user_display_name: null,
      username: null,
      created_at: "2026-04-20T00:00:00",
    });
    expect(result).toContain("Updated board");
    expect(result).toContain("name");
    expect(result).toContain("Old");
    expect(result).toContain("New");
  });
});

describe("ActivityDrawer", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ActivityDrawer
        boardId="b1"
        open={false}
        onClose={vi.fn()}
        onAuthLost={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("loads and renders activity entries when opened", async () => {
    listBoardActivity.mockResolvedValue(sample);
    render(
      <ActivityDrawer
        boardId="b1"
        open
        onClose={vi.fn()}
        onAuthLost={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(listBoardActivity).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ limit: expect.any(Number) })
      )
    );
    expect(
      await screen.findByText(/Added card .Ship feature./i)
    ).toBeInTheDocument();
    expect(screen.getByText(/via AI/i)).toBeInTheDocument();
    expect(screen.getAllByText(/by Alice/).length).toBeGreaterThan(0);
  });

  it("shows empty state when there is no activity", async () => {
    listBoardActivity.mockResolvedValue([]);
    render(
      <ActivityDrawer
        boardId="b1"
        open
        onClose={vi.fn()}
        onAuthLost={vi.fn()}
      />
    );
    await waitFor(() => expect(listBoardActivity).toHaveBeenCalled());
    expect(await screen.findByText(/no activity yet/i)).toBeInTheDocument();
  });

  it("refetches when the refresh button is clicked", async () => {
    listBoardActivity.mockResolvedValue([]);
    render(
      <ActivityDrawer
        boardId="b1"
        open
        onClose={vi.fn()}
        onAuthLost={vi.fn()}
      />
    );
    await waitFor(() => expect(listBoardActivity).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(listBoardActivity).toHaveBeenCalledTimes(2));
  });

  it("invokes onAuthLost on AuthError", async () => {
    const api = await import("@/lib/api");
    listBoardActivity.mockRejectedValue(
      new (api.AuthError as typeof Error)("nope")
    );
    const onAuthLost = vi.fn();
    render(
      <ActivityDrawer
        boardId="b1"
        open
        onClose={vi.fn()}
        onAuthLost={onAuthLost}
      />
    );
    await waitFor(() => expect(onAuthLost).toHaveBeenCalled());
  });

  it("passes selected kinds when filter changes", async () => {
    listBoardActivity.mockResolvedValue([]);
    render(
      <ActivityDrawer
        boardId="b1"
        open
        onClose={vi.fn()}
        onAuthLost={vi.fn()}
      />
    );
    await waitFor(() => expect(listBoardActivity).toHaveBeenCalled());
    const select = screen.getByLabelText(/activity kind filter/i);
    await userEvent.selectOptions(
      select,
      "card_add,card_move,card_edit,card_delete"
    );
    await waitFor(() => {
      const last =
        listBoardActivity.mock.calls[listBoardActivity.mock.calls.length - 1];
      expect(last[1]).toEqual(
        expect.objectContaining({
          kinds: ["card_add", "card_move", "card_edit", "card_delete"],
        })
      );
    });
  });

  it("appends older entries when Load more is clicked", async () => {
    const firstPage = Array.from({ length: 25 }, (_, i) => ({
      ...sample[0],
      id: `a${i}`,
      created_at: `2026-04-20T05:${String(25 - i).padStart(2, "0")}:00`,
    }));
    const olderPage = [
      {
        ...sample[0],
        id: "older-1",
        created_at: "2026-04-19T00:00:00",
      },
    ];
    listBoardActivity.mockResolvedValueOnce(firstPage);
    listBoardActivity.mockResolvedValueOnce(olderPage);
    render(
      <ActivityDrawer
        boardId="b1"
        open
        onClose={vi.fn()}
        onAuthLost={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(listBoardActivity).toHaveBeenCalledTimes(1)
    );
    const loadMore = await screen.findByRole("button", { name: /load more/i });
    await userEvent.click(loadMore);
    await waitFor(() =>
      expect(listBoardActivity).toHaveBeenCalledTimes(2)
    );
    const secondCall = listBoardActivity.mock.calls[1];
    expect(secondCall[1]).toEqual(
      expect.objectContaining({
        before: firstPage[firstPage.length - 1].created_at,
      })
    );
  });

  it("calls onClose when close button is clicked", async () => {
    listBoardActivity.mockResolvedValue([]);
    const onClose = vi.fn();
    render(
      <ActivityDrawer
        boardId="b1"
        open
        onClose={onClose}
        onAuthLost={vi.fn()}
      />
    );
    await waitFor(() => expect(listBoardActivity).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: /close activity/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
