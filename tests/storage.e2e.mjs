import assert from "node:assert/strict";
import test from "node:test";
import { chromium, expect } from "@playwright/test";
const base = process.env.GRANITE_TEST_URL,
  id = process.env.GRANITE_STORAGE_ID,
  container = process.env.GRANITE_STORAGE_CONTAINER;
assert.ok(base && id && container, "Use npm run test:e2e:storage");
test(
  `${process.env.GRANITE_STORAGE_KIND}: real listing, continuation, filtering, upload, download and delete`,
  { timeout: 60_000 },
  async (t) => {
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/${id}`);
    await expect(page.locator("main")).toContainText("Choose a container");
    await page
      .locator("main")
      .getByRole("button", { name: container, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Load more", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "file-250.txt", exact: true }),
    ).toHaveCount(0);
    const next = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/storage/${id}/objects` &&
        !!response.request().postDataJSON().continuationToken,
    );
    await page.getByRole("button", { name: "Load more", exact: true }).click();
    assert.equal((await next).status(), 200);
    await expect(
      page.getByRole("button", { name: "file-250.txt", exact: true }),
    ).toBeVisible();
    await expect(page.locator("main")).toContainText("252 of 252 loaded");
    await page
      .getByRole("textbox", { name: "Object name prefix" })
      .fill("file-250");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.locator("main")).toContainText("1 of 1 loaded");
    await page
      .getByRole("button", { name: "file-250.txt", exact: true })
      .click();
    const detail = page.locator('[aria-label="Object details"]');
    await expect(detail).toContainText("file-250.txt");
    const presign = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith("/object/presign"),
    );
    await detail.getByRole("button", { name: "Download", exact: true }).click();
    const signed = await presign;
    assert.equal(signed.status(), 200, await signed.text());
    const downloadURL = (await signed.json()).url;
    const response = await fetch(downloadURL);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "Granite storage e2e\n");
    await detail.getByRole("button", { name: "Close object details" }).click();
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Upload file" });
    await dialog
      .locator("input[type=file]")
      .setInputFiles({
        name: "browser-upload.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("from browser"),
      });
    await dialog.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "browser-upload.txt", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Delete browser-upload.txt", exact: true })
      .click();
    await page
      .locator(".inline-confirm")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "browser-upload.txt", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("textbox", { name: "Object name prefix" })
      .fill("nested/");
    await page.getByRole("checkbox", { name: "Subfolders" }).check();
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "nested/child.txt", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByRole("checkbox", { name: "Subfolders" }).uncheck();
    await page
      .getByRole("combobox", { name: "Object type" })
      .selectOption("folders");
    if (
      await page
        .getByRole("button", { name: "Load more", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "Load more", exact: true })
        .click();
    await expect(
      page.locator("main").getByRole("button", { name: "nested", exact: true }),
    ).toBeVisible();
    await page
      .locator("main")
      .getByRole("button", { name: "nested", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "child.txt", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 760, height: 700 });
    await expect(
      page.getByRole("button", { name: "Upload", exact: true }),
    ).toBeInViewport();
    assert.deepEqual(errors, []);
  },
);
