import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ProfileDialog } from "@/components/ProfileDialog";

const { useAuth } = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth,
}));

const baseUser = {
  id: "u1",
  username: "alice",
  email: "alice@example.com",
  display_name: "Alice A",
};

beforeEach(() => {
  useAuth.mockReset();
});

function withAuth(overrides: Partial<{
  updateProfile: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  user: typeof baseUser | null;
}> = {}) {
  const updateProfile = overrides.updateProfile ?? vi.fn().mockResolvedValue({ ok: true });
  const logout = overrides.logout ?? vi.fn().mockResolvedValue(undefined);
  const user = overrides.user === undefined ? baseUser : overrides.user;
  useAuth.mockReturnValue({ user, updateProfile, logout });
  return { updateProfile, logout };
}

describe("ProfileDialog", () => {
  it("prefills with user values and submits changes", async () => {
    const { updateProfile } = withAuth();
    render(<ProfileDialog onClose={vi.fn()} />);
    const displayName = screen.getByLabelText(/display name/i);
    expect(displayName).toHaveValue("Alice A");
    await userEvent.clear(displayName);
    await userEvent.type(displayName, "Ally");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ display_name: "Ally" })
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/updated/i);
  });

  it("requires current password when setting a new password", async () => {
    const { updateProfile } = withAuth();
    render(<ProfileDialog onClose={vi.fn()} />);
    await userEvent.type(
      screen.getByLabelText(/^new password$/i),
      "newpass123"
    );
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /current password is required/i
    );
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("forwards password updates once current password is provided", async () => {
    const { updateProfile } = withAuth();
    render(<ProfileDialog onClose={vi.fn()} />);
    await userEvent.type(
      screen.getByLabelText(/^current password$/i),
      "oldpass"
    );
    await userEvent.type(
      screen.getByLabelText(/^new password$/i),
      "brandnew1"
    );
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        current_password: "oldpass",
        new_password: "brandnew1",
      })
    );
  });

  it("shows backend error message", async () => {
    const updateProfile = vi
      .fn()
      .mockResolvedValue({ ok: false, message: "Email already registered" });
    withAuth({ updateProfile });
    render(<ProfileDialog onClose={vi.fn()} />);
    const email = screen.getByLabelText(/email/i);
    await userEvent.clear(email);
    await userEvent.type(email, "taken@example.com");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already registered/i);
  });

  it("shows a friendly message when the form is unchanged", async () => {
    withAuth();
    render(<ProfileDialog onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no changes to save/i);
  });

  it("logs out when the log out button is pressed", async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    withAuth({ logout });
    render(<ProfileDialog onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(logout).toHaveBeenCalled();
  });

  it("renders nothing when there is no user", () => {
    withAuth({ user: null });
    const { container } = render(<ProfileDialog onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
