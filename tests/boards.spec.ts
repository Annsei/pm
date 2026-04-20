import { test, expect } from "@playwright/test";

const uniqueUser = () => `e2e_${Math.random().toString(36).slice(2, 10)}`;

async function registerAndLogin(page, username: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /create one/i }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByRole("heading", { name: "Boards" })).toBeVisible();
}

test.describe("Boards", () => {
  test("shows a default board for a brand new user", async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await expect(page.getByText("My First Board")).toBeVisible();
  });

  test("creates a new board and opens it", async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await page.getByLabel(/new board name/i).fill("Roadmap");
    await page.getByRole("button", { name: /create board/i }).click();
    await expect(page.getByText("Roadmap")).toBeVisible();

    await page.getByText("Roadmap").click();
    await expect(page.getByRole("heading", { name: "Roadmap" })).toBeVisible();
    // Should show 5 kanban columns on the detail view.
    await expect(page.locator("[data-testid^='column-']")).toHaveCount(5);
  });

  test("returns from a board back to the board list", async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await page.getByText("My First Board").click();
    await expect(page.getByRole("heading", { name: "My First Board" })).toBeVisible();
    await page.getByRole("button", { name: /back to boards/i }).click();
    await expect(page.getByRole("heading", { name: "Boards" })).toBeVisible();
  });

  test("creates a card on a board", async ({ page }) => {
    await registerAndLogin(page, uniqueUser());
    await page.getByText("My First Board").click();
    await expect(page.locator("[data-testid^='column-']").first()).toBeVisible();

    const firstColumn = page.locator("[data-testid^='column-']").first();
    await firstColumn.getByRole("button", { name: /add a card/i }).click();
    await firstColumn.getByPlaceholder("Card title").fill("Ship iteration");
    await firstColumn.getByPlaceholder("Details").fill("End-to-end check");
    await firstColumn.getByRole("button", { name: /^add card$/i }).click();
    await expect(firstColumn.getByText("Ship iteration")).toBeVisible();
  });
});
