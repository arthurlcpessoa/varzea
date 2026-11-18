// Cobrança e conferência de pagamentos (RN11, RN12, RF27-RF32).

import { prisma } from "../db.js";
import { badRequest, notFound } from "../lib/http.js";
import { getPixProvider } from "./pix/provider.js";

export const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Retorna a cobrança Pix pendente do participante, criando uma se necessário. */
export async function getOrCreateCharge(participantId: string) {
  const participant = await prisma.matchParticipant.findUnique({
    where: { id: participantId },
    include: { match: { include: { club: true } }, payments: { where: { status: "PENDING" } } },
  });
  if (!participant) throw notFound("Participante");
  const { match } = participant;
  if (match.priceCents <= 0) throw badRequest("Esta partida não tem cobrança.");
  if (participant.paymentStatus !== "PENDING") throw badRequest("Este pagamento já está regularizado.");
  if (!match.club.pixKey) throw badRequest("O clube ainda não cadastrou uma chave Pix.");

  const existing = participant.payments.find((p) => p.amountCents === match.priceCents);
  if (existing) return existing;

  const provider = getPixProvider();
  const charge = await provider.createCharge({
    amountCents: match.priceCents,
    pixKey: match.club.pixKey,
    receiverName: match.club.pixName ?? match.club.name,
    receiverCity: match.club.city ?? "BRASIL",
    description: match.title,
  });
  return prisma.payment.create({
    data: {
      participantId,
      amountCents: match.priceCents,
      txid: charge.txid,
      copyPaste: charge.copyPaste,
      provider: provider.name,
    },
  });
}

/** Confirma o pagamento após a verificação (RF28, RF32). */
export async function confirmPayment(participantId: string, verifiedById: string | null) {
  const participant = await prisma.matchParticipant.findUnique({
    where: { id: participantId },
    include: { match: true, payments: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" } } },
  });
  if (!participant) throw notFound("Participante");
  if (participant.paymentStatus === "PAID") return participant;

  await prisma.$transaction(async (tx) => {
    const pending = participant.payments[0];
    if (pending) {
      await tx.payment.update({
        where: { id: pending.id },
        data: { status: "CONFIRMED", verifiedById, verifiedAt: new Date() },
      });
    } else {
      // Pagamento recebido fora do Pix gerado (ex.: dinheiro ou Pix avulso).
      await tx.payment.create({
        data: {
          participantId,
          amountCents: participant.match.priceCents,
          txid: `MANUAL${Date.now()}${Math.floor(Math.random() * 1000)}`,
          status: "CONFIRMED",
          provider: "manual",
          verifiedById,
          verifiedAt: new Date(),
        },
      });
    }
    await tx.matchParticipant.update({ where: { id: participantId }, data: { paymentStatus: "PAID" } });
  });
  return prisma.matchParticipant.findUniqueOrThrow({ where: { id: participantId } });
}

/** Desfaz uma confirmação feita por engano. */
export async function revertPayment(participantId: string) {
  await prisma.$transaction([
    prisma.payment.updateMany({ where: { participantId, status: "CONFIRMED" }, data: { status: "CANCELED" } }),
    prisma.matchParticipant.update({ where: { id: participantId }, data: { paymentStatus: "PENDING" } }),
  ]);
}

/** Consulta o provedor Pix para cobranças pendentes de uma partida. */
export async function syncPixPayments(matchId: string) {
  const provider = getPixProvider();
  const pending = await prisma.payment.findMany({
    where: { status: "PENDING", participant: { matchId } },
  });
  let confirmed = 0;
  let supported = true;
  for (const payment of pending) {
    const result = await provider.checkCharge(payment.txid);
    if (result === null) {
      supported = false;
      break;
    }
    if (result === "PAID") {
      await confirmPayment(payment.participantId, null);
      confirmed++;
    }
  }
  return { checked: pending.length, confirmed, automatic: supported, provider: provider.name };
}
