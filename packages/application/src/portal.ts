import { assertTenantAccess, calculateOutstandingCents } from "@control-premium/domain";

import type { ContractRecord } from "./contracts";
import type { LoanRecord } from "./loans";

export type ClientPortalSnapshot = Readonly<{
  clientId: string;
  loans: readonly Readonly<{
    loanId: string;
    status: LoanRecord["status"];
    principalCents: number;
    contractedTotalCents: number;
    outstandingCents: number;
    installments: LoanRecord["installments"];
    receipts: readonly Readonly<{
      receiptNumber: string;
      amountCents: number;
      paidAt: string;
      status: "confirmed" | "reversed";
    }>[];
    contracts: readonly Readonly<{
      contractId: string;
      version: number;
      status: ContractRecord["status"];
      signedPath?: string;
    }>[];
  }>[];
}>;

export function buildClientPortalSnapshot(input: {
  tenantId: string;
  clientId: string;
  loans: readonly LoanRecord[];
  contracts: readonly ContractRecord[];
}): ClientPortalSnapshot {
  for (const loan of input.loans) {
    assertTenantAccess(input.tenantId, loan.tenantId);
    if (loan.clientId !== input.clientId) {
      throw new Error("Empréstimo pertence a outro cliente.");
    }
  }
  for (const contract of input.contracts) {
    assertTenantAccess(input.tenantId, contract.tenantId);
  }

  return Object.freeze({
    clientId: input.clientId,
    loans: Object.freeze(
      input.loans.map((loan) =>
        Object.freeze({
          loanId: loan.id,
          status: loan.status,
          principalCents: loan.principalCents,
          contractedTotalCents: loan.contractedTotalCents,
          outstandingCents: calculateOutstandingCents(loan.installments),
          installments: loan.installments,
          receipts: Object.freeze(
            loan.payments.map((payment) =>
              Object.freeze({
                receiptNumber: payment.receiptNumber,
                amountCents: payment.amountCents,
                paidAt: payment.paidAt,
                status: payment.status,
              }),
            ),
          ),
          contracts: Object.freeze(
            input.contracts
              .filter((contract) => contract.loanId === loan.id)
              .map((contract) =>
                Object.freeze({
                  contractId: contract.id,
                  version: contract.version,
                  status: contract.status,
                  ...(contract.signed
                    ? { signedPath: contract.signed.path }
                    : {}),
                }),
              ),
          ),
        }),
      ),
    ),
  });
}
