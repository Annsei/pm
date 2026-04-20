import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { DashboardView } from "@/components/DashboardView";
import type { DashboardResponse } from "@/lib/api";

const { getDashboardApi } = vi.hoisted(() => ({ getDashboardApi: vi.fn() }));

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
  return { AuthError, ApiError, getDashboardApi };
});

beforeEach(() => {
  getDashboardApi.mockReset();
});

const baseResponse: DashboardResponse = {
  summary: {
    total_boards: 2,
    total_cards: 5,
    overdue_count: 1,
    due_soon_count: 2,
  },
  boards: [
    {
      board_id: "b1",
      name: "Alpha",
      color: "#209dd7",
      role: "owner",
      is_shared: false,
      card_count: 3,
      overdue_count: 1,
      due_soon_count: 1,
    },
    {
      board_id: "b2",
      name: "Shared Beta",
      color: "#753991",
      role: "viewer",
      is_shared: true,
      card_count: 2,
      overdue_count: 0,
      due_soon_count: 1,
    },
  ],
  upcoming: [
    {
      card_id: "c1",
      title: "Ship release",
      priority: "high",
      due_date: "2026-04-18",
      labels: ["launch"],
      board_id: "b1",
      board_name: "Alpha",
      board_color: "#209dd7",
      column_title: "Doing",
      overdue: true,
    },
    {
      card_id: "c2",
      title: "Review PR",
      priority: null,
      due_date: "2026-04-23",
      labels: [],
      board_id: "b2",
      board_name: "Shared Beta",
      board_color: "#753991",
      column_title: "Todo",
      overdue: false,
    },
  ],
};

describe("DashboardView", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <DashboardView open={false} onClose={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
    expect(getDashboardApi).not.toHaveBeenCalled();
  });

  it("shows summary stats, upcoming cards, and board list", async () => {
    getDashboardApi.mockResolvedValue(baseResponse);
    render(<DashboardView open onClose={vi.fn()} />);
    await waitFor(() => expect(getDashboardApi).toHaveBeenCalled());
    expect(await screen.findByTestId("stat-total-boards")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-total-cards")).toHaveTextContent("5");
    expect(screen.getByTestId("stat-overdue")).toHaveTextContent("1");
    expect(screen.getByTestId("stat-due-soon")).toHaveTextContent("2");

    const overdueEntry = screen.getByTestId("upcoming-c1");
    expect(overdueEntry).toHaveTextContent(/Ship release/);
    expect(overdueEntry).toHaveTextContent(/Overdue/);

    expect(screen.getByTestId("dash-board-b1")).toHaveTextContent(/Alpha/);
    expect(screen.getByTestId("dash-board-b2")).toHaveTextContent(/Shared Beta/);
    expect(screen.getByTestId("dash-board-b2")).toHaveTextContent(/shared/i);
  });

  it("shows empty state when no upcoming cards", async () => {
    getDashboardApi.mockResolvedValue({
      summary: {
        total_boards: 1,
        total_cards: 0,
        overdue_count: 0,
        due_soon_count: 0,
      },
      boards: [
        {
          board_id: "b1",
          name: "Empty",
          color: "#209dd7",
          role: "owner",
          is_shared: false,
          card_count: 0,
          overdue_count: 0,
          due_soon_count: 0,
        },
      ],
      upcoming: [],
    });
    render(<DashboardView open onClose={vi.fn()} />);
    expect(await screen.findByText(/no cards with due dates/i)).toBeInTheDocument();
  });

  it("calls onClose when the close button is pressed", async () => {
    getDashboardApi.mockResolvedValue(baseResponse);
    const onClose = vi.fn();
    render(<DashboardView open onClose={onClose} />);
    await waitFor(() => expect(getDashboardApi).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: /close dashboard/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("propagates AuthError via onAuthLost", async () => {
    const api = await import("@/lib/api");
    getDashboardApi.mockRejectedValue(
      new (api.AuthError as typeof Error)("nope")
    );
    const onAuthLost = vi.fn();
    render(<DashboardView open onClose={vi.fn()} onAuthLost={onAuthLost} />);
    await waitFor(() => expect(onAuthLost).toHaveBeenCalled());
  });

  it("shows a friendly error when the API fails", async () => {
    getDashboardApi.mockRejectedValue(new Error("boom"));
    render(<DashboardView open onClose={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/boom/);
  });
});
