import { expect, test } from "@playwright/test";

test("mostra a entrada do assinante", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Control\$ Premium/);
  await expect(
    page.getByRole("heading", { name: /Controle sua operação/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Cadastrar minha empresa/i }),
  ).toBeVisible();
});

test("abre login e cadastro", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(
    page.getByRole("heading", { name: "Entre no seu painel" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Voltar/i }).click();
  await page.getByRole("button", { name: /Cadastrar minha empresa/i }).click();
  await expect(
    page.getByRole("heading", { name: "Crie sua conta" }),
  ).toBeVisible();
  await expect(
    page.getByText(/7 dias de experiência • até 15 clientes/i),
  ).toBeVisible();
});

test("mantém o painel operacional disponível", async ({ page }) => {
  await page.goto("/painel");
  const frame = page.frameLocator(
    'iframe[title="Painel do assinante Control Premium"]',
  );
  await expect(frame.locator("#splash")).toBeVisible();
  await expect(frame.locator("#login")).toBeVisible({ timeout: 5_000 });
});
