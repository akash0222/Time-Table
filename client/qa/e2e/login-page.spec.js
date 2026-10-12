import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
  });

  test("shows accessible sign-in controls and supports password visibility", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
    await expect(page.locator("#login-username")).toBeVisible();
    const password = page.locator("#login-password");
    await expect(password).toHaveAttribute("type", "password");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide password" })).toBeVisible();

    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("shows subtle academic artwork on desktop and hides it on compact layouts", async ({ page }) => {
    const artwork = page.locator(".login-academic-art");
    await expect(artwork).toBeVisible();
    await expect(artwork).toHaveAttribute("aria-hidden", "true");

    await page.setViewportSize({ width: 768, height: 900 });
    await expect(artwork).toBeHidden();
    await expect(page.locator("#login-username")).toBeVisible();
  });

  test("announces invalid credentials without exposing server details", async ({ page }) => {
    await page.route("**/api/auth/login", async route => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "Invalid username or password." })
      });
    });

    await page.locator("#login-username").fill("invalid-user");
    await page.locator("#login-password").fill("invalid-password");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByRole("alert")).toHaveText("Invalid username or password.");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeEnabled();
  });
});
