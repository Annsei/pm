import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { CardCommentsPanel } from "@/components/CardCommentsPanel";
import type { CardCommentEntry } from "@/lib/api";

const {
  listCardCommentsApi,
  addCardCommentApi,
  updateCardCommentApi,
  deleteCardCommentApi,
} = vi.hoisted(() => ({
  listCardCommentsApi: vi.fn(),
  addCardCommentApi: vi.fn(),
  updateCardCommentApi: vi.fn(),
  deleteCardCommentApi: vi.fn(),
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
    listCardCommentsApi,
    addCardCommentApi,
    updateCardCommentApi,
    deleteCardCommentApi,
  };
});

beforeEach(() => {
  listCardCommentsApi.mockReset();
  addCardCommentApi.mockReset();
  updateCardCommentApi.mockReset();
  deleteCardCommentApi.mockReset();
});

function makeComment(overrides: Partial<CardCommentEntry> = {}): CardCommentEntry {
  return {
    id: "c1",
    board_id: "b1",
    card_id: "card-1",
    user_id: "u-alice",
    username: "alice",
    user_display_name: "Alice",
    body: "Hello there",
    created_at: "2026-04-20T05:00:00",
    updated_at: "2026-04-20T05:00:00",
    edited: false,
    ...overrides,
  };
}

describe("CardCommentsPanel", () => {
  it("renders existing comments", async () => {
    listCardCommentsApi.mockResolvedValue([
      makeComment({ body: "Nice work!" }),
      makeComment({
        id: "c2",
        body: "Needs update",
        user_id: "u-bob",
        user_display_name: "Bob",
        edited: true,
        updated_at: "2026-04-20T05:10:00",
      }),
    ]);
    render(
      <CardCommentsPanel
        boardId="b1"
        cardId="card-1"
        currentUserId="u-alice"
        canComment={true}
        canModerate={false}
      />
    );
    expect(await screen.findByText("Nice work!")).toBeInTheDocument();
    expect(screen.getByText("Needs update")).toBeInTheDocument();
    expect(screen.getByText(/Comments \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/· edited/)).toBeInTheDocument();
  });

  it("allows posting a new comment", async () => {
    listCardCommentsApi.mockResolvedValue([]);
    addCardCommentApi.mockResolvedValue(makeComment({ body: "Great feature" }));
    render(
      <CardCommentsPanel
        boardId="b1"
        cardId="card-1"
        currentUserId="u-alice"
        canComment={true}
        canModerate={false}
      />
    );
    await waitFor(() => expect(listCardCommentsApi).toHaveBeenCalled());
    await userEvent.type(screen.getByLabelText(/new comment/i), "Great feature");
    await userEvent.click(screen.getByRole("button", { name: /post comment/i }));
    await waitFor(() =>
      expect(addCardCommentApi).toHaveBeenCalledWith("b1", "card-1", "Great feature")
    );
    expect(await screen.findByText("Great feature")).toBeInTheDocument();
  });

  it("hides the post form in read-only mode", async () => {
    listCardCommentsApi.mockResolvedValue([makeComment()]);
    render(
      <CardCommentsPanel
        boardId="b1"
        cardId="card-1"
        currentUserId="u-alice"
        canComment={false}
        canModerate={false}
      />
    );
    await waitFor(() => expect(listCardCommentsApi).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /post comment/i })).toBeNull();
    expect(screen.queryByLabelText(/new comment/i)).toBeNull();
  });

  it("lets the author edit their own comment", async () => {
    listCardCommentsApi.mockResolvedValue([makeComment({ body: "before" })]);
    updateCardCommentApi.mockResolvedValue(
      makeComment({
        body: "after",
        edited: true,
        updated_at: "2026-04-20T06:00:00",
      })
    );
    render(
      <CardCommentsPanel
        boardId="b1"
        cardId="card-1"
        currentUserId="u-alice"
        canComment={true}
        canModerate={false}
      />
    );
    await screen.findByText("before");
    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    const editArea = screen.getByLabelText(/edit comment body/i);
    await userEvent.clear(editArea);
    await userEvent.type(editArea, "after");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(updateCardCommentApi).toHaveBeenCalledWith(
        "b1",
        "card-1",
        "c1",
        "after"
      )
    );
    expect(await screen.findByText("after")).toBeInTheDocument();
  });

  it("hides edit for non-authors and allows owner to delete others'", async () => {
    listCardCommentsApi.mockResolvedValue([
      makeComment({
        id: "bob-1",
        user_id: "u-bob",
        user_display_name: "Bob",
        body: "bob wrote this",
      }),
    ]);
    deleteCardCommentApi.mockResolvedValue(undefined);
    render(
      <CardCommentsPanel
        boardId="b1"
        cardId="card-1"
        currentUserId="u-alice"
        canComment={true}
        canModerate={true}
      />
    );
    const entry = await screen.findByTestId("comment-bob-1");
    // No edit button for non-authors.
    expect(within(entry).queryByRole("button", { name: /^edit$/i })).toBeNull();
    // Owner can delete.
    const deleteBtn = within(entry).getByRole("button", { name: /delete comment/i });
    await userEvent.click(deleteBtn);
    await waitFor(() =>
      expect(deleteCardCommentApi).toHaveBeenCalledWith("b1", "card-1", "bob-1")
    );
    await waitFor(() =>
      expect(screen.queryByText("bob wrote this")).not.toBeInTheDocument()
    );
  });

  it("surfaces a load error", async () => {
    listCardCommentsApi.mockRejectedValue(new Error("boom"));
    render(
      <CardCommentsPanel
        boardId="b1"
        cardId="card-1"
        currentUserId="u-alice"
        canComment={true}
        canModerate={false}
      />
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/boom/);
  });

  it("calls onAuthLost when API throws AuthError", async () => {
    const api = await import("@/lib/api");
    listCardCommentsApi.mockRejectedValue(
      new (api.AuthError as typeof Error)("nope")
    );
    const onAuthLost = vi.fn();
    render(
      <CardCommentsPanel
        boardId="b1"
        cardId="card-1"
        currentUserId="u-alice"
        canComment={true}
        canModerate={false}
        onAuthLost={onAuthLost}
      />
    );
    await waitFor(() => expect(onAuthLost).toHaveBeenCalled());
  });

  it("shows empty state when there are no comments", async () => {
    listCardCommentsApi.mockResolvedValue([]);
    render(
      <CardCommentsPanel
        boardId="b1"
        cardId="card-1"
        currentUserId="u-alice"
        canComment={true}
        canModerate={false}
      />
    );
    expect(await screen.findByText(/no comments yet/i)).toBeInTheDocument();
  });
});
