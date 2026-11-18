import { describe, expect, it } from "vitest";
import { api, auth, newUser } from "./helpers.js";

async function setupClub() {
  const owner = await newUser({ name: "Dono do Clube" });
  const club = await api()
    .post("/api/clubs")
    .set(auth(owner.token))
    .send({ name: "Resenha FC", city: "Recife", state: "pe", pixKey: "resenha@pix.com" });
  expect(club.status).toBe(201);
  return { owner, clubId: club.body.id as string };
}

async function joinAs(clubId: string, ownerToken: string, role = "JOGADOR") {
  const invite = await api().post(`/api/clubs/${clubId}/invites`).set(auth(ownerToken)).send({ role });
  expect(invite.status).toBe(201);
  const player = await newUser();
  const join = await api().post("/api/clubs/join").set(auth(player.token)).send({ code: invite.body.code });
  expect(join.status).toBe(200);
  return player;
}

describe("autenticação (RF01-RF04)", () => {
  it("cadastra, faz login e devolve o perfil", async () => {
    const { body, token } = await newUser({ email: "Maria@Teste.com" });
    const login = await api().post("/api/auth/login").send({ email: "maria@teste.com", password: body.password });
    expect(login.status).toBe(200);
    const me = await api().get("/api/auth/me").set(auth(token));
    expect(me.body.user.email).toBe("maria@teste.com");
  });

  it("recusa senha errada, e-mail duplicado e senha curta", async () => {
    const { body } = await newUser();
    expect((await api().post("/api/auth/login").send({ email: body.email, password: "x" })).status).toBe(401);
    expect((await api().post("/api/auth/register").send(body)).status).toBe(409);
    const short = await api().post("/api/auth/register").send({ ...body, email: "outro@x.com", password: "123" });
    expect(short.status).toBe(400);
    expect(short.body.error).toMatch(/8 caracteres/);
  });

  it("não guarda a senha em texto puro (RNF05)", async () => {
    const { prisma } = await import("../src/db.js");
    const { body } = await newUser();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: body.email.toLowerCase() } });
    expect(user.passwordHash).not.toContain(body.password);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("recupera o acesso com token de uso único", async () => {
    const { body } = await newUser();
    const forgot = await api().post("/api/auth/forgot").send({ email: body.email });
    const token = new URL(forgot.body.devResetUrl).searchParams.get("token");
    expect((await api().post("/api/auth/reset").send({ token, password: "nova-senha-123" })).status).toBe(200);
    expect((await api().post("/api/auth/reset").send({ token, password: "outra-senha-123" })).status).toBe(400);
    const login = await api().post("/api/auth/login").send({ email: body.email, password: "nova-senha-123" });
    expect(login.status).toBe(200);
  });

  it("exige autenticação nas rotas privadas (RN02)", async () => {
    expect((await api().get("/api/clubs")).status).toBe(401);
  });
});

