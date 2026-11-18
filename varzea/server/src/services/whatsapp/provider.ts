// Abstração do envio de mensagens pelo WhatsApp (RF23, RNF19).
//
// O ponto pendente nº 5 (API oficial x provedor intermediário) ainda está em
// aberto. O provedor "console" registra as mensagens no banco e no log — é o
// que alimenta o simulador do PELA-BOT no painel. Para ir para produção,
// implemente esta interface com o provedor escolhido (WhatsApp Cloud API,
// Z-API, Evolution API, Twilio…) e aponte o webhook dele para
// POST /api/bot/webhook/:clubId.

import { config } from "../../config.js";

export interface WhatsAppProvider {
  readonly name: string;
  sendMessage(to: string, text: string): Promise<void>;
}

export const consoleWhatsAppProvider: WhatsAppProvider = {
  name: "console",
  async sendMessage(to, text) {
    if (process.env.NODE_ENV !== "test") {
      console.log(`[whatsapp → ${to}] ${text.replace(/\n/g, " ⏎ ")}`);
    }
  },
};

export function getWhatsAppProvider(): WhatsAppProvider {
  switch (config.whatsappProvider) {
    case "console":
    default:
      return consoleWhatsAppProvider;
  }
}
