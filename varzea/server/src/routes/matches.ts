import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ATTENDANCE, TEAMS, can, permissionsFor } from "../lib/domain.js";
import { badRequest, notFound, parse } from "../lib/http.js";
import { verifyToken } from "../lib/security.js";
import { assertCan, matchAccess, requireAuth } from "../middleware/auth.js";
import { setPresence } from "../services/attendance.js";
import { broadcastMatchInvite, broadcastPaymentReminder, sendBotMessage } from "../services/bot/engine.js";
import { confirmPayment, getOrCreateCharge, revertPayment, syncPixPayments } from "../services/payments.js";
import { matchChannel, publish, subscribe } from "../services/realtime.js";
import { drawTeams } from "../services/teamDraw.js";
import { matchSchema } from "./clubs.js";
import { elapsedSeconds, score } from "./serializers.js";

export const matchesRouter = Router();

// SSE (RF45): EventSource não envia cabeçalhos, então o token vem na query.
matchesRouter.get("/:matchId/stream", async (req, res) => {
  const payload = verifyToken(String(req.query.token ?? ""));
  if (!payload) {
    res.status(401).json({ error: "Sessão expirada." });
    return;
  }
  req.userId = payload.sub;
  const { match } = await matchAccess(req, String(req.params.matchId));
  subscribe(matchChannel(match.id), res);
});

matchesRouter.use(requireAuth);

async function loadDetail(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      club: true,
      participants: { include: { member: true }, orderBy: [{ confirmedAt: "asc" }, { createdAt: "asc" }] },
      events: { orderBy: { second: "desc" } },
    },
  });
  if (!match) throw notFound("Partida");
  return match;
}

async function detailFor(req: Request, matchId: string) {
  const { member } = await matchAccess(req, matchId);
  const match = await loadDetail(matchId);
  const manage = can(member.role, "matches.manage");
  const payments = can(member.role, "payments.manage");

  // Jogadores do clube que ainda não responderam também aparecem como pendentes (RF19).
  const clubMembers = await prisma.clubMember.findMany({ where: { clubId: match.clubId, active: true } });
  const byMember = new Map(match.participants.map((p) => [p.memberId, p]));
  const people = clubMembers.map((cm) => {
    const p = byMember.get(cm.id);
    return {
      participantId: p?.id ?? null,
      memberId: cm.id,
      name: cm.name,
      nickname: cm.nickname,
      position: cm.position,
      isGoalkeeper: cm.isGoalkeeper || cm.position === "GOLEIRO",
      status: p?.status ?? "PENDING",
      paymentStatus: p?.paymentStatus ?? null,
      team: p?.team ?? null,
      confirmedAt: p?.confirmedAt ?? null,
    };
  });
  // Ex-membros que participaram continuam no histórico da partida.
  for (const p of match.participants) {
    if (!clubMembers.some((cm) => cm.id === p.memberId)) {
      people.push({
        participantId: p.id,
        memberId: p.memberId,
        name: p.member.name,
        nickname: p.member.nickname,
        position: p.member.position,
        isGoalkeeper: p.member.isGoalkeeper,
        status: p.status,
        paymentStatus: p.paymentStatus,
        team: p.team,
        confirmedAt: p.confirmedAt,
      });
    }
  }

  const nameOf = (id: string | null) => {
    const m = people.find((p) => p.memberId === id);
    return m ? (m.nickname ?? m.name) : null;
  };
  const mine = byMember.get(member.id);
  const confirmed = people.filter((p) => p.status === "CONFIRMED");
  const paid = confirmed.filter((p) => p.paymentStatus === "PAID").length;

  return {
    id: match.id,
    clubId: match.clubId,
    clubName: match.club.name,
    title: match.title,
    startsAt: match.startsAt,
    durationMin: match.durationMin,
    location: match.location,
    maxPlayers: match.maxPlayers,
    priceCents: match.priceCents,
    notes: match.notes,
    status: match.status,
    timer: {
      elapsedSec: elapsedSeconds(match),
      running: Boolean(match.runningSince),
      period: match.period,
      serverTime: new Date(),
    },
    score: score(match.events),
    events: match.events.map((e) => ({
      id: e.id,
      type: e.type,
      team: e.team,
      second: e.second,
      scorerId: e.scorerId,
      scorer: nameOf(e.scorerId),
      assistId: e.assistId,
      assist: nameOf(e.assistId),
    })),
    people,
    counts: {
      confirmed: confirmed.length,
      waitlist: people.filter((p) => p.status === "WAITLIST").length,
      declined: people.filter((p) => p.status === "DECLINED").length,
      pending: people.filter((p) => p.status === "PENDING").length,
      paid,
    },
    finance: payments
      ? {
          receivedCents: paid * match.priceCents,
          pendingCents: confirmed.filter((p) => p.paymentStatus === "PENDING").length * match.priceCents,
        }
      : null,
    me: {
      memberId: member.id,
      participantId: mine?.id ?? null,
      status: mine?.status ?? "PENDING",
      paymentStatus: mine?.paymentStatus ?? null,
      team: mine?.team ?? null,
      role: member.role,
      permissions: permissionsFor(member.role),
    },
    canManage: manage,
  };
}

