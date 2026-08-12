import { expect, test } from "@playwright/test";

test("exige aceite e assinatura eletrônica no cadastro por link", async ({
  page,
}) => {
  await page.goto("/cadastro?token=convite-de-teste");

  await expect(
    page.getByRole("heading", { name: "Aceite e assinatura eletrônica" }),
  ).toBeVisible();
  await expect(
    page.getByText(/o envio não garante aprovação nem liberação de valor/i),
  ).toBeVisible();
  await expect(
    page.getByLabel("Digite seu nome completo para assinar *"),
  ).toBeVisible();
  await expect(
    page.getByLabel(/Li, concordo e confirmo minha assinatura eletrônica/i),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Assinar e enviar proposta" }),
  ).toBeVisible();
});
