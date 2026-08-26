import { expect, test } from "@playwright/test";

const portalData = {
  fullName: "Cliente Teste",
  status: "approved",
  tenantName: "Control Premium",
  tenantWhatsapp: "27999999999",
  loans: [
    {
      loanId: "loan-current",
      operationType: "loan",
      status: "active",
      principalCents: 100_000,
      contractedTotalCents: 120_000,
      outstandingCents: 80_000,
      amortizationAvailable: true,
      createdAt: "2026-08-01T12:00:00.000Z",
      installments: [
        {
          sequenceNumber: 1,
          dueDate: "2026-08-25",
          totalCents: 20_000,
          paidCents: 0,
          status: "pending",
        },
      ],
    },
  ],
};

test("mostra saldo e ações do empréstimo na ordem solicitada", async ({
  page,
}) => {
  await page.route("**/api/cliente/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(portalData),
    }),
  );

  await page.goto("/cliente");

  await expect(page.getByText("Valor total devido")).toBeVisible();
  await expect(page.getByText("R$ 800,00").first()).toBeVisible();

  const actions = page.locator(".loan-card__actions a");
  await expect(actions).toHaveText([
    "Pagar juros",
    "Quitar empréstimo",
    "Amortizar empréstimo",
  ]);
});

test("oculta amortização quando o contrato não está em dia", async ({
  page,
}) => {
  await page.route("**/api/cliente/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...portalData,
        loans: [
          {
            ...portalData.loans[0],
            status: "delinquent",
            amortizationAvailable: false,
          },
        ],
      }),
    }),
  );

  await page.goto("/cliente");

  await expect(page.getByRole("link", { name: "Pagar juros" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Quitar empréstimo" }),
  ).toBeVisible();
  await expect(page.getByText("Amortizar empréstimo")).toHaveCount(0);
});

test("não mostra empréstimos ou parcelas cancelados", async ({ page }) => {
  await page.route("**/api/cliente/data", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...portalData,
        loans: [
          {
            ...portalData.loans[0],
            installments: [
              ...portalData.loans[0]!.installments,
              {
                sequenceNumber: 2,
                dueDate: "2026-09-25",
                totalCents: 20_000,
                paidCents: 0,
                status: "cancelled",
              },
            ],
          },
          {
            ...portalData.loans[0],
            loanId: "loan-cancelled",
            status: "cancelled",
            outstandingCents: 50_000,
            amortizationAvailable: false,
            createdAt: "2026-08-10T12:00:00.000Z",
          },
        ],
      }),
    }),
  );

  await page.goto("/cliente");

  await expect(page.locator(".loan-card")).toHaveCount(1);
  await expect(page.getByText("R$ 800,00").first()).toBeVisible();
  await expect(page.getByText("Parcela 2", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Cancelado", { exact: false })).toHaveCount(0);
});
