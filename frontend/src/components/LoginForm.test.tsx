import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { LoginForm } from "@/components/LoginForm";

const { loginMock, registerMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
  registerMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    login: loginMock,
    register: registerMock,
  }),
}));

beforeEach(() => {
  loginMock.mockReset();
  registerMock.mockReset();
});

describe("LoginForm", () => {
  it("submits login with username and password", async () => {
    loginMock.mockResolvedValue(true);
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(loginMock).toHaveBeenCalledWith("alice", "secret123");
  });

  it("shows an error when login fails", async () => {
    loginMock.mockResolvedValue(false);
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid credentials/i);
  });

  it("can switch to register mode and submit", async () => {
    registerMock.mockResolvedValue({ ok: true });
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: /create one/i }));
    await userEvent.type(screen.getByLabelText(/username/i), "newuser");
    await userEvent.type(screen.getByLabelText(/^email/i), "new@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(registerMock).toHaveBeenCalledWith(
      expect.objectContaining({ username: "newuser", email: "new@example.com", password: "secret123" })
    );
  });

  it("shows register error", async () => {
    registerMock.mockResolvedValue({ ok: false, message: "Username already taken" });
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: /create one/i }));
    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already taken/i);
  });
});
