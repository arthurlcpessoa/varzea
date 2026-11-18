import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError, notFound, parse } from "../lib/http.js";
import { handleIncomingMessage } from "../services/bot/engine.js";

export const botRouter = Router();

/**
 * Webhook genérico do PELA-BOT. O provedor de WhatsApp escolhido deve chamar
 * este endpoint (diretamente ou via um pequeno adaptador) com o telefone e o
 * texto recebidos. Protegido pelo cabeçalho X-Webhook-Secret quando
 * BOT_WEBHOOK_SECRET estiver definido.
 */
botRouter.post("/webhook/:clubId", async (req, res) => {
  const secret = process.env.BOT_WEBHOOK_SECRET;
  if (secret && req.header("x-webhook-secret") !== secret) {
    throw new HttpError(401, "Assinatura do webhook inválida.", "BAD_SIGNATURE");
  }
  const { from, text } = parse(z.object({ from: z.string().min(8), text: z.string().min(1).max(1000) }), req.body);
  const club = await prisma.club.findUnique({ where: { id: String(req.params.clubId) } });
  if (!club) throw notFound("Clube");
  const reply = await handleIncomingMessage(club.id, from, text);
  res.json({ reply });
});
