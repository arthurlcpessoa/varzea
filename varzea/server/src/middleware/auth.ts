import type { NextFunction, Request, Response } from "express";
import type { ClubMember, Match } from "@prisma/client";
import { prisma } from "../db.js";
import { verifyToken } from "../lib/security.js";
import { can, type Permission } from "../lib/domain.js";
import { forbidden, HttpError, notFound } from "../lib/http.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      member?: ClubMember;
    }
  }
}

/** Exige um token JWT válido (RN02). */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return next(new HttpError(401, "Faça login para continuar.", "UNAUTHENTICATED"));
  const payload = verifyToken(token);
  if (!payload) return next(new HttpError(401, "Sessão expirada. Entre novamente.", "UNAUTHENTICATED"));
  req.userId = payload.sub;
  next();
}

export function userId(req: Request): string {
  if (!req.userId) throw new HttpError(401, "Faça login para continuar.", "UNAUTHENTICATED");
  return req.userId;
}

/**
 * Busca o vínculo ativo do usuário com o clube. Se não houver, responde 404 —
 * sem revelar se o clube existe — garantindo o isolamento entre clubes (RN19).
 */
export async function membershipOf(uid: string, clubId: string): Promise<ClubMember> {
  const member = await prisma.clubMember.findFirst({ where: { clubId, userId: uid, active: true } });
  if (!member) throw notFound("Clube");
  return member;
}

/** Middleware para rotas com :clubId — carrega req.member. */
export async function clubAccess(req: Request, _res: Response, next: NextFunction) {
  req.member = await membershipOf(userId(req), String(req.params.clubId));
  next();
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.member) return next(forbidden());
    if (!can(req.member.role, permission)) return next(forbidden());
    next();
  };
}

export function assertCan(member: ClubMember, permission: Permission) {
  if (!can(member.role, permission)) throw forbidden();
}

/** Carrega uma partida e o vínculo do usuário com o clube dela. */
export async function matchAccess(req: Request, matchId: string): Promise<{ match: Match; member: ClubMember }> {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw notFound("Partida");
  const member = await prisma.clubMember.findFirst({
    where: { clubId: match.clubId, userId: userId(req), active: true },
  });
  if (!member) throw notFound("Partida");
  return { match, member };
}