async function notify(matchId: string) {
  // Publica o estado atualizado (sem dados pessoais) para quem acompanha.
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: { events: true } });
  if (!match) return;
  publish(matchChannel(matchId), "update", {
    status: match.status,
    timer: { elapsedSec: elapsedSeconds(match), running: Boolean(match.runningSince), period: match.period, serverTime: new Date() },
    score: score(match.events),
  });
}

matchesRouter.get("/:matchId", async (req, res) => {
  res.json(await detailFor(req, String(req.params.matchId)));
});

// RF18
matchesRouter.patch("/:matchId", async (req, res) => {
  const { match, member } = await matchAccess(req, String(req.params.matchId));
  assertCan(member, "matches.manage");
  const data = parse(matchSchema.partial(), req.body);
  if (data.maxPlayers !== undefined) {
    const confirmed = await prisma.matchParticipant.count({ where: { matchId: match.id, status: "CONFIRMED" } });
    if (data.maxPlayers < confirmed) throw badRequest(`Já há ${confirmed} confirmados; o limite não pode ser menor.`);
  }
  await prisma.match.update({ where: { id: match.id }, data });
  res.json(await detailFor(req, match.id));
});

matchesRouter.post("/:matchId/cancel", async (req, res) => {
  const { match, member } = await matchAccess(req, String(req.params.matchId));
  assertCan(member, "matches.manage");
  if (match.status === "FINISHED") throw badRequest("Não é possível cancelar uma partida encerrada.");
  await prisma.match.update({ where: { id: match.id }, data: { status: "CANCELED", runningSince: null } });
  await notify(match.id);
  res.json(await detailFor(req, match.id));
});

// ---------------------------------------------------------------- Presença (RF21, RF26)

matchesRouter.post("/:matchId/attendance", async (req, res) => {
  const { match, member } = await matchAccess(req, String(req.params.matchId));
  const { status } = parse(z.object({ status: z.enum(ATTENDANCE) }), req.body);
  if (status === "WAITLIST") throw badRequest("Confirme presença: se estiver lotado, você entra na lista de espera.");
  await applyPresence(match.id, member.id, status, match.clubId);
  res.json(await detailFor(req, match.id));
});

matchesRouter.put("/:matchId/attendance/:memberId", async (req, res) => {
  const { match, member } = await matchAccess(req, String(req.params.matchId));
  assertCan(member, "matches.manage");
  const target = await prisma.clubMember.findFirst({
    where: { id: String(req.params.memberId), clubId: match.clubId, active: true },
  });
  if (!target) throw notFound("Jogador");
  const { status } = parse(z.object({ status: z.enum(ATTENDANCE) }), req.body);
  if (status === "WAITLIST") throw badRequest("Situação inválida.");
  await applyPresence(match.id, target.id, status, match.clubId);
  res.json(await detailFor(req, match.id));
});

async function applyPresence(matchId: string, memberId: string, status: string, clubId: string) {
  const result = await setPresence(matchId, memberId, status);
  if (result.promotedMemberId) {
    const promoted = await prisma.clubMember.findUnique({ where: { id: result.promotedMemberId } });
    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    if (promoted?.phone) {
      await sendBotMessage(clubId, promoted.phone, `🎉 Abriu uma vaga! Sua presença em *${match.title}* está confirmada.`);
    }
  }
}

// ---------------------------------------------------------------- Times (RF33-RF36)

