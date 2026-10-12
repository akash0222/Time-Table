import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/health", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, database: "connected" })
      });
    });
    await page.goto("/dashboard");
  });

  test("shows accessible sign-in controls and supports password visibility", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
    await expect(page.locator("#login-username")).toBeVisible();
    const password = page.locator("#login-password");
    await expect(password).toHaveAttribute("type", "password");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Sign-in service ready");

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide password" })).toBeVisible();

    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("keeps the entire login card visible in a short desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 750 });
    const card = page.locator(".login-shell");
    await expect(card).toBeVisible();
    await expect(card).toBeInViewport({ ratio: 1 });
    await expect(page.locator("#login-username")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
  });

  test("shows subtle academic artwork on desktop and hides it on compact layouts", async ({ page }) => {
    const artwork = page.locator(".login-academic-art");
    await expect(artwork).toBeVisible();
    await expect(artwork).toHaveAttribute("aria-hidden", "true");
    await expect(artwork).toHaveCSS("opacity", "0.24");


    await page.setViewportSize({ width: 768, height: 900 });
    await expect(artwork).toBeHidden();
    await expect(page.locator("#login-username")).toBeVisible();
  });

  test("shows a Caps Lock warning when the password field reports Caps Lock", async ({ page }) => {
    await page.locator("#login-password").dispatchEvent("keydown", {
      key: "A",
      code: "KeyA",
      bubbles: true
    });
    // The browser owns modifier state. Trigger the same input handler with an event
    // whose getModifierState reports Caps Lock, without changing OS keyboard settings.
    await page.locator("#login-password").evaluate(element => {
      const event = new KeyboardEvent("keyup", { key: "A", code: "KeyA", bubbles: true });
      Object.defineProperty(event, "getModifierState", { value: modifier => modifier === "CapsLock" });
      element.dispatchEvent(event);
    });
    await expect(page.locator(".login-caps-lock-warning")).toContainText("Caps Lock is on");
  });

  test("uses a friendly message for backend failures and shows a loading state", async ({ page }) => {
    await page.route("**/api/auth/login", async route => {
      await new Promise(resolve => setTimeout(resolve, 300));
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "MongoNetworkError: internal server details" })
      });
    });

    await page.locator("#login-username").fill("admin");
    await page.locator("#login-password").fill("example-password");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    await expect(page.locator("#login-username")).toBeDisabled();
    await expect(page.getByRole("alert")).toHaveText("Sign-in is temporarily unavailable. Please try again shortly.");
    await expect(page.getByText("MongoNetworkError: internal server details")).toHaveCount(0);
    await expect(page.locator("#login-username")).toBeEnabled();
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
