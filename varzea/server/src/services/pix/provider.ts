// Abstração da integração Pix (RF32, RNF20).
//
// O ponto pendente nº 4 da documentação ainda não definiu como os pagamentos
// serão identificados automaticamente. Por isso a conferência é feita através
// desta interface: hoje usamos o provedor "manual" (BR Code estático + confirmação
// pela diretoria/comissão no painel). Para automatizar, basta implementar um
// provedor que consulte a API do PSP escolhido (ex.: Pix Cobrança do banco do
// clube, Mercado Pago, Asaas, Efí) e registrá-lo em getPixProvider().

import crypto from "node:crypto";
import { config } from "../../config.js";
import { buildBrCode } from "./brcode.js";

export interface PixChargeInput {
  amountCents: number;
  pixKey: string;
  receiverName: string;
  receiverCity: string;
  description: string;
}

export interface PixCharge {
  txid: string;
  copyPaste: string;
}

export interface PixProvider {
  readonly name: string;
  createCharge(input: PixChargeInput): Promise<PixCharge>;
  /**
   * Consulta o PSP para saber se a cobrança foi paga. Retorna null quando o
   * provedor não suporta consulta automática (exige confirmação manual).
   */
  checkCharge(txid: string): Promise<"PAID" | "PENDING" | null>;
}

export const manualPixProvider: PixProvider = {
  name: "manual",
  async createCharge(input) {
    const txid = `VZ${crypto.randomBytes(9).toString("hex").toUpperCase()}`.slice(0, 25);
    const copyPaste = buildBrCode({
      pixKey: input.pixKey,
      merchantName: input.receiverName,
      merchantCity: input.receiverCity,
      amountCents: input.amountCents,
      txid,
      description: input.description,
    });
    return { txid, copyPaste };
  },
  async checkCharge() {
    return null;
  },
};

export function getPixProvider(): PixProvider {
  switch (config.pixProvider) {
    case "manual":
    default:
      return manualPixProvider;
  }
}