matchesRouter.post("/:matchId/teams/draw", async (req, res) => {
  const { match, member } = await matchAccess(req, String(req.params.matchId));
  assertCan(member, "matches.manage");
  const { useSkill } = parse(z.object({ useSkill: z.boolean().default(true) }), req.body ?? {});
  const confirmed = await prisma.matchParticipant.findMany({
    where: { matchId: match.id, status: "CONFIRMED" },
    include: { member: true },
  });
  if (confirmed.length < 2) throw badRequest("São necessários pelo menos 2 confirmados para sortear os times.");
  const result = drawTeams(
    confirmed.map((p) => ({
      id: p.id,
      skill: useSkill ? p.member.skill : 3,
      position: p.member.position,
      isGoalkeeper: p.member.isGoalkeeper,
    })),
  );
  await prisma.$transaction([
    prisma.matchParticipant.updateMany({ where: { matchId: match.id }, data: { team: null } }),
    prisma.matchParticipant.updateMany({ where: { id: { in: result.A } }, data: { team: "A" } }),
    prisma.matchParticipant.updateMany({ where: { id: { in: result.B } }, data: { team: "B" } }),
  ]);
  res.json({ ...(await detailFor(req, match.id)), draw: { skillA: result.skillA, skillB: result.skillB } });
});

matchesRouter.put("/:matchId/teams/:memberId", async (req, res) => {
  const { match, member } = await matchAccess(req, String(req.params.matchId));
  assertCan(member, "matches.manage");
  const { team } = parse(z.object({ team: z.enum(TEAMS).nullable() }), req.body);
  const p = await prisma.matchParticipant.findUnique({
    where: { matchId_memberId: { matchId: match.id, memberId: String(req.params.memberId) } },
  });
  if (!p || p.status !== "CONFIRMED") throw badRequest("Só jogadores confirmados podem ser escalados.");
  await prisma.matchParticipant.update({ where: { id: p.id }, data: { team } });
  res.json(await detailFor(req, match.id));
});

// ---------------------------------------------------------------- Pagamentos (RF27-RF32)

matchesRouter.post("/:matchId/payment/charge", async (req, res) => {
  const { match, member } = await matchAccess(req, String(req.params.matchId));
  const p = await prisma.matchParticipant.findUnique({
    where: { matchId_memberId: { matchId: match.id, memberId: member.id } },
  });
  if (!p || p.status !== "CONFIRMED") throw badRequest("Confirme sua presença antes de pagar.");
  const charge = await getOrCreateCharge(p.id);
  res.json({ txid: charge.txid, copyPaste: charge.copyPaste, amountCents: charge.amountCents });
});

async function participantInMatch(matchId: string, participantId: string) {
  const p = await prisma.matchParticipant.findFirst({ where: { id: participantId, matchId } });
  if (!p) throw notFound("Participante");
  return p;
}

matchesRouter.post("/:matchId/payments/:participantId/confirm", async (req, res) => {
  const { match, member } = await matchAccess(req, String(req.params.matchId));
  assertCan(member, "payments.manage");
  const p = await participantInMatch(match.id, String(req.params.participantId));
  await confirmPayment(p.id, member.id);
  const target = await prisma.clubMember.findUnique({ where: { id: p.memberId } });
  if (target?.phone) {
    await sendBotMessage(match.clubId, target.phone, `✅ Pagamento de *${match.title}* confirmado. Valeu! 💚`);
  }
  res.json(await detailFor(req, match.id));
});

matchesRouter.post("/:matchId/payments/:participantId/revert", async (req, res) => {
  const { match, member } = await matchAccess(req, String(req.params.matchId));
  assertCan(member, "payments.manage");
  const p = await participantInMatch(match.id, String(req.params.participantId));
  await revertPayment(p.id);
  res.json(await detailFor(req, match.id));
});

matchesRouter.post("/:matchId/payments/:participantId/exempt", async (req, res) => {
  const { match, member } = await matchAccess(req, String(req.params.matchId));
  assertCan(member, "payments.manage");
  const p = await participantInMatch(match.id, String(req.params.participantId));
  await prisma.matchParticipant.update({ where: { id: p.id }, data: { paymentStatus: "EXEMPT" } });
  res.json(await detailFor(req, match.id));
});

matchesRouter.post("/:matchId/payments/sync", async (req, res) => {
  const { match, member } = await matchAccess(req, String(req.params.matchId));
  assertCan(member, "payments.manage");
  const result = await syncPixPayments(match.id);
  res.json({ ...result, match: await detailFor(req, match.id) });
});

// ---------------------------------------------------------------- Bot (RF25)

