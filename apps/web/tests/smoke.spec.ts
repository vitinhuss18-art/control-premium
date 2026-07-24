import { expect, test } from "@playwright/test";

test("carrega o protótipo oficial sem alterar a interface", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Control\$ Premium/);

  const frame = page.frameLocator(
    'iframe[title="Control Premium — Protótipo Oficial V1"]',
  );
  await expect(frame.locator("#splash")).toBeVisible();
  await expect(frame.locator("#login")).toBeVisible({ timeout: 5_000 });
});
