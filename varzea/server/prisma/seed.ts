// Dados de demonstração: um clube com diretoria, comissão, jogadores e partidas.
// Login de demonstração: matheus@varzea.com / varzea123

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const days = (n: number, hour = 20) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** "Pelada de quarta", "Pelada de sexta"... de acordo com o dia real da partida. */
const peladaDe = (date: Date) =>
  `Pelada de ${date.toLocaleDateString("pt-BR", { weekday: "long" }).replace("-feira", "")}`;

async function main() {
  await prisma.club.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("varzea123", 10);
  const matheus = await prisma.user.create({
    data: { name: "Matheus Carvalho", nickname: "Matheus", phone: "5581999990001", email: "matheus@varzea.com", passwordHash },
  });
  const joao = await prisma.user.create({
    data: { name: "João Lucas", nickname: "João", phone: "5581999990002", email: "joao@varzea.com", passwordHash },
  });
  const bruno = await prisma.user.create({
    data: { name: "Bruno Silva", nickname: "Bruno", phone: "5581999990003", email: "bruno@varzea.com", passwordHash },
  });

  const club = await prisma.club.create({
    data: {
      name: "Resenha FC",
      city: "Recife",
      state: "PE",
      pixKey: "resenhafc@varzea.com",
      pixName: "Resenha FC",
      botConfig: { create: {} },
    },
  });

  const base = [
    { user: matheus, role: "DIRETORIA", position: "ATAQUE", skill: 4 },
    { user: joao, role: "COMISSAO", position: "MEIO", skill: 4 },
    { user: bruno, role: "JOGADOR", position: "ATAQUE", skill: 3 },
  ];
  const members = [];
  for (const b of base) {
    members.push(
      await prisma.clubMember.create({
        data: {
          clubId: club.id,
          userId: b.user.id,
          name: b.user.name,
          nickname: b.user.nickname,
          phone: b.user.phone,
          role: b.role,
          position: b.position,
          skill: b.skill,
        },
      }),
    );
  }

  const extra: [string, string, string, number][] = [
    ["Gustavo Dias", "Gustavo", "GOLEIRO", 4],
    ["Rafael Lima", "Rafa", "DEFESA", 3],
    ["André Souza", "Dedé", "DEFESA", 2],
    ["Carlos Melo", "Carlinhos", "MEIO", 3],
    ["Lucas Ferreira", "Lucão", "DEFESA", 4],
    ["Diego Costa", "Diego", "MEIO", 5],
    ["Pedro Alves", "Pedrinho", "ATAQUE", 3],
    ["Victor Hugo", "VH", "GOLEIRO", 3],
    ["Caio Nunes", "Caio", "MEIO", 2],
    ["Thiago Rocha", "Thiagão", "ATAQUE", 4],
    ["Felipe Santos", "Felipe", "DEFESA", 3],
  ];
  for (const [i, [name, nickname, position, skill]] of extra.entries()) {
    members.push(
      await prisma.clubMember.create({
        data: {
          clubId: club.id,
          name,
          nickname,
          phone: `55819999901${String(i).padStart(2, "0")}`,
          position,
          isGoalkeeper: position === "GOLEIRO",
          skill,
        },
      }),
    );
  }

  // Partida finalizada com placar e lances
  const past = await prisma.match.create({
    data: {
      clubId: club.id,
      title: peladaDe(days(-7)),
      startsAt: days(-7),
      location: "Arena Boa Viagem",
      maxPlayers: 14,
      priceCents: 2500,
      status: "FINISHED",
      elapsedSec: 90 * 60,
    },
  });
  for (const [i, m] of members.slice(0, 12).entries()) {
    await prisma.matchParticipant.create({
      data: {
        matchId: past.id,
        memberId: m.id,
        status: "CONFIRMED",
        paymentStatus: "PAID",
        team: i % 2 === 0 ? "A" : "B",
        confirmedAt: days(-9),
      },
    });
  }
  const goals: [number, number | null, "A" | "B", number][] = [
    [0, 4, "A", 180],
    [2, null, "B", 420],
    [0, 1, "A", 720],
    [8, 0, "A", 1900],
    [9, 2, "B", 2600],
  ];
  for (const [s, a, team, second] of goals) {
    await prisma.matchEvent.create({
      data: { matchId: past.id, team, scorerId: members[s].id, assistId: a === null ? null : members[a].id, second },
    });
  }

  // Próxima partida com confirmações e pagamentos variados
  const next = await prisma.match.create({
    data: {
      clubId: club.id,
      title: peladaDe(days(2)),
      startsAt: days(2),
      location: "Arena Boa Viagem",
      maxPlayers: 14,
      priceCents: 2500,
      notes: "Levar colete verde e preto.",
    },
  });
  for (const [i, m] of members.slice(0, 11).entries()) {
    await prisma.matchParticipant.create({
      data: {
        matchId: next.id,
        memberId: m.id,
        status: "CONFIRMED",
        paymentStatus: i < 7 ? "PAID" : "PENDING",
        confirmedAt: new Date(Date.now() - (11 - i) * 3600_000),
      },
    });
  }
  await prisma.matchParticipant.create({ data: { matchId: next.id, memberId: members[11].id, status: "DECLINED" } });

  await prisma.match.create({
    data: { clubId: club.id, title: peladaDe(days(9)), startsAt: days(9), location: "Arena Boa Viagem", maxPlayers: 14, priceCents: 2500 },
  });

  await prisma.announcement.create({
    data: { clubId: club.id, authorId: matheus.id, body: "Mensalidade do campo reajustada a partir do mês que vem. Valor da pelada segue R$ 25." },
  });

  console.log("✔ Banco populado. Login de demonstração: matheus@varzea.com / varzea123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
