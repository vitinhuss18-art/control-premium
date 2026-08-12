export const PROPOSAL_CONSENT_VERSION = "proposal-consent-v1-2026-08-11";

export const PROPOSAL_CONSENT_TEXT =
  "Declaro que os dados e documentos enviados são verdadeiros e autorizo seu uso para cadastro, análise da proposta, prevenção a fraudes e contato sobre esta solicitação. Compreendo que o envio não garante aprovação nem liberação de valor. As condições financeiras finais — valor, juros, parcelas, vencimentos, encargos e forma de pagamento — deverão ser apresentadas antes da contratação e dependerão de novo aceite. Confirmo que li e concordo com este termo, e que digitar meu nome completo e marcar a caixa equivale à minha assinatura eletrônica nesta proposta.";

export const PROPOSAL_CONSENT_SHA256 =
  "485e0579d223d816b17952e9679b249103fa7be38b425d90756a893fdd8d67f6";

export function normalizeSignatureName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}
