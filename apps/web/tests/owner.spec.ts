import { expect, test } from "@playwright/test";

const ownerRows = [
  {
    tenant_id: "11111111-1111-4111-8111-111111111111",
    company_name: "Empresa de teste",
    tenant_status: "active",
    admin_full_name: "Responsável de teste",
    admin_email: "teste@example.com",
    plan_name: "Plano Premium",
    price_cents: 4990,
    subscription_status: "active",
    trial_ends_at: null,
    client_count: 3,
    active_loans_count: 1,
    total_principal_lent_cents: 100000,
    overdue_installments_count: 0,
    overdue_amount_cents: 0,
    tenant_created_at: "2026-08-01T12:00:00.000Z",
  },
];

const ownerPlans = [
  {
    plan_id: "22222222-2222-4222-8222-222222222222",
    code: "premium",
    name: "Plano Premium",
    active: true,
    price_cents: 4990,
    currency: "BRL",
    billing_interval: "monthly",
  },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "sb-project-auth-token",
      JSON.stringify({
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: "33333333-3333-4333-8333-333333333333",
          aud: "authenticated",
          role: "authenticated",
          email: "owner@example.com",
          app_metadata: { role: "super_admin" },
          user_metadata: {},
          created_at: "2026-08-01T12:00:00.000Z",
        },
      }),
    );
  });

  await page.route(
    "https://project.supabase.co/rest/v1/rpc/**",
    async (route) => {
      const functionName = new URL(route.request().url()).pathname
        .split("/")
        .at(-1);
      const response =
        functionName === "owner_dashboard_overview"
          ? ownerRows
          : functionName === "owner_list_plans"
            ? ownerPlans
            : null;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(response),
      });
    },
  );
});

test("abre o gerenciamento ao tocar no nome e mostra validação no modal", async ({
  page,
}) => {
  await page.goto("/owner");

  await page.getByRole("button", { name: "Empresa de teste" }).click();
  const dialog = page.getByRole("dialog", { name: "Empresa de teste" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Conceder dias grátis" }).click();
  await expect(
    dialog.getByRole("alert").getByText("Informe o motivo da alteração."),
  ).toBeVisible();
  await expect(
    dialog.getByLabel("Motivo da alteração (obrigatório)"),
  ).toBeFocused();
});

test("mantém as ações do assinante visíveis no celular", async ({ page }) => {
  test.skip(
    (page.viewportSize()?.width ?? 1280) > 620,
    "Cenário exclusivo do celular",
  );

  await page.goto("/owner");

  await expect(
    page.getByRole("button", { name: "Gerenciar plano e cortesia" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Suspender acesso" }),
  ).toBeVisible();
});
