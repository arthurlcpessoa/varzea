import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { POSITIONS, ROLES, can, permissionsFor } from "../lib/domain.js";
import { badRequest, forbidden, notFound, parse } from "../lib/http.js";
import { inviteCode, normalizePhone } from "../lib/security.js";
import { assertCan, clubAccess, requireAuth, requirePermission, userId } from "../middleware/auth.js";
import { serializeMatchSummary } from "./serializers.js";
import { handleIncomingMessage } from "../services/bot/engine.js";
import { getPixProvider } from "../services/pix/provider.js";
import { getWhatsAppProvider } from "../services/whatsapp/provider.js";

export const clubsRouter = Router();
clubsRouter.use(requireAuth);

const clubSchema = z.object({
  name: z.string().trim().min(2, "informe o nome do clube").max(60),
  city: z.string().trim().max(60).nullish(),
  state: z.string().trim().max(2).nullish(),
  pixKey: z.string().trim().max(77).nullish(),
  pixName: z.string().trim().max(25).nullish(),
});

// RF06 — clubes do usuário
clubsRouter.get("/", async (req, res) => {
  const memberships = await prisma.clubMember.findMany({
    where: { userId: userId(req), active: true },
    include: { club: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(
    memberships.map((m) => ({ id: m.club.id, name: m.club.name, city: m.club.city, state: m.club.state, role: m.role })),
  );
});

// RN03 / RF05 — criação de clube; o criador vira diretoria.
// Decisão inicial para o ponto pendente nº 2: um usuário pode criar mais de um clube.
clubsRouter.post("/", async (req, res) => {
  const data = parse(clubSchema, req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId(req) } });
  const club = await prisma.club.create({
    data: {
      name: data.name,
      city: data.city || null,
      state: data.state?.toUpperCase() || null,
      pixKey: data.pixKey || null,
      pixName: data.pixName || null,
      members: {
        create: {
          userId: user.id,
          name: user.name,
          nickname: user.nickname,
          phone: user.phone,
          role: "DIRETORIA",
        },
      },
      botConfig: { create: {} },
    },
  });
  res.status(201).json(club);
});

// Entrar em um clube por convite (RF10)
clubsRouter.post("/join", async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().toUpperCase() }), req.body);
  const invite = await prisma.invite.findUnique({ where: { code } });
  if (!invite || invite.expiresAt < new Date()) throw badRequest("Convite inválido ou expirado.");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId(req) } });

  const existing = await prisma.clubMember.findFirst({
    where: { clubId: invite.clubId, OR: [{ userId: user.id }, ...(user.phone ? [{ phone: user.phone }] : [])] },
  });
  if (existing) {
    // Reativa ou vincula um jogador já cadastrado pela organização com o mesmo telefone.
    await prisma.clubMember.update({
      where: { id: existing.id },
      data: { userId: user.id, active: true, role: existing.active ? existing.role : invite.role },
    });
  } else {
    await prisma.clubMember.create({
      data: {
        clubId: invite.clubId,
        userId: user.id,
        name: user.name,
        nickname: user.nickname,
        phone: user.phone,
        role: invite.role,
      },
    });
  }
  const club = await prisma.club.findUniqueOrThrow({ where: { id: invite.clubId } });
  res.json({ id: club.id, name: club.name });
});

clubsRouter.use("/:clubId", clubAccess);

// RF07 — página do clube
clubsRouter.get("/:clubId", async (req, res) => {
  const member = req.member!;
  const club = await prisma.club.findUniqueOrThrow({ where: { id: member.clubId } });
  const [members, matches, goals] = await Promise.all([
    prisma.clubMember.count({ where: { clubId: club.id, active: true } }),
    prisma.match.count({ where: { clubId: club.id, status: "FINISHED" } }),
    prisma.matchEvent.count({ where: { type: "GOAL", match: { clubId: club.id } } }),
  ]);
  const canSeeFinance = can(member.role, "payments.manage");
  res.json({
    ...club,
    pixKey: canSeeFinance ? club.pixKey : undefined,
    me: { memberId: member.id, role: member.role, permissions: permissionsFor(member.role) },
    totals: { members, matches, goals },
  });
});

// RF08
clubsRouter.patch("/:clubId", requirePermission("club.update"), async (req, res) => {
  const data = parse(clubSchema.partial(), req.body);
  const club = await prisma.club.update({
    where: { id: req.member!.clubId },
    data: { ...data, state: data.state?.toUpperCase() },
  });
  res.json(club);
});

