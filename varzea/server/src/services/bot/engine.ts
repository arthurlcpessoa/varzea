// PELA-BOT / VarzIA — interpreta mensagens recebidas pelo WhatsApp e responde
// (RF24-RF27). A lógica é independente do provedor: qualquer integração só
// precisa entregar (clube, telefone, texto) para handleIncomingMessage().

import { prisma } from "../../db.js";
import { normalizePhone } from "../../lib/security.js";
import { confirmPresence, declinePresence } from "../attendance.js";
import { formatBRL, getOrCreateCharge } from "../payments.js";
import { getWhatsAppProvider } from "../whatsapp/provider.js";

type Intent = "confirm" | "decline" | "pay" | "list" | "info" | "help";

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function detectIntent(text: string): Intent {
  const t = normalize(text);
  if (/^(2|nao vou|nao|fora|desisto|nao posso|to fora|sai)\b/.test(t) || t.includes("nao vou")) return "decline";
  if (/^(1|vou|sim|confirmo|confirmar|to dentro|bora|presente|eu vou)\b/.test(t)) return "confirm";
  if (/\b(pix|pagar|pagamento|paguei|valor)\b/.test(t)) return "pay";
  if (/\b(lista|confirmados|quem vai)\b/.test(t)) return "list";
  if (/\b(partida|jogo|pelada|quando|onde|horario|info)\b/.test(t)) return "info";
  return "help";
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Recife",
});

export function describeMatch(m: { title: string; startsAt: Date; location: string; priceCents: number }) {
  const price = m.priceCents > 0 ? `\n💰 ${formatBRL(m.priceCents)} por jogador` : "";
  return `⚽ *${m.title}*\n📅 ${dateFmt.format(m.startsAt)}\n📍 ${m.location}${price}`;
}

async function nextMatch(clubId: string) {
  return prisma.match.findFirst({
    where: {
      clubId,
      status: { in: ["SCHEDULED", "LIVE"] },
      startsAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) },
    },
    orderBy: { startsAt: "asc" },
  });
}

async function log(clubId: string, direction: "IN" | "OUT", phone: string, body: string) {
  await prisma.botMessage.create({ data: { clubId, direction, phone, body } });
}

export async function sendBotMessage(clubId: string, phone: string, body: string) {
  await getWhatsAppProvider().sendMessage(phone, body);
  await log(clubId, "OUT", phone, body);
}

const HELP =
  "Comandos da VarzIA:\n" +
  "• *VOU* — confirmar presença na próxima partida\n" +
  "• *NÃO VOU* — desistir da vaga\n" +
  "• *PIX* — receber o Pix para pagamento\n" +
  "• *LISTA* — ver quem confirmou\n" +
  "• *PARTIDA* — data, horário e local";

export async function handleIncomingMessage(clubId: string, rawPhone: string, text: string): Promise<string> {
  const phone = normalizePhone(rawPhone) ?? rawPhone;
  await log(clubId, "IN", phone, text);

  const reply = await buildReply(clubId, phone, text);
  await sendBotMessage(clubId, phone, reply);
  return reply;
}

