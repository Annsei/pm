import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import {
  NotificationsBell,
  describeNotification,
} from "@/components/NotificationsBell";
import type { NotificationEntry } from "@/lib/api";

const {
  listNotificationsApi,
  markNotificationReadApi,
  markAllNotificationsReadApi,
} = vi.hoisted(() => ({
  listNotificationsApi: vi.fn(),
  markNotificationReadApi: vi.fn(),
  markAllNotificationsReadApi: vi.fn(),
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
    listNotificationsApi,
    markNotificationReadApi,
    markAllNotificationsReadApi,
  };
});

beforeEach(() => {
  listNotificationsApi.mockReset();
  markNotificationReadApi.mockReset();
  markAllNotificationsReadApi.mockReset();
});

function mkEntry(overrides: Partial<NotificationEntry> = {}): NotificationEntry {
  return {
    id: "n1",
    kind: "comment_mention",
    board_id: "b1",
    board_name: "Launch",
    card_id: "card-1",
    comment_id: "c1",
    actor_id: "u-alice",
    actor_username: "alice",
    actor_display_name: "Alice",
    meta: {},
    read: false,
    created_at: "2026-04-20T05:00:00",
    ...overrides,
  };
}

describe("describeNotification", () => {
  it("describes a comment_mention", () => {
    expect(describeNotification(mkEntry())).toBe('Alice mentioned you on "Launch"');
  });

  it("falls back to username when display name is missing", () => {
    expect(
      describeNotification(
        mkEntry({ actor_display_name: null, actor_username: "bob" })
      )
    ).toContain("bob");
  });

  it("describes a collaborator_added with the assigned role", () => {
    expect(
      describeNotification(
        mkEntry({
          kind: "collaborator_added",
          meta: { role: "editor" },
          board_name: "Ship",
        })
      )
    ).toBe('Alice added you as editor on "Ship"');
  });
});

describe("NotificationsBell", () => {
  it("shows an unread badge with the current count", async () => {
    listNotificationsApi.mockResolvedValue([
      mkEntry({ id: "n1", read: false }),
      mkEntry({ id: "n2", read: false }),
      mkEntry({ id: "n3", read: true }),
    ]);
    render(<NotificationsBell />);
    await waitFor(() => expect(listNotificationsApi).toHaveBeenCalled());
    const badge = await screen.findByTestId("notification-unread-badge");
    expect(badge).toHaveTextContent("2");
  });

  it("hides the badge when everything is read", async () => {
    listNotificationsApi.mockResolvedValue([
      mkEntry({ id: "n1", read: true }),
    ]);
    render(<NotificationsBell />);
    await waitFor(() => expect(listNotificationsApi).toHaveBeenCalled());
    expect(screen.queryByTestId("notification-unread-badge")).toBeNull();
  });

  it("marks a single notification as read", async () => {
    listNotificationsApi.mockResolvedValue([mkEntry({ id: "n1", read: false })]);
    markNotificationReadApi.mockResolvedValue(undefined);
    render(<NotificationsBell />);
    await waitFor(() => expect(listNotificationsApi).toHaveBeenCalled());
    await userEvent.click(
      screen.getByRole("button", { name: /notifications/i })
    );
    const entry = await screen.findByTestId("notification-n1");
    await userEvent.click(
      within(entry).getByRole("button", { name: /mark read/i })
    );
    await waitFor(() =>
      expect(markNotificationReadApi).toHaveBeenCalledWith("n1")
    );
    expect(screen.queryByTestId("notification-unread-badge")).toBeNull();
  });

  it("marks everything read via the dropdown button", async () => {
    listNotificationsApi.mockResolvedValue([
      mkEntry({ id: "n1", read: false }),
      mkEntry({ id: "n2", read: false }),
    ]);
    markAllNotificationsReadApi.mockResolvedValue(undefined);
    render(<NotificationsBell />);
    await waitFor(() => expect(listNotificationsApi).toHaveBeenCalled());
    await userEvent.click(
      screen.getByRole("button", { name: /notifications/i })
    );
    await userEvent.click(screen.getByRole("button", { name: /mark all read/i }));
    await waitFor(() =>
      expect(markAllNotificationsReadApi).toHaveBeenCalledTimes(1)
    );
    expect(screen.queryByTestId("notification-unread-badge")).toBeNull();
  });

  it("shows an empty state when there are no notifications", async () => {
    listNotificationsApi.mockResolvedValue([]);
    render(<NotificationsBell />);
    await waitFor(() => expect(listNotificationsApi).toHaveBeenCalled());
    await userEvent.click(
      screen.getByRole("button", { name: /notifications/i })
    );
    expect(await screen.findByText(/no notifications/i)).toBeInTheDocument();
  });

  it("forwards AuthError to the onAuthLost callback", async () => {
    const api = await import("@/lib/api");
    listNotificationsApi.mockRejectedValue(
      new (api.AuthError as typeof Error)("nope")
    );
    const onAuthLost = vi.fn();
    render(<NotificationsBell onAuthLost={onAuthLost} />);
    await waitFor(() => expect(onAuthLost).toHaveBeenCalled());
  });
});