// ---------------------------------------------------------------- Membros

const memberSchema = z.object({
  name: z.string().trim().min(2, "informe o nome").max(60),
  nickname: z.string().trim().max(30).nullish(),
  phone: z.string().trim().nullish(),
  role: z.enum(ROLES).optional(),
  position: z.enum(POSITIONS).nullish(),
  isGoalkeeper: z.boolean().optional(),
  skill: z.number().int().min(1).max(5).optional(),
});

// RF09 — telefone só é exibido para quem gerencia jogadores (LGPD, RNF07/RNF09).
clubsRouter.get("/:clubId/members", async (req, res) => {
  const viewer = req.member!;
  const showPrivate = can(viewer.role, "members.edit");
  const members = await prisma.clubMember.findMany({
    where: { clubId: viewer.clubId, active: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: { _count: { select: { goals: true, assists: true } } },
  });
  res.json(
    members.map((m) => ({
      id: m.id,
      name: m.name,
      nickname: m.nickname,
      phone: showPrivate || m.id === viewer.id ? m.phone : undefined,
      role: m.role,
      position: m.position,
      isGoalkeeper: m.isGoalkeeper || m.position === "GOLEIRO",
      skill: showPrivate ? m.skill : undefined,
      hasAccount: Boolean(m.userId),
      goals: m._count.goals,
      assists: m._count.assists,
    })),
  );
});

// RF10/RN06/RN07 — cadastro direto de jogador (com ou sem conta)
clubsRouter.post("/:clubId/members", requirePermission("members.add"), async (req, res) => {
  const data = parse(memberSchema, req.body);
  if (data.role && data.role !== "JOGADOR") assertCan(req.member!, "members.assignRole");
  const phone = normalizePhone(data.phone);
  const user = phone ? await prisma.user.findFirst({ where: { phone } }) : null;
  const member = await prisma.clubMember.create({
    data: {
      clubId: req.member!.clubId,
      userId: user?.id ?? null,
      name: data.name,
      nickname: data.nickname || null,
      phone,
      role: data.role ?? "JOGADOR",
      position: data.position ?? null,
      isGoalkeeper: data.isGoalkeeper ?? data.position === "GOLEIRO",
      skill: data.skill ?? 3,
    },
  });
  res.status(201).json(member);
});

// RF11/RF12/RF14
clubsRouter.patch("/:clubId/members/:memberId", async (req, res) => {
  const editor = req.member!;
  const target = await prisma.clubMember.findFirst({
    where: { id: String(req.params.memberId), clubId: editor.clubId, active: true },
  });
  if (!target) throw notFound("Jogador");
  const data = parse(memberSchema.partial(), req.body);

  const isSelf = target.id === editor.id;
  if (!isSelf) assertCan(editor, "members.edit");
  // O próprio jogador pode editar apelido, telefone e posição — não nível ou função.
  if (isSelf && !can(editor.role, "members.edit") && (data.skill !== undefined || data.name !== undefined)) {
    throw forbidden("Você só pode alterar apelido, telefone e posição.");
  }
  if (data.role !== undefined && data.role !== target.role) {
    assertCan(editor, "members.assignRole");
    if (target.role === "DIRETORIA" && data.role !== "DIRETORIA") await assertNotLastBoard(editor.clubId, target.id);
  }

  const updated = await prisma.clubMember.update({
    where: { id: target.id },
    data: {
      ...data,
      phone: data.phone === undefined ? undefined : normalizePhone(data.phone),
      isGoalkeeper: data.isGoalkeeper ?? (data.position ? data.position === "GOLEIRO" : undefined),
    },
  });
  res.json(updated);
});

async function assertNotLastBoard(clubId: string, memberId: string) {
  const others = await prisma.clubMember.count({
    where: { clubId, role: "DIRETORIA", active: true, id: { not: memberId } },
  });
  if (others === 0) throw badRequest("O clube precisa de pelo menos uma pessoa na diretoria.");
}

// RF13/RN20 — remoção lógica: tira o acesso ao clube sem apagar a conta.
clubsRouter.delete("/:clubId/members/:memberId", requirePermission("members.remove"), async (req, res) => {
  const target = await prisma.clubMember.findFirst({
    where: { id: String(req.params.memberId), clubId: req.member!.clubId, active: true },
  });
  if (!target) throw notFound("Jogador");
  if (target.role === "DIRETORIA") await assertNotLastBoard(target.clubId, target.id);
  await prisma.clubMember.update({ where: { id: target.id }, data: { active: false } });
  res.status(204).end();
});

// Convites por código
clubsRouter.post("/:clubId/invites", requirePermission("invites.create"), async (req, res) => {
  const { role } = parse(z.object({ role: z.enum(ROLES).default("JOGADOR") }), req.body ?? {});
  if (role !== "JOGADOR") assertCan(req.member!, "members.assignRole");
  const invite = await prisma.invite.create({
    data: {
      clubId: req.member!.clubId,
      code: inviteCode(),
      role,
      createdById: req.member!.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  res.status(201).json({ code: invite.code, role: invite.role, expiresAt: invite.expiresAt, url: `${config.appUrl}/convite/${invite.code}` });
});

// ---------------------------------------------------------------- Partidas

const matchSchema = z.object({
  title: z.string().trim().min(2, "informe um nome").max(60),
  startsAt: z.coerce.date(),
  durationMin: z.number().int().min(10).max(300).default(90),
  location: z.string().trim().min(2, "informe o local").max(100),
  maxPlayers: z.number().int().min(2).max(100).default(20),
  priceCents: z.number().int().min(0).max(100000).default(0),
  notes: z.string().trim().max(500).nullish(),
});
export { matchSchema };

clubsRouter.get("/:clubId/matches", async (req, res) => {
  const filter = String(req.query.filter ?? "upcoming");
  const where =
    filter === "live"
      ? { status: "LIVE" }
      : filter === "finished"
        ? { status: { in: ["FINISHED", "CANCELED"] } }
        : { status: "SCHEDULED" };
  const matches = await prisma.match.findMany({
    where: { clubId: req.member!.clubId, ...where },
    orderBy: { startsAt: filter === "finished" ? "desc" : "asc" },
    take: 50,
    include: { participants: true, events: true },
  });
  res.json(matches.map((m) => serializeMatchSummary(m, req.member!.id)));
});

// RF16
clubsRouter.post("/:clubId/matches", requirePermission("matches.manage"), async (req, res) => {
  const data = parse(matchSchema, req.body);
  const match = await prisma.match.create({ data: { ...data, notes: data.notes || null, clubId: req.member!.clubId } });
  res.status(201).json(match);
});

// ---------------------------------------------------------------- Estatísticas (RF43, RF44)

clubsRouter.get("/:clubId/stats", async (req, res) => {
  const clubId = req.member!.clubId;
  const [members, finished] = await Promise.all([
    prisma.clubMember.findMany({
      where: { clubId, active: true },
      include: {
        _count: {
          select: {
            goals: true,
            assists: true,
            participations: { where: { status: "CONFIRMED", match: { status: "FINISHED" } } },
          },
        },
      },
    }),
    prisma.match.findMany({
      where: { clubId, status: "FINISHED" },
      orderBy: { startsAt: "desc" },
      take: 20,
      include: { events: true },
    }),
  ]);
  const players = members
    .map((m) => ({
      memberId: m.id,
      name: m.nickname ?? m.name,
      goals: m._count.goals,
      assists: m._count.assists,
      matches: m._count.participations,
    }))
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.matches - a.matches);

  res.json({
    players,
    results: finished.map((m) => ({
      id: m.id,
      title: m.title,
      startsAt: m.startsAt,
      scoreA: m.events.filter((e) => e.type === "GOAL" && e.team === "A").length,
      scoreB: m.events.filter((e) => e.type === "GOAL" && e.team === "B").length,
    })),
  });
});

// ---------------------------------------------------------------- Avisos (RF47)

clubsRouter.get("/:clubId/announcements", async (req, res) => {
  const items = await prisma.announcement.findMany({
    where: { clubId: req.member!.clubId, matchId: null },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { author: { select: { name: true, nickname: true } } },
  });
  res.json(items);
});

clubsRouter.post("/:clubId/announcements", requirePermission("announcements.post"), async (req, res) => {
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(1000) }), req.body);
  const item = await prisma.announcement.create({
    data: { clubId: req.member!.clubId, authorId: userId(req), body },
  });
  res.status(201).json(item);
});

