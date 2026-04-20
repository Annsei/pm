import { test, expect } from "@playwright/test";

const uniqueUser = () => `user_${Math.random().toString(36).slice(2, 10)}`;

test.describe("Authentication", () => {
  test("shows login form initially", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Kanban Studio");
    await expect(page.locator("text=Sign in to your account")).toBeVisible();
  });

  test("logs in with correct credentials", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Username").fill("user");
    await page.getByLabel("Password").fill("password");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByRole("heading", { name: "Boards" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  });

  test("shows error with incorrect credentials", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Username").fill("user");
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("alert")).toContainText(/invalid credentials/i);
  });

  test("registers a new user and reaches the board list", async ({ page }) => {
    const username = uniqueUser();
    await page.goto("/");
    await page.getByRole("button", { name: /create one/i }).click();
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill("secret123");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.getByRole("heading", { name: "Boards" })).toBeVisible();
    await expect(page.getByText("My First Board")).toBeVisible();
  });

  test("persists login across page reloads", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Username").fill("user");
    await page.getByLabel("Password").fill("password");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("heading", { name: "Boards" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Boards" })).toBeVisible();
  });

  test("logs out successfully", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Username").fill("user");
    await page.getByLabel("Password").fill("password");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("heading", { name: "Boards" })).toBeVisible();

    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page.getByText("Sign in to your account")).toBeVisible();
  });
});
