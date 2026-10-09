import { expect, test } from "@playwright/test";
test("dashboard, working transaction validation, and all routes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/dashboard");
  await expect(
    page.getByRole("heading", {
      name: /Good (morning|afternoon|evening), Fiengo/,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Preview mode · synthetic sample data/),
  ).toBeVisible();
  await expect(page.locator(".net-worth-hero")).toContainText("Net worth");
  await expect(page.locator(".cumulative-chart svg")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/dashboard.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await page.getByRole("button", { name: /^Expense/ }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("textbox", { name: "Amount", exact: true }).fill("0");
  await d
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Groceries" });
  await d
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(d.getByText("Enter an amount greater than zero.")).toBeVisible();
  await d.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    d.getByRole("heading", { name: "Discard unsaved changes?" }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(
    d.getByRole("textbox", { name: "Amount", exact: true }),
  ).toHaveValue("0");
  await d.getByRole("textbox", { name: "Amount", exact: true }).fill("12.35");
  await d.getByLabel("Description (optional)").fill("Browser workflow expense");
  await d
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Browser workflow expense")).toBeVisible();
  for (const path of [
    "transactions",
    "accounts",
    "budgets",
    "recurring",
    "orders",
    "money-owed",
    "taxes",
    "reports",
    "settings/general",
  ]) {
    await page.goto("/#/" + path);
    await expect(page.locator(".page-title h1")).toBeVisible();
  }
  expect(errors).toEqual([]);
});
test("detail preserves filters, correction and refund affordance", async ({
  page,
}) => {
  await page.goto("/#/transactions?search=Weekly");
  await expect(page.getByLabel("Search transactions")).toHaveValue("Weekly");
  const row = page.getByRole("button", { name: /Weekly groceries/ }).first();
  await row.click();
  await expect(
    page.getByRole("button", { name: "Refund", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByLabel("Search transactions")).toHaveValue("Weekly");
  await row.click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const form = page.getByRole("dialog").last();
  await form.getByRole("textbox", { name: "Amount", exact: true }).fill("9.50");
  await form.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    page.getByText("Corrected or voided", { exact: true }),
  ).toBeVisible();
});
test("privacy removes charts, monetary values, tables and accessible values", async ({
  page,
}) => {
  await page.goto("/#/dashboard");
  const hero = page.locator(".hero-amount");
  const visible = await hero.innerText();
  expect(visible).toContain("€");
  await page
    .getByRole("button", { name: "Hide balances", exact: true })
    .click();
  await expect(hero).not.toContainText("€");
  await expect(hero).toHaveText("••••");
  await expect(page.locator(".cumulative-chart")).toHaveCount(0);
  await expect(page.locator(".hero-sparkline")).toHaveCount(0);
  expect(await page.locator("main").innerText()).not.toMatch(/€[\d,.]+/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reveal balances", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/#/reports");
  await expect(page.locator(".cumulative-chart")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Spending by category", exact: true })
    .click();
  expect(await page.locator("main").innerText()).not.toMatch(/\d+\.\d%/);
  await page
    .getByRole("button", { name: "Reveal balances", exact: true })
    .click();
  await page.goto("/#/dashboard");
  await expect(page.locator(".cumulative-chart")).toBeVisible();
  await page
    .getByRole("button", { name: "Vault unlocked. Lock vault", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(page.locator(".hero-amount")).toHaveCount(0);
});
test("cash-flow ranges end today and keyboard inspection uses the same point", async ({
  page,
}) => {
  await page.goto("/#/dashboard");
  const today = new Date();
  const iso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  await expect(page.getByLabel("Cash flow end date")).toHaveValue(iso);
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.getByLabel("Cash flow start date")).toHaveValue(
    iso.slice(0, 7) + "-01",
  );
  await expect(page.getByLabel("Cash flow end date")).toHaveValue(iso);
  await page
    .getByText("Inspect daily values with keyboard", { exact: true })
    .click();
  const slider = page.getByLabel("Inspect cash flow date");
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveValue("0");
  await page.keyboard.press("End");
  expect(Number(await slider.inputValue())).toBe(Number(iso.slice(8)) - 1);
  await page.getByText("View accessible daily table", { exact: true }).click();
  const rows = page.locator(".chart-data tbody tr");
  await expect(rows).toHaveCount(Number(iso.slice(8)));
});
test("partial debt repayment and failed reminders remain distinct", async ({
  page,
}) => {
  await page.goto("/#/money-owed");
  const alex = page
    .locator(".card")
    .filter({ has: page.getByRole("heading", { name: "Alex", exact: true }) });
  await alex.getByRole("button", { name: "Remind", exact: true }).click();
  const reminder = page.getByRole("dialog");
  await reminder
    .getByRole("button", { name: "Confirm send", exact: true })
    .click();
  await expect(reminder.getByRole("status")).toContainText("Failed");
  await expect(
    reminder.getByRole("button", { name: "Confirm retry", exact: true }),
  ).toBeEnabled();
  await reminder.getByRole("button", { name: "Close dialog" }).click();
  await reminder.getByRole("button", { name: "Discard changes" }).click();
  await expect(alex).toContainText("€65.00");
  await alex.getByRole("button", { name: "Mark received" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Amount", { exact: true }).fill("20.00");
  await d.getByRole("button", { name: "Record repayment" }).click();
  await expect(d).toHaveCount(0);
  await expect(alex).toContainText("€45.00");
  await expect(alex).toContainText("Outstanding");
});
test("keyboard shortcuts ignore typing and layout fits at scaling", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/#/dashboard");
  await expect(page.locator(".net-worth-hero")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog");
  await expect(search).toBeVisible();
  await search.getByRole("textbox").fill("test");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("t");
  await page.keyboard.press("i");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Income", exact: true }),
  ).toHaveClass(/selected/);
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/dashboard-scaled.png",
    fullPage: true,
  });
});
test("budgets and report tables stay accessible", async ({ page }) => {
  await page.goto("/#/budgets");
  await page
    .getByRole("button", { name: "Set Groceries budget", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Monthly allocation").fill("350");
  await d.getByRole("button", { name: "Save budget" }).click();
  await expect(d).toHaveCount(0);
  await expect(
    page.locator("tr").filter({
      has: page.getByRole("button", { name: "Groceries", exact: true }),
    }),
  ).toContainText("350.00");
  await page.goto("/#/reports");
  await expect(page.getByRole("table").last()).toBeVisible();
  await page.getByRole("button", { name: "Net worth", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "Net worth", exact: true }),
  ).toBeVisible();
});
