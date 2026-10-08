import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";

const root = path.resolve(".tools", "native-smoke-" + randomUUID());
await mkdir(root, { recursive: true });
const executable = path.resolve("src-tauri/target/debug/money-manager.exe");
const password = "Native smoke test password";
const results = [];
let active;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function launch(name) {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const data = path.join(root, name);
  await mkdir(data, { recursive: true });
  const child = spawn(executable, [], {
    windowsHide: true,
    env: {
      ...process.env,
      MM_TEST_DATA_DIR: data,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=" + port,
      WEBVIEW2_USER_DATA_FOLDER: path.join(data, "webview"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  active = { child, data };
  let browser;
  for (let retry = 0; retry < 90; retry++) {
    if (child.exitCode !== null)
      throw new Error("Native app exited: " + child.exitCode + " " + output);
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:" + port, {
        timeout: 1000,
      });
      break;
    } catch {
      await pause(500);
    }
  }
  if (!browser)
    throw new Error("WebView2 debugging endpoint did not start. " + output);
  active.browser = browser;
  let page;
  for (let retry = 0; retry < 60; retry++) {
    page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find(
        (item) =>
          item.url().includes("1420") ||
          item.url().includes("tauri.localhost") ||
          item.url().startsWith("tauri:"),
      );
    if (page) break;
    await pause(500);
  }
  if (!page)
    throw new Error(
      "Native application page was not created. Targets: " +
        JSON.stringify(
          browser
            .contexts()
            .flatMap((context) => context.pages())
            .map((page) => page.url()),
        ) +
        " " +
        output,
    );
  page.setDefaultTimeout(120000);
  active.page = page;
  return page;
}
async function stop() {
  if (!active) return;
  if (active.browser) await active.browser.close().catch(() => {});
  if (active.child.exitCode === null)
    spawnSync("taskkill", ["/PID", String(active.child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  active = undefined;
  await pause(700);
}
async function invoke(page, request) {
  return page.evaluate(
    (request) => window.__TAURI_INTERNALS__.invoke("execute", { request }),
    request,
  );
}
try {
  let page = await launch("original");
  await expect(
    page.getByRole("heading", { name: "A fresh start for your finances." }),
  ).toBeVisible({ timeout: 120000 });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Vault name", exact: true })
    .fill("Native smoke vault");
  await page.getByLabel("Vault password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Account name", exact: true })
    .fill("Smoke bank");
  await page
    .getByRole("textbox", { name: "Opening balance", exact: true })
    .fill("1000.00");
  await page
    .getByRole("button", { name: "Create my vault", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your money, at a glance." }),
  ).toBeVisible({ timeout: 120000 });
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const form = page.getByRole("dialog");
  await form
    .getByRole("textbox", { name: "Amount", exact: true })
    .fill("12.35");
  await form
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "Groceries" });
  await form
    .getByRole("textbox", { name: "Description (optional)", exact: true })
    .fill("Native smoke expense");
  await form
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Smoke bank/ })).toContainText(
    "987.65",
  );
  results.push(
    "Native UI setup and expense through Rust IPC update account balance",
  );
  console.log(results.at(-1));
  await page.screenshot({
    path: "docs/screenshots/native-dashboard.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Description (optional)", exact: true })
    .fill("Unsaved native draft");
  await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("plugin:window|close", { label: "main" }),
  );
  await expect(
    page.getByRole("heading", { name: "Discard unsaved changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("textbox", { name: "Description (optional)", exact: true }),
  ).toHaveValue("Unsaved native draft");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  results.push(
    "Native window close preserves unsaved drafts until explicit discard",
  );
  console.log(results.at(-1));
  await expect(
    page.locator(".cashflow-chart .chart-grid span").first(),
  ).toHaveText("12.35");
  const originalData = active.data;
  await stop();
  page = await launch("original");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible({ timeout: 120000 });
  await page.getByLabel("Vault password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await expect(page.getByRole("link", { name: /Smoke bank/ })).toContainText(
    "987.65",
    { timeout: 120000 },
  );
  const accounts = await invoke(page, { op: "list_accounts" });
  expect(
    accounts.find((account) => account.name === "Smoke bank").balance,
  ).toBe("987.65");
  const bytes = await readFile(path.join(originalData, "money-manager.vault"));
  expect(bytes.includes(Buffer.from("Native smoke expense"))).toBe(false);
  results.push(
    "Process restart and password unlock preserve encrypted committed data",
  );
  console.log(results.at(-1));
  const backup = path.join(root, "portable-backup.vault");
  expect(await invoke(page, { op: "create_backup", path: backup })).toBe(
    backup,
  );
  await stop();
  page = await launch("restored");
  await expect(
    page.getByRole("heading", { name: "A fresh start for your finances." }),
  ).toBeVisible({ timeout: 120000 });
  const preview = await invoke(page, {
    op: "preview_restore",
    path: backup,
    password,
  });
  expect(preview.account_count).toBe(1);
  await invoke(page, { op: "commit_restore", token: preview.token });
  await page.reload();
  await expect(page.getByRole("link", { name: /Smoke bank/ })).toContainText(
    "987.65",
    { timeout: 120000 },
  );
  expect((await invoke(page, { op: "list_accounts" }))[0].balance).toBe(
    "987.65",
  );
  results.push(
    "Encrypted backup restores through Rust IPC to a separate app data directory",
  );
  console.log(results.at(-1));
  const restoredAccounts = await invoke(page, { op: "list_accounts" });
  const categories = await invoke(page, { op: "list_categories" });
  const localDate = await page.evaluate(() => {
    const date = new Date();
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  });
  await invoke(page, {
    op: "create_refund",
    request: {
      kind: "refund",
      account_id: restoredAccounts[0].id,
      destination_id: null,
      category_id: categories.find((category) => category.name === "Groceries")
        .id,
      amount: "20.00",
      date: localDate,
      description: "Native refund chart check",
      payee: "",
      notes: "",
      splits: [],
      idempotency_key: randomUUID(),
    },
  });
  await page.reload();
  await expect(
    page.locator(".cashflow-chart .chart-grid span").last(),
  ).toHaveText("-7.65");
  const month = localDate.slice(0, 7);
  expect((await invoke(page, { op: "get_dashboard", month })).expenses).toBe(
    "-7.65",
  );
  await page.screenshot({
    path: "docs/screenshots/native-refund-chart.png",
    fullPage: true,
  });
  results.push(
    "Small amounts retain precision and net refunds plot below zero",
  );
  console.log(results.at(-1));
  await writeFile(
    "docs/native-verification.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        platform: process.platform,
        results,
        limitation:
          "Separate data directories on the same Windows profile; clean profile and offline installation remain release gates.",
      },
      null,
      2,
    ),
  );
} finally {
  await stop();
}