// ---------------------------------------------------------------- Atividade recente

clubsRouter.get("/:clubId/activity", async (req, res) => {
  const clubId = req.member!.clubId;
  const [payments, confirmations] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "CONFIRMED", participant: { match: { clubId } } },
      orderBy: { verifiedAt: "desc" },
      take: 5,
      include: { participant: { include: { member: true, match: true } } },
    }),
    prisma.matchParticipant.findMany({
      where: { status: "CONFIRMED", match: { clubId } },
      orderBy: { confirmedAt: "desc" },
      take: 5,
      include: { member: true, match: true },
    }),
  ]);
  const items = [
    ...payments.map((p) => ({
      type: "payment" as const,
      at: p.verifiedAt ?? p.createdAt,
      title: "Pagamento confirmado",
      detail: `${p.participant.member.nickname ?? p.participant.member.name} · ${p.participant.match.title}`,
    })),
    ...confirmations.map((c) => ({
      type: "confirmation" as const,
      at: c.confirmedAt ?? c.updatedAt,
      title: "Presença confirmada",
      detail: `${c.member.nickname ?? c.member.name} · ${c.match.title}`,
    })),
  ]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 8);
  res.json(items);
});

// ---------------------------------------------------------------- Financeiro (RF29-RF31)

clubsRouter.get("/:clubId/finance", requirePermission("payments.manage"), async (req, res) => {
  const clubId = req.member!.clubId;
  const participants = await prisma.matchParticipant.findMany({
    where: { status: "CONFIRMED", match: { clubId, priceCents: { gt: 0 }, status: { not: "CANCELED" } } },
    include: { member: true, match: true },
    orderBy: { match: { startsAt: "desc" } },
  });
  const history = await prisma.payment.findMany({
    where: { participant: { match: { clubId } } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { participant: { include: { member: true, match: true } } },
  });
  const received = participants.filter((p) => p.paymentStatus === "PAID").reduce((s, p) => s + p.match.priceCents, 0);
  const pendingList = participants.filter((p) => p.paymentStatus === "PENDING");
  res.json({
    receivedCents: received,
    pendingCents: pendingList.reduce((s, p) => s + p.match.priceCents, 0),
    pending: pendingList.map((p) => ({
      participantId: p.id,
      matchId: p.matchId,
      matchTitle: p.match.title,
      startsAt: p.match.startsAt,
      name: p.member.nickname ?? p.member.name,
      amountCents: p.match.priceCents,
    })),
    history: history.map((h) => ({
      id: h.id,
      txid: h.txid,
      status: h.status,
      amountCents: h.amountCents,
      provider: h.provider,
      createdAt: h.createdAt,
      verifiedAt: h.verifiedAt,
      name: h.participant.member.nickname ?? h.participant.member.name,
      matchTitle: h.participant.match.title,
    })),
    pixProvider: getPixProvider().name,
  });
});

// ---------------------------------------------------------------- PELA-BOT (RF22)

const botSchema = z.object({
  enabled: z.boolean(),
  whatsappGroup: z.string().trim().max(100).nullish(),
  inviteHoursBefore: z.number().int().min(1).max(336),
  reminderHoursBefore: z.number().int().min(1).max(168),
  autoPromoteWaitlist: z.boolean(),
  welcomeMessage: z.string().trim().min(1).max(500),
});

clubsRouter.get("/:clubId/bot", async (req, res) => {
  const clubId = req.member!.clubId;
  const cfg = await prisma.botConfig.upsert({ where: { clubId }, create: { clubId }, update: {} });
  res.json({ ...cfg, provider: getWhatsAppProvider().name });
});

clubsRouter.put("/:clubId/bot", requirePermission("bot.configure"), async (req, res) => {
  const clubId = req.member!.clubId;
  const data = parse(botSchema.partial(), req.body);
  const cfg = await prisma.botConfig.upsert({ where: { clubId }, create: { clubId, ...data }, update: data });
  res.json({ ...cfg, provider: getWhatsAppProvider().name });
});

clubsRouter.get("/:clubId/bot/messages", requirePermission("bot.configure"), async (req, res) => {
  const messages = await prisma.botMessage.findMany({
    where: { clubId: req.member!.clubId, ...(req.query.phone ? { phone: String(req.query.phone) } : {}) },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  res.json(messages.reverse());
});

// Simulador: permite testar o bot pelo painel, como se a mensagem viesse do WhatsApp.
clubsRouter.post("/:clubId/bot/simulate", requirePermission("bot.configure"), async (req, res) => {
  const { phone, text } = parse(z.object({ phone: z.string().min(8), text: z.string().min(1).max(500) }), req.body);
  const reply = await handleIncomingMessage(req.member!.clubId, phone, text);
  res.json({ reply });
});
