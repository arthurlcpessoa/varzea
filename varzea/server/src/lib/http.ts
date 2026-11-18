import type { ErrorRequestHandler } from "express";
import { ZodError, type ZodType } from "zod";

/** Erro com status HTTP e mensagem clara para o usuário (RNF15). */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

const FEMININE = new Set(["Partida", "Rota"]);
export const notFound = (what = "Recurso") =>
  new HttpError(404, `${what} não encontrad${FEMININE.has(what) ? "a" : "o"}.`, "NOT_FOUND");
export const forbidden = (msg = "Você não tem permissão para esta ação.") => new HttpError(403, msg, "FORBIDDEN");
export const badRequest = (msg: string) => new HttpError(400, msg, "BAD_REQUEST");
export const conflict = (msg: string) => new HttpError(409, msg, "CONFLICT");

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path.join(".");
    res.status(400).json({
      error: field ? `Campo "${field}": ${first.message}` : (first?.message ?? "Dados inválidos."),
      code: "VALIDATION",
      issues: err.issues,
    });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "JSON inválido no corpo da requisição.", code: "BAD_JSON" });
    return;
  }
  // Violação de unicidade do Prisma (evita registros duplicados — RNF13).
  if (err?.code === "P2002") {
    res.status(409).json({ error: "Já existe um registro com esses dados.", code: "DUPLICATE" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Erro interno. Tente novamente em instantes.", code: "INTERNAL" });
};
