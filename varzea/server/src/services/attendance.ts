// Confirmação de presença, desistência e lista de espera (RN10, RF19-RF21, RF26).
//
// Decisão inicial para o ponto pendente nº 6 (desistências):
//  - Ao confirmar com a partida cheia, o jogador entra na lista de espera.
//  - Ao desistir de uma vaga confirmada, o primeiro da lista de espera é
//    promovido automaticamente (se a opção estiver ativa no bot do clube).
//  - O pagamento já confirmado é mantido no histórico; o eventual reembolso ou
//    crédito fica a critério da diretoria.

import { prisma } from "../db.js";
import { badRequest, notFound } from "../lib/http.js";

export type AttendanceResult = {
  status: "CONFIRMED" | "WAITLIST" | "DECLINED" | "PENDING";
  promotedMemberId?: string;
};

async function getOpenMatch(matchId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw notFound("Partida");
  if (match.status === "CANCELED") throw badRequest("Esta partida foi cancelada.");
  if (match.status === "FINISHED") throw badRequest("Esta partida já foi encerrada.");
  return match;
}

export async function confirmPresence(matchId: string, memberId: string): Promise<AttendanceResult> {
  const match = await getOpenMatch(matchId);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.matchParticipant.findUnique({ where: { matchId_memberId: { matchId, memberId } } });
    if (existing?.status === "CONFIRMED" || existing?.status === "WAITLIST") {
      return { status: existing.status as "CONFIRMED" | "WAITLIST" };
    }
    const confirmed = await tx.matchParticipant.count({ where: { matchId, status: "CONFIRMED" } });
    const status = confirmed < match.maxPlayers ? "CONFIRMED" : "WAITLIST";
    const data = {
      status,
      confirmedAt: status === "CONFIRMED" ? new Date() : null,
      paymentStatus: match.priceCents === 0 ? "EXEMPT" : (existing?.paymentStatus ?? "PENDING"),
    };
    await tx.matchParticipant.upsert({
      where: { matchId_memberId: { matchId, memberId } },
      create: { matchId, memberId, ...data },
      update: data,
    });
    return { status };
  });
}

export async function declinePresence(matchId: string, memberId: string): Promise<AttendanceResult> {
  const match = await getOpenMatch(matchId);
  const bot = await prisma.botConfig.findUnique({ where: { clubId: match.clubId } });
  const autoPromote = bot?.autoPromoteWaitlist ?? true;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.matchParticipant.findUnique({ where: { matchId_memberId: { matchId, memberId } } });
    await tx.matchParticipant.upsert({
      where: { matchId_memberId: { matchId, memberId } },
      create: { matchId, memberId, status: "DECLINED" },
      update: { status: "DECLINED", team: null, confirmedAt: null },
    });

    let promotedMemberId: string | undefined;
    if (existing?.status === "CONFIRMED" && autoPromote) {
      const next = await tx.matchParticipant.findFirst({
        where: { matchId, status: "WAITLIST" },
        orderBy: { updatedAt: "asc" },
      });
      if (next) {
        await tx.matchParticipant.update({
          where: { id: next.id },
          data: { status: "CONFIRMED", confirmedAt: new Date() },
        });
        promotedMemberId = next.memberId;
      }
    }
    return { status: "DECLINED", promotedMemberId };
  });
}

/** Volta o jogador para "pendente" (sem resposta). Usado pela organização. */
export async function resetPresence(matchId: string, memberId: string): Promise<AttendanceResult> {
  await getOpenMatch(matchId);
  await prisma.matchParticipant.upsert({
    where: { matchId_memberId: { matchId, memberId } },
    create: { matchId, memberId, status: "PENDING" },
    update: { status: "PENDING", team: null, confirmedAt: null },
  });
  return { status: "PENDING" };
}

export async function setPresence(matchId: string, memberId: string, status: string) {
  if (status === "CONFIRMED") return confirmPresence(matchId, memberId);
  if (status === "DECLINED") return declinePresence(matchId, memberId);
  if (status === "PENDING") return resetPresence(matchId, memberId);
  throw badRequest("Situação de presença inválida.");
}
