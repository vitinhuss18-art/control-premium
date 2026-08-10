import { expect, test } from "@playwright/test";

test("simula uma venda parcelada no painel", async ({ page }) => {
  await page.goto("/painel");

  await page.evaluate(() => {
    const painel = window as Window & { show?: (screen: string) => void };
    painel.show?.("vendas");
  });

  await expect(page.locator("#vendas")).toBeVisible();
  await expect(page.getByText("Registrar nova venda")).toBeVisible();
  await expect(page.locator("#vendaCliente")).toBeVisible();
  await expect(page.locator("#vendaProduto")).toBeVisible();
  await expect(page.locator("#vendaFoto")).toHaveAttribute(
    "accept",
    "image/jpeg,image/png,image/webp",
  );

  await page.locator("#vendaPreco").fill("1000");
  await page.locator("#vendaEntrada").fill("200");
  await page.locator("#vendaParcelas").fill("4");
  await page.locator("#vendaJurosModo").selectOption("total");
  await page.locator("#vendaJuros").fill("20");

  const preview = page.locator("#vendaPreview");
  await expect(preview).toContainText("Valor financiado:");
  await expect(preview).toContainText("R$ 800,00");
  await expect(preview).toContainText("Total das parcelas:");
  await expect(preview).toContainText("R$ 960,00");
  await expect(preview).toContainText("4x de:");
  await expect(preview).toContainText("R$ 240,00");
  await expect(
    page.getByRole("button", { name: "Registrar venda parcelada" }),
  ).toBeVisible();
});

test("impede entrada igual ao preço da venda", async ({ page }) => {
  await page.goto("/painel");

  await page.evaluate(() => {
    const painel = window as Window & { show?: (screen: string) => void };
    painel.show?.("vendas");
  });

  await page.locator("#vendaPreco").fill("500");
  await page.locator("#vendaEntrada").fill("500");

  await expect(page.locator("#vendaPreview")).toContainText(
    "A entrada deve ser menor que o preço da venda.",
  );
});