matchesRouter.post("/:matchId/broadcast", async (req, res) => {
  const { match, member } = await matchAccess(req, String(req.params.matchId));
  assertCan(member, "matches.manage");
  const { kind } = parse(z.object({ kind: z.enum(["invite", "payment"]) }), req.body);
  const result = kind === "invite" ? await broadcastMatchInvite(match.id) : await broadcastPaymentReminder(match.id);
  res.json(result);
});

// ---------------------------------------------------------------- Ao vivo (RF37-RF42)

async function liveGuard(req: Request) {
  const access = await matchAccess(req, String(req.params.matchId));
  assertCan(access.member, "matches.manage");
  if (access.match.status === "CANCELED") throw badRequest("Esta partida foi cancelada.");
  return access;
}

matchesRouter.post("/:matchId/live/start", async (req, res) => {
  const { match } = await liveGuard(req);
  if (match.status === "FINISHED") throw badRequest("A partida já foi encerrada.");
  if (!match.runningSince) {
    await prisma.match.update({ where: { id: match.id }, data: { status: "LIVE", runningSince: new Date() } });
  }
  await notify(match.id);
  res.json(await detailFor(req, match.id));
});

matchesRouter.post("/:matchId/live/pause", async (req, res) => {
  const { match } = await liveGuard(req);
  if (match.runningSince) {
    await prisma.match.update({
      where: { id: match.id },
      data: { elapsedSec: elapsedSeconds(match), runningSince: null },
    });
  }
  await notify(match.id);
  res.json(await detailFor(req, match.id));
});

matchesRouter.post("/:matchId/live/period", async (req, res) => {
  const { match } = await liveGuard(req);
  await prisma.match.update({
    where: { id: match.id },
    data: { period: match.period + 1, elapsedSec: 0, runningSince: null },
  });
  await notify(match.id);
  res.json(await detailFor(req, match.id));
});

matchesRouter.post("/:matchId/live/finish", async (req, res) => {
  const { match } = await liveGuard(req);
  await prisma.match.update({
    where: { id: match.id },
    data: { status: "FINISHED", elapsedSec: elapsedSeconds(match), runningSince: null },
  });
  await notify(match.id);
  res.json(await detailFor(req, match.id));
});

matchesRouter.post("/:matchId/events", async (req, res) => {
  const { match } = await liveGuard(req);
  if (match.status !== "LIVE") throw badRequest("Inicie a partida para registrar lances.");
  const data = parse(
    z.object({ team: z.enum(TEAMS), scorerId: z.string().nullish(), assistId: z.string().nullish() }),
    req.body,
  );
  for (const id of [data.scorerId, data.assistId]) {
    if (!id) continue;
    const ok = await prisma.clubMember.findFirst({ where: { id, clubId: match.clubId } });
    if (!ok) throw badRequest("Jogador informado não pertence ao clube.");
  }
  if (data.scorerId && data.scorerId === data.assistId) throw badRequest("O autor do gol não pode ser o da assistência.");
  await prisma.matchEvent.create({
    data: {
      matchId: match.id,
      type: "GOAL",
      team: data.team,
      scorerId: data.scorerId ?? null,
      assistId: data.assistId ?? null,
      second: elapsedSeconds(match),
    },
  });
  await notify(match.id);
  res.status(201).json(await detailFor(req, match.id));
});

matchesRouter.delete("/:matchId/events/:eventId", async (req, res) => {
  const { match } = await liveGuard(req);
  const deleted = await prisma.matchEvent.deleteMany({ where: { id: String(req.params.eventId), matchId: match.id } });
  if (deleted.count === 0) throw notFound("Lance");
  await notify(match.id);
  res.json(await detailFor(req, match.id));
});

// ---------------------------------------------------------------- Mural da partida (RF46)

matchesRouter.get("/:matchId/wall", async (req, res) => {
  const { match } = await matchAccess(req, String(req.params.matchId));
  const items = await prisma.announcement.findMany({
    where: { matchId: match.id },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { author: { select: { id: true, name: true, nickname: true } } },
  });
  res.json(items);
});

matchesRouter.post("/:matchId/wall", async (req, res) => {
  const { match } = await matchAccess(req, String(req.params.matchId));
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(500) }), req.body);
  const item = await prisma.announcement.create({
    data: { clubId: match.clubId, matchId: match.id, authorId: req.userId!, body },
    include: { author: { select: { id: true, name: true, nickname: true } } },
  });
  publish(matchChannel(match.id), "wall", item);
  res.status(201).json(item);
});
