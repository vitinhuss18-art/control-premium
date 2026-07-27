import { expect, test } from "@playwright/test";

test("mostra a entrada do assinante", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Control\$ Premium/);
  await expect(
    page.getByRole("heading", { name: /Controle sua operação/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bem-vindo de volta" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Entrar e continuar" }),
  ).toBeVisible();
});

test("abre login e cadastro", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cadastre-se" }).click();
  await expect(
    page.getByRole("heading", { name: "Crie sua conta" }),
  ).toBeVisible();
  await expect(
    page.getByText(/7 dias de experiência • até 15 clientes/i),
  ).toBeVisible();
  await expect(page.getByLabel("Confirme seu e-mail")).toBeVisible();
  await expect(page.getByLabel("Telefone")).toBeVisible();
  await expect(page.getByLabel("Confirmar senha")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Criar conta e continuar" }),
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