describe("clubes e permissões (RN03-RN06, RN19, RN20)", () => {
  it("o criador vira diretoria e vê o clube", async () => {
    const { owner, clubId } = await setupClub();
    const club = await api().get(`/api/clubs/${clubId}`).set(auth(owner.token));
    expect(club.body.me.role).toBe("DIRETORIA");
    expect(club.body.state).toBe("PE");
  });

  it("isola os dados entre clubes", async () => {
    const { clubId } = await setupClub();
    const outsider = await newUser();
    expect((await api().get(`/api/clubs/${clubId}`).set(auth(outsider.token))).status).toBe(404);
    expect((await api().get(`/api/clubs/${clubId}/members`).set(auth(outsider.token))).status).toBe(404);
  });

  it("jogador não executa ações administrativas e não vê telefones de outros", async () => {
    const { owner, clubId } = await setupClub();
    const player = await joinAs(clubId, owner.token);
    const add = await api().post(`/api/clubs/${clubId}/members`).set(auth(player.token)).send({ name: "Fulano" });
    expect(add.status).toBe(403);
    const create = await api()
      .post(`/api/clubs/${clubId}/matches`)
      .set(auth(player.token))
      .send({ title: "X", startsAt: new Date().toISOString(), location: "Campo" });
    expect(create.status).toBe(403);
    const members = await api().get(`/api/clubs/${clubId}/members`).set(auth(player.token));
    const ownerRow = members.body.find((m: { role: string }) => m.role === "DIRETORIA");
    expect(ownerRow.phone).toBeUndefined();
  });

  it("comissão edita jogadores mas não atribui funções nem remove", async () => {
    const { owner, clubId } = await setupClub();
    const staff = await joinAs(clubId, owner.token, "COMISSAO");
    const member = await api()
      .post(`/api/clubs/${clubId}/members`)
      .set(auth(staff.token))
      .send({ name: "Gustavo", position: "GOLEIRO", phone: "(81) 98888-0000" });
    expect(member.status).toBe(201);
    expect(member.body.isGoalkeeper).toBe(true);
    expect(member.body.phone).toBe("5581988880000");

    const role = await api()
      .patch(`/api/clubs/${clubId}/members/${member.body.id}`)
      .set(auth(staff.token))
      .send({ role: "DIRETORIA" });
    expect(role.status).toBe(403);
    const del = await api().delete(`/api/clubs/${clubId}/members/${member.body.id}`).set(auth(staff.token));
    expect(del.status).toBe(403);
  });

  it("remover do clube tira o acesso sem apagar a conta", async () => {
    const { owner, clubId } = await setupClub();
    const player = await joinAs(clubId, owner.token);
    const me = await api().get("/api/auth/me").set(auth(player.token));
    const memberId = me.body.clubs[0].memberId;
    expect((await api().delete(`/api/clubs/${clubId}/members/${memberId}`).set(auth(owner.token))).status).toBe(204);
    expect((await api().get(`/api/clubs/${clubId}`).set(auth(player.token))).status).toBe(404);
    expect((await api().get("/api/auth/me").set(auth(player.token))).status).toBe(200);
  });

  it("não permite remover a última pessoa da diretoria", async () => {
    const { owner, clubId } = await setupClub();
    const me = await api().get("/api/auth/me").set(auth(owner.token));
    const res = await api().delete(`/api/clubs/${clubId}/members/${me.body.clubs[0].memberId}`).set(auth(owner.token));
    expect(res.status).toBe(400);
  });
});

