import { test, expect } from "@playwright/test";

test.use({ baseURL: "http://localhost:8080" });

test("add: 2 + 3 = 5", async ({ page }) => {
  await page.goto("/");
  await page.fill("#a", "2");
  await page.selectOption("#op", "add");
  await page.fill("#b", "3");
  await page.click("#compute");
  await expect(page.locator("#out")).toContainText('"result": 5');
});

test("sub: 5 - 2 = 3", async ({ page }) => {
  await page.goto("/");
  await page.fill("#a", "5");
  await page.selectOption("#op", "sub");
  await page.fill("#b", "2");
  await page.click("#compute");
  await expect(page.locator("#out")).toContainText('"result": 3');
});

test("mul: 5 * 2 = 10", async ({ page }) => {
  await page.goto("/");
  await page.fill("#a", "5");
  await page.selectOption("#op", "mul");
  await page.fill("#b", "2");
  await page.click("#compute");
  await expect(page.locator("#out")).toContainText('"result": 10');
});
