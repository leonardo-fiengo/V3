import { expect, test } from "@playwright/test";
test("six routes render, expense validates and updates the dashboard", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/dashboard");
  await expect(
    page.getByRole("heading", { name: "Your money, at a glance." }),
  ).toBeVisible();
  await expect(
    page.getByText("Browser preview · sample data", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/dashboard.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Amount", exact: true }).fill("0");
  await dialog
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Groceries" });
  await dialog
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(
    dialog.getByText("Enter an amount greater than zero."),
  ).toBeVisible();
  await expect(
    dialog.getByRole("textbox", { name: "Amount", exact: true }),
  ).toHaveValue("0");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Discard unsaved changes?" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Amount", exact: true }),
  ).toHaveValue("0");
  await dialog
    .getByRole("textbox", { name: "Amount", exact: true })
    .fill("12.35");
  await dialog
    .getByLabel("Description (optional)")
    .fill("Browser workflow expense");
  await dialog
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Browser workflow expense")).toBeVisible();
  for (const label of [
    "Transactions",
    "Accounts",
    "Budgets",
    "Reports",
    "Settings",
  ]) {
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(page.locator("main h1")).toBeVisible();
  }
  await expect(page.getByLabel("Vault name")).toBeVisible();
  expect(errors).toEqual([]);
});
test("transaction detail preserves filters and supports corrections", async ({
  page,
}) => {
  await page.goto("/#/transactions?search=Weekly");
  await expect(page.getByLabel("Search transactions")).toHaveValue("Weekly");
  const first = page.getByRole("button", { name: /Weekly groceries/ }).first();
  await first.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByLabel("Search transactions")).toHaveValue("Weekly");
  await first.click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const form = page.getByRole("dialog").last();
  await form.getByRole("textbox", { name: "Amount", exact: true }).fill("9.50");
  await form.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    page.getByText("Corrected or voided", { exact: true }),
  ).toBeVisible();
});
test("budget editing and accessible reports", async ({ page }) => {
  await page.goto("/#/budgets");
  await page
    .getByRole("button", { name: "Set Groceries budget", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Monthly allocation").fill("350");
  await d.getByRole("button", { name: "Save budget" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator("tr").filter({
      has: page.getByRole("button", { name: "Groceries", exact: true }),
    }),
  ).toContainText("350.00");
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "Net worth", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Net worth", exact: true }),
  ).toBeVisible();
});
test("keyboard focus and reduced-motion layout at Windows scaling", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/#/dashboard");
  await expect(page.locator("main h1")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/dashboard-scaled.png",
    fullPage: true,
  });
});
