import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { badRequest, conflict, HttpError, parse } from "../lib/http.js";
import { checkPassword, hashPassword, normalizePhone, randomToken, sha256, signToken } from "../lib/security.js";
import { requireAuth, userId } from "../middleware/auth.js";
import { permissionsFor } from "../lib/domain.js";

export const authRouter = Router();

// Decisão inicial para o ponto pendente nº 1: nome, e-mail e senha são
// obrigatórios; apelido e telefone são opcionais (o telefone é necessário
// apenas para interagir com o PELA-BOT).
const registerSchema = z.object({
  name: z.string().trim().min(2, "informe seu nome"),
  nickname: z.string().trim().max(30).optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.email("e-mail inválido").transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8, "a senha precisa ter pelo menos 8 caracteres"),
});

const publicUser = (u: { id: string; name: string; nickname: string | null; phone: string | null; email: string }) => ({
  id: u.id,
  name: u.name,
  nickname: u.nickname,
  phone: u.phone,
  email: u.email,
});

authRouter.post("/register", async (req, res) => {
  const data = parse(registerSchema, req.body);
  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) throw conflict("Já existe uma conta com este e-mail.");
  const user = await prisma.user.create({
    data: {
      name: data.name,
      nickname: data.nickname || null,
      phone: normalizePhone(data.phone),
      email: data.email,
      passwordHash: await hashPassword(data.password),
    },
  });
  res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = parse(
    z.object({ email: z.string().trim().toLowerCase(), password: z.string() }),
    req.body,
  );
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await checkPassword(password, user.passwordHash))) {
    throw new HttpError(401, "E-mail ou senha incorretos.", "INVALID_CREDENTIALS");
  }
  res.json({ token: signToken(user.id), user: publicUser(user) });
});

// Recuperação de acesso (RF04). A resposta é sempre a mesma para não revelar
// quais e-mails têm conta. Sem serviço de e-mail configurado, o link é exibido
// apenas em desenvolvimento (devResetUrl).
authRouter.post("/forgot", async (req, res) => {
  const { email } = parse(z.object({ email: z.string().trim().toLowerCase() }), req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  let devResetUrl: string | undefined;
  if (user) {
    const token = randomToken();
    await prisma.passwordReset.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    const url = `${config.appUrl}/redefinir-senha?token=${token}`;
    if (!config.isProduction) devResetUrl = url;
    // TODO: enviar `url` por e-mail quando houver provedor configurado.
  }
  res.json({ ok: true, message: "Se o e-mail estiver cadastrado, enviaremos as instruções.", devResetUrl });
});

authRouter.post("/reset", async (req, res) => {
  const { token, password } = parse(
    z.object({ token: z.string().min(10), password: z.string().min(8, "a senha precisa ter pelo menos 8 caracteres") }),
    req.body,
  );
  const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    throw badRequest("Link de recuperação inválido ou expirado. Solicite um novo.");
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await hashPassword(password) } }),
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
  ]);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: userId(req) },
    include: { memberships: { where: { active: true }, include: { club: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!user) throw new HttpError(401, "Sessão inválida. Entre novamente.", "UNAUTHENTICATED");
  res.json({
    user: publicUser(user),
    clubs: user.memberships.map((m) => ({
      id: m.club.id,
      name: m.club.name,
      city: m.club.city,
      state: m.club.state,
      role: m.role,
      memberId: m.id,
      permissions: permissionsFor(m.role),
    })),
  });
});

authRouter.patch("/me", requireAuth, async (req, res) => {
  const data = parse(
    z.object({
      name: z.string().trim().min(2).optional(),
      nickname: z.string().trim().max(30).nullable().optional(),
      phone: z.string().trim().nullable().optional(),
    }),
    req.body,
  );
  const uid = userId(req);
  const phone = data.phone === undefined ? undefined : normalizePhone(data.phone);
  const user = await prisma.user.update({
    where: { id: uid },
    data: { name: data.name, nickname: data.nickname, phone },
  });
  // Mantém os dados de jogador dos clubes em sincronia com o perfil.
  await prisma.clubMember.updateMany({
    where: { userId: uid },
    data: { name: data.name, nickname: data.nickname, phone },
  });
  res.json({ user: publicUser(user) });
});
