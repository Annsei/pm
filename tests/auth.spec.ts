import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should show login form initially", async ({ page }) => {
    await page.goto("http://localhost:8000");

    await expect(page.locator("h1")).toContainText("Kanban Studio");
    await expect(page.locator("text=Sign in to your account")).toBeVisible();
    await expect(page.locator("input[type='text']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
  });

  test("should login with correct credentials", async ({ page }) => {
    await page.goto("http://localhost:8000");

    await page.fill("input[type='text']", "user");
    await page.fill("input[type='password']", "password");
    await page.click("button[type='submit']");

    // Should show kanban board
    await expect(page.locator("text=Single Board Kanban")).toBeVisible();
    await expect(page.locator("text=Logout")).toBeVisible();
  });

  test("should show error with incorrect credentials", async ({ page }) => {
    await page.goto("http://localhost:8000");

    await page.fill("input[type='text']", "wrong");
    await page.fill("input[type='password']", "wrong");
    await page.click("button[type='submit']");

    await expect(page.locator("text=Invalid credentials")).toBeVisible();
  });

  test("should persist login across page reloads", async ({ page }) => {
    await page.goto("http://localhost:8000");

    await page.fill("input[type='text']", "user");
    await page.fill("input[type='password']", "password");
    await page.click("button[type='submit']");

    await expect(page.locator("text=Single Board Kanban")).toBeVisible();

    // Reload page
    await page.reload();

    // Should still be logged in
    await expect(page.locator("text=Single Board Kanban")).toBeVisible();
  });

  test("should logout successfully", async ({ page }) => {
    await page.goto("http://localhost:8000");

    await page.fill("input[type='text']", "user");
    await page.fill("input[type='password']", "password");
    await page.click("button[type='submit']");

    await page.click("text=Logout");

    // Should show login form again
    await expect(page.locator("text=Sign in to your account")).toBeVisible();
  });
});