async function buildReply(clubId: string, phone: string, text: string): Promise<string> {
  const club = await prisma.club.findUnique({ where: { id: clubId }, include: { botConfig: true } });
  if (!club) return "Clube não encontrado.";
  if (club.botConfig && !club.botConfig.enabled) {
    return `O assistente do ${club.name} está pausado no momento. Fale com a organização.`;
  }

  const member = await prisma.clubMember.findFirst({ where: { clubId, phone, active: true } });
  if (!member) {
    return `Opa! Não encontrei este número no *${club.name}*. Peça para a organização te cadastrar no Várzea.`;
  }

  const intent = detectIntent(text);
  if (intent === "help") return `Fala, ${member.nickname ?? member.name.split(" ")[0]}! ${HELP}`;

  const match = await nextMatch(clubId);
  if (!match) return "Ainda não há nenhuma partida marcada. Assim que a organização criar, eu aviso por aqui!";

  switch (intent) {
    case "info": {
      const confirmed = await prisma.matchParticipant.count({ where: { matchId: match.id, status: "CONFIRMED" } });
      return `${describeMatch(match)}\n👥 ${confirmed}/${match.maxPlayers} confirmados\n\nResponda *VOU* para garantir sua vaga.`;
    }
    case "confirm": {
      const result = await confirmPresence(match.id, member.id);
      if (result.status === "WAITLIST") {
        return `A partida está lotada (${match.maxPlayers} vagas). Você entrou na *lista de espera* e eu te aviso se abrir vaga.`;
      }
      const pay = match.priceCents > 0 ? `\n\nO valor é ${formatBRL(match.priceCents)}. Envie *PIX* para pagar.` : "";
      return `✅ Presença confirmada!\n${describeMatch(match)}${pay}`;
    }
    case "decline": {
      const result = await declinePresence(match.id, member.id);
      if (result.promotedMemberId) {
        const promoted = await prisma.clubMember.findUnique({ where: { id: result.promotedMemberId } });
        if (promoted?.phone) {
          await sendBotMessage(
            clubId,
            promoted.phone,
            `🎉 Abriu uma vaga e você saiu da lista de espera! Sua presença em *${match.title}* está confirmada.`,
          );
        }
      }
      return "Tudo certo, sua ausência foi registrada. Se mudar de ideia, é só mandar *VOU*.";
    }
    case "pay": {
      const participant = await prisma.matchParticipant.findUnique({
        where: { matchId_memberId: { matchId: match.id, memberId: member.id } },
      });
      if (!participant || participant.status !== "CONFIRMED") {
        return "Primeiro confirme sua presença respondendo *VOU*.";
      }
      if (participant.paymentStatus === "PAID") return "Seu pagamento já está confirmado. Valeu! 💚";
      if (participant.paymentStatus === "EXEMPT" || match.priceCents === 0) return "Esta partida não tem cobrança. 😉";
      try {
        const charge = await getOrCreateCharge(participant.id);
        return (
          `Pague ${formatBRL(charge.amountCents)} com o Pix copia e cola abaixo:\n\n${charge.copyPaste}\n\n` +
          "Assim que a organização conferir, eu te aviso por aqui."
        );
      } catch (err) {
        return err instanceof Error ? err.message : "Não consegui gerar o Pix agora. Tente novamente.";
      }
    }
    case "list": {
      const list = await prisma.matchParticipant.findMany({
        where: { matchId: match.id, status: "CONFIRMED" },
        include: { member: true },
        orderBy: { confirmedAt: "asc" },
      });
      const names = list.map((p, i) => `${i + 1}. ${p.member.nickname ?? p.member.name}`).join("\n");
      return `📋 *${match.title}* — ${list.length}/${match.maxPlayers}\n${names || "Ninguém confirmou ainda."}`;
    }
  }
}

/** Envia o convite da partida para todos os jogadores com telefone (RF25). */
export async function broadcastMatchInvite(matchId: string) {
  const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
  const members = await prisma.clubMember.findMany({
    where: { clubId: match.clubId, active: true, phone: { not: null } },
  });
  const text = `${describeMatch(match)}\n\nResponda *VOU* para confirmar ou *NÃO VOU* se não puder.`;
  for (const m of members) await sendBotMessage(match.clubId, m.phone!, text);
  return { sent: members.length };
}

/** Lembra quem confirmou e ainda não pagou. */
export async function broadcastPaymentReminder(matchId: string) {
  const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
  const pending = await prisma.matchParticipant.findMany({
    where: { matchId, status: "CONFIRMED", paymentStatus: "PENDING" },
    include: { member: true },
  });
  let sent = 0;
  for (const p of pending) {
    if (!p.member.phone) continue;
    await sendBotMessage(
      match.clubId,
      p.member.phone,
      `Oi, ${p.member.nickname ?? p.member.name.split(" ")[0]}! Falta só o pagamento de *${match.title}* (${formatBRL(match.priceCents)}). Envie *PIX* para receber o código.`,
    );
    sent++;
  }
  return { sent };
}