describe("partidas, presença, pagamentos e jogo ao vivo", () => {
  async function setupMatch(maxPlayers = 2) {
    const { owner, clubId } = await setupClub();
    const match = await api()
      .post(`/api/clubs/${clubId}/matches`)
      .set(auth(owner.token))
      .send({
        title: "Pelada de quarta",
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        location: "Arena",
        maxPlayers,
        priceCents: 2500,
      });
    expect(match.status).toBe(201);
    return { owner, clubId, matchId: match.body.id as string };
  }

  it("confirma até lotar, manda o resto para a espera e promove quando alguém desiste", async () => {
    const { owner, clubId, matchId } = await setupMatch(2);
    const p1 = await joinAs(clubId, owner.token);
    const p2 = await joinAs(clubId, owner.token);
    const p3 = await joinAs(clubId, owner.token);

    for (const p of [p1, p2]) {
      const r = await api().post(`/api/matches/${matchId}/attendance`).set(auth(p.token)).send({ status: "CONFIRMED" });
      expect(r.body.me.status).toBe("CONFIRMED");
    }
    const waiting = await api().post(`/api/matches/${matchId}/attendance`).set(auth(p3.token)).send({ status: "CONFIRMED" });
    expect(waiting.body.me.status).toBe("WAITLIST");

    await api().post(`/api/matches/${matchId}/attendance`).set(auth(p1.token)).send({ status: "DECLINED" });
    const after = await api().get(`/api/matches/${matchId}`).set(auth(p3.token));
    expect(after.body.me.status).toBe("CONFIRMED");
    expect(after.body.counts.confirmed).toBe(2);
  });

  it("gera Pix copia e cola e a diretoria confirma o pagamento", async () => {
    const { owner, clubId, matchId } = await setupMatch(5);
    const p1 = await joinAs(clubId, owner.token);
    await api().post(`/api/matches/${matchId}/attendance`).set(auth(p1.token)).send({ status: "CONFIRMED" });
    const charge = await api().post(`/api/matches/${matchId}/payment/charge`).set(auth(p1.token));
    expect(charge.status).toBe(200);
    expect(charge.body.copyPaste).toMatch(/^000201.*br\.gov\.bcb\.pix.*540525\.00.*6304[0-9A-F]{4}$/);

    const detail = await api().get(`/api/matches/${matchId}`).set(auth(p1.token));
    const forbidden = await api()
      .post(`/api/matches/${matchId}/payments/${detail.body.me.participantId}/confirm`)
      .set(auth(p1.token));
    expect(forbidden.status).toBe(403);

    const ok = await api()
      .post(`/api/matches/${matchId}/payments/${detail.body.me.participantId}/confirm`)
      .set(auth(owner.token));
    const mine = ok.body.people.find((p: { memberId: string }) => p.memberId === detail.body.me.memberId);
    expect(mine.paymentStatus).toBe("PAID");

    const finance = await api().get(`/api/clubs/${clubId}/finance`).set(auth(owner.token));
    expect(finance.body.receivedCents).toBe(2500);
    expect(finance.body.history[0].status).toBe("CONFIRMED");
  });

  it("sorteia times equilibrados com os confirmados", async () => {
    const { owner, clubId, matchId } = await setupMatch(10);
    const players = [];
    for (let i = 0; i < 6; i++) players.push(await joinAs(clubId, owner.token));
    for (const p of players) {
      await api().post(`/api/matches/${matchId}/attendance`).set(auth(p.token)).send({ status: "CONFIRMED" });
    }
    const draw = await api().post(`/api/matches/${matchId}/teams/draw`).set(auth(owner.token)).send({});
    expect(draw.status).toBe(200);
    const a = draw.body.people.filter((p: { team: string }) => p.team === "A");
    const b = draw.body.people.filter((p: { team: string }) => p.team === "B");
    expect(a.length).toBe(3);
    expect(b.length).toBe(3);
  });

  it("controla cronômetro, registra gols e encerra a partida", async () => {
    const { owner, clubId, matchId } = await setupMatch(10);
    const me = await api().get("/api/auth/me").set(auth(owner.token));
    const scorer = me.body.clubs.find((c: { id: string }) => c.id === clubId).memberId;

    expect((await api().post(`/api/matches/${matchId}/events`).set(auth(owner.token)).send({ team: "A" })).status).toBe(400);
    const started = await api().post(`/api/matches/${matchId}/live/start`).set(auth(owner.token));
    expect(started.body.status).toBe("LIVE");
    expect(started.body.timer.running).toBe(true);

    await api().post(`/api/matches/${matchId}/events`).set(auth(owner.token)).send({ team: "A", scorerId: scorer });
    await api().post(`/api/matches/${matchId}/events`).set(auth(owner.token)).send({ team: "B" });
    const paused = await api().post(`/api/matches/${matchId}/live/pause`).set(auth(owner.token));
    expect(paused.body.timer.running).toBe(false);
    expect(paused.body.score).toEqual({ A: 1, B: 1 });

    const finished = await api().post(`/api/matches/${matchId}/live/finish`).set(auth(owner.token));
    expect(finished.body.status).toBe("FINISHED");

    const stats = await api().get(`/api/clubs/${clubId}/stats`).set(auth(owner.token));
    expect(stats.body.results[0]).toMatchObject({ scoreA: 1, scoreB: 1 });
    expect(stats.body.players.find((p: { memberId: string }) => p.memberId === scorer).goals).toBe(1);
  });
});

describe("PELA-BOT (RF24-RF27)", () => {
  it("confirma presença, lista e envia Pix por mensagem", async () => {
    const { owner, clubId } = await setupClub();
    await api()
      .post(`/api/clubs/${clubId}/matches`)
      .set(auth(owner.token))
      .send({ title: "Pelada", startsAt: new Date(Date.now() + 86400000).toISOString(), location: "Arena", priceCents: 2000 });
    await api().post(`/api/clubs/${clubId}/members`).set(auth(owner.token)).send({ name: "Zé", phone: "81977776666" });

    const send = (text: string) =>
      api().post(`/api/bot/webhook/${clubId}`).send({ from: "+55 (81) 97777-6666", text });

    expect((await send("oi")).body.reply).toMatch(/Comandos/);
    expect((await send("Vou!")).body.reply).toMatch(/Presença confirmada/);
    expect((await send("lista")).body.reply).toMatch(/1\/20[\s\S]*Zé/);
    expect((await send("pix")).body.reply).toMatch(/000201/);
    expect((await send("não vou")).body.reply).toMatch(/ausência/);

    const stranger = await api().post(`/api/bot/webhook/${clubId}`).send({ from: "81900000000", text: "vou" });
    expect(stranger.body.reply).toMatch(/Não encontrei/);
  });
});